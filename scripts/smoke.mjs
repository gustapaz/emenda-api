import assert from "node:assert/strict";
import { meta } from "../server/meta.mjs";
const base = process.argv[2];
if (!base || !["http:", "https:"].includes(new URL(base).protocol))
  throw new Error("Use npm run smoke -- URL");
const at = (v, key) => key.split(".").reduce((v, k) => v?.[k], v);
const h = await fetch(new URL("/api/health", base));
assert.equal(h.status, 200);
assert.equal((await h.json()).engine_check, true);
for (const sample of meta.examples) {
  const response = await fetch(new URL(meta.primary, base), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(sample.input),
  });
  assert.equal(response.status, 200);
  const value = await response.json();
  for (const [key, expected] of Object.entries(sample.expected))
    assert.deepEqual(at(value, key), expected);
}
const secondary = await fetch(new URL(meta.secondary, base), {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(meta.examples[0].input),
});
assert.equal(secondary.status, 200);
const second = await secondary.json();
for (const [k, v] of Object.entries(meta.secondaryExpected))
  assert.deepEqual(at(second, k), v);
const invalid = await fetch(new URL(meta.primary, base), {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{}",
});
assert.equal(invalid.status, 422);
const spec = await (await fetch(new URL("/api/openapi.json", base))).json();
assert.equal(spec.info.title, meta.title);
console.log(
  JSON.stringify(
    {
      ok: true,
      base: new URL(base).origin,
      checks: [
        "health executes engine",
        "all domain examples",
        "secondary operation",
        "validation",
        "OpenAPI",
      ],
    },
    null,
    2,
  ),
);
