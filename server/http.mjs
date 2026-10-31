export class InputError extends Error {
  constructor(code, message, status = 422) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
export const invalid = (code, message) => {
  throw new InputError(code, message);
};
export const object = (v) =>
  v !== null && typeof v === "object" && !Array.isArray(v);
export function exact(v, allowed, where) {
  if (!object(v) || Object.keys(v).some((k) => !allowed.includes(k)))
    invalid(
      "invalid_input",
      "Objeto inválido ou propriedade desconhecida: " + where,
    );
}
async function read(request) {
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    throw new InputError(
      "unsupported_media_type",
      "Use application/json.",
      415,
    );
  if (
    request.headers.has("content-encoding") &&
    request.headers.get("content-encoding") !== "identity"
  )
    throw new InputError(
      "unsupported_encoding",
      "Corpo comprimido não é aceito.",
      415,
    );
  const reader = request.body?.getReader();
  if (!reader)
    throw new InputError("invalid_json", "Envie um objeto JSON.", 400);
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 131072) {
        await reader.cancel();
        throw new InputError(
          "body_too_large",
          "Limite de 128 KiB por requisição.",
          413,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new InputError("invalid_json", "JSON ou UTF-8 inválido.", 400);
  }
}
export function createHandler(service) {
  return async (request) => {
    const id = crypto.randomUUID();
    let response;
    try {
      const origin = request.headers.get("origin");
      if (origin && origin !== new URL(request.url).origin)
        throw new InputError(
          "origin_denied",
          "Origem de navegador não autorizada.",
          403,
        );
      const path = new URL(request.url).pathname;
      if (request.method === "GET" && path === "/api/health") {
        if (!service.health()) throw new Error("Engine health check failed");
        response = Response.json({
          status: "ok",
          engine: service.meta.engine,
          engine_check: true,
          storage: "none",
          version: "1.0.0",
        });
      } else if (request.method === "GET" && path === "/api/v1/examples")
        response = Response.json({ items: service.meta.examples });
      else if (request.method === "GET" && path === "/api/openapi.json")
        response = Response.json(specification(service));
      else if (request.method === "POST" && service.actions[path])
        response = Response.json(
          service.actions[path].run(await read(request)),
        );
      else throw new InputError("not_found", "Endpoint não encontrado.", 404);
    } catch (error) {
      const known = error instanceof InputError,
        status = known ? error.status : 500,
        code = known ? error.code : "internal_error";
      response = new Response(
        JSON.stringify({
          type: "urn:portfolio:error:" + code,
          title: known
            ? error.message
            : "Não foi possível processar a requisição.",
          status,
          code,
          request_id: id,
        }),
        { status, headers: { "Content-Type": "application/problem+json" } },
      );
    }
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Request-Id", id);
    return new Response(response.body, { status: response.status, headers });
  };
}
export function specification(service) {
  const problem = {
    type: "object",
    required: ["type", "title", "status", "code", "request_id"],
    properties: {
      type: { type: "string" },
      title: { type: "string" },
      status: { type: "integer" },
      code: { type: "string" },
      request_id: { type: "string", format: "uuid" },
    },
  };
  const errors = Object.fromEntries(
    [400, 403, 404, 409, 413, 415, 422, 500].map((status) => [
      status,
      {
        description: "Erro estruturado.",
        content: { "application/problem+json": { schema: problem } },
      },
    ]),
  );
  const paths = Object.fromEntries(
    Object.entries(service.actions).map(([path, a]) => [
      path,
      {
        post: {
          summary: a.label,
          description: a.description,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: a.input,
                example: a.example ?? service.meta.examples[0].input,
              },
            },
          },
          responses: {
            200: {
              description: "Resultado real do motor no servidor.",
              content: { "application/json": { schema: a.output } },
            },
            ...errors,
          },
        },
      },
    ]),
  );
  const ok = (description, schema) => ({
    description,
    content: { "application/json": { schema } },
  });
  const healthSchema = {
    type: "object",
    properties: {
      status: { type: "string" },
      engine: { type: "string" },
      engine_check: { type: "boolean" },
      storage: { type: "string" },
      version: { type: "string" },
    },
  };
  paths["/api/health"] = {
    get: {
      summary: "Verificar motor com cálculo real",
      responses: { 200: ok("Estado do motor", healthSchema), ...errors },
    },
  };
  const itemSchema = {
    type: "object",
    properties: {
      name: { type: "string" },
      input: service.actions[service.meta.primary].input,
    },
  };
  const examplesSchema = {
    type: "object",
    properties: { items: { type: "array", items: itemSchema } },
  };
  paths["/api/v1/examples"] = {
    get: {
      summary: "Exemplos sintéticos executáveis",
      responses: { 200: ok("Lista de exemplos", examplesSchema), ...errors },
    },
  };
  return {
    openapi: "3.0.3",
    info: {
      title: service.meta.title,
      version: "1.0.0",
      description:
        service.meta.description +
        " Serviço público e sem armazenamento. Limite de 128 KiB por corpo JSON. " +
        service.meta.limits,
    },
    servers: [{ url: "/" }],
    paths,
  };
}
