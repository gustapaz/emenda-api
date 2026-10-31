import { meta } from "./meta.mjs";
const text = {
  type: "string",
  description: "Até 4096 bytes UTF-8 e 120 tokens LF. Unicode bem formado.",
};
const edit = {
  type: "object",
  additionalProperties: false,
  required: ["op", "text"],
  properties: {
    op: { type: "string", enum: ["equal", "delete", "insert"] },
    text: { type: "string" },
  },
};
const patch = {
  type: "object",
  additionalProperties: false,
  required: ["base_sha256", "target_sha256", "edits"],
  properties: {
    base_sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
    target_sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
    edits: { type: "array", maxItems: 240, items: edit },
  },
};
const input = {
  type: "object",
  additionalProperties: false,
  required: ["before", "after"],
  properties: { before: text, after: text },
};
const stats = {
  type: "object",
  required: ["inserted", "deleted", "equal"],
  properties: {
    inserted: { type: "integer" },
    deleted: { type: "integer" },
    equal: { type: "integer" },
  },
};
const output = {
  type: "object",
  required: ["engine", "stats", "patch"],
  properties: { engine: { type: "string" }, stats, patch },
};
export function createService(engine) {
  const example = meta.examples[0].input;
  return {
    meta,
    health: () => engine.roundtrip(example).verified,
    actions: {
      [meta.primary]: {
        label: "Calcular diff e patch",
        description: meta.behavior,
        input,
        output,
        run: engine.diff,
      },
      [meta.secondary]: {
        label: "Calcular e aplicar patch, verificando destino",
        description: "Executa diff e apply no motor Go, sem persistência.",
        input,
        output: {
          ...output,
          required: [...output.required, "verified", "sha256"],
          properties: {
            ...output.properties,
            verified: { type: "boolean" },
            sha256: { type: "string" },
          },
        },
        run: engine.roundtrip,
      },
      "/api/v1/apply": {
        label: "Aplicar um patch em uma base",
        description:
          "Conflitos de base, conteúdo ou hash de destino retornam 409. Digest não é assinatura.",
        input: {
          type: "object",
          additionalProperties: false,
          required: ["before", "patch"],
          properties: { before: text, patch },
        },
        get example() {
          return { before: example.before, patch: engine.diff(example).patch };
        },
        output: {
          type: "object",
          required: ["engine", "text", "sha256", "verified"],
          properties: {
            engine: { type: "string" },
            text,
            sha256: { type: "string" },
            verified: { type: "boolean" },
          },
        },
        run: engine.apply,
      },
    },
  };
}
