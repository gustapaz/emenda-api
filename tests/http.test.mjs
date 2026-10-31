import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { handle } from "../server/node-runtime.mjs";
import { meta } from "../server/meta.mjs";
let server, base;
before(async () => {
  server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const response = await handle(
      new Request(new URL(req.url, base), {
        method: req.method,
        headers: req.headers,
        ...(["GET", "HEAD"].includes(req.method)
          ? {}
          : { body: Buffer.concat(chunks) }),
      }),
    );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = "http://127.0.0.1:" + server.address().port;
});
after(() => new Promise((resolve) => server.close(resolve)));
const post = (input, path = meta.primary, headers = {}) =>
  fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof input === "string" ? input : JSON.stringify(input),
  });
const at = (v, key) => key.split(".").reduce((v, k) => v?.[k], v);
for (const sample of meta.examples)
  test("real HTTP: " + sample.name, async () => {
    const response = await post(sample.input);
    assert.equal(response.status, 200);
    const value = await response.json();
    for (const [k, v] of Object.entries(sample.expected))
      assert.deepEqual(at(value, k), v);
  });
test("secondary operation", async () => {
  const response = await post(meta.examples[0].input, meta.secondary);
  assert.equal(response.status, 200);
  const value = await response.json();
  for (const [k, v] of Object.entries(meta.secondaryExpected))
    assert.deepEqual(at(value, k), v);
});
test("health exercises engine and docs match routes", async () => {
  const h = await (await fetch(base + "/api/health")).json();
  assert.equal(h.engine_check, true);
  assert.equal(h.engine, meta.engine);
  const spec = await (await fetch(base + "/api/openapi.json")).json();
  assert.ok(spec.paths[meta.primary]);
  assert.ok(spec.paths[meta.secondary]);
  assert.equal(
    (await (await fetch(base + "/api/v1/examples")).json()).items.length,
    meta.examples.length,
  );
});
test("malformed JSON, invalid contract, media, origin, missing endpoint", async () => {
  for (const [r, status] of [
    [await post("{"), 400],
    [await post({}), 422],
    [await post({}, meta.primary, { "content-type": "text/plain" }), 415],
    [
      await post(meta.examples[0].input, meta.primary, {
        origin: "https://other.example",
      }),
      403,
    ],
    [await fetch(base + "/missing"), 404],
  ]) {
    assert.equal(r.status, status);
    assert.equal(r.headers.get("content-type"), "application/problem+json");
    const p = await r.json();
    assert.equal(p.status, status);
    assert.equal(p.request_id, r.headers.get("x-request-id"));
    assert.equal(p.stack, undefined);
  }
});
test("stream limit counts actual bytes without Content-Length", async () => {
  const r = await handle(
    new Request("https://test.example" + meta.primary, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: " ".repeat(131073),
    }),
  );
  assert.equal(r.status, 413);
});
test("UTF8 validation and compressed body rejected", async () => {
  const r = await handle(
    new Request("https://test.example" + meta.primary, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new Uint8Array([255]),
    }),
  );
  assert.equal(r.status, 400);
  assert.equal(
    (await post("{}", meta.primary, { "content-encoding": "gzip" })).status,
    415,
  );
});
test("same origin and cache/security headers", async () => {
  const r = await post(meta.examples[0].input, meta.primary, { origin: base });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.equal(r.headers.get("access-control-allow-origin"), null);
});
test("parallel requests are isolated and deterministic", async () => {
  const values = await Promise.all(
    Array.from({ length: 8 }, () =>
      post(meta.examples[0].input).then((r) => r.json()),
    ),
  );
  for (const value of values) assert.deepEqual(value, values[0]);
});
