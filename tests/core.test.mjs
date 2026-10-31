import { test } from "node:test";
import assert from "node:assert/strict";
import { engine, handle } from "../server/node-runtime.mjs";
for (const [before, after] of [
  ["", ""],
  ["", "a"],
  ["a", ""],
  ["a", "a\n"],
  ["a\r\nb", "b\r\na"],
  ["🦊\ncafé", "🦊\nchá"],
  ["\n", "\n\n"],
  ["a\nb\na", "b\na\nb"],
])
  test("exact text roundtrip " + JSON.stringify([before, after]), () => {
    const diff = engine.diff({ before, after }),
      applied = engine.apply({ before, patch: diff.patch });
    assert.equal(applied.text, after);
    assert.equal(applied.verified, true);
  });
test("deterministic minimal edits and deletion-first ties", () => {
  const r = engine.diff({ before: "a\nb", after: "b\na" });
  assert.deepEqual(r.stats, { inserted: 1, deleted: 1, equal: 1 });
  assert.equal(r.patch.edits[0].op, "delete");
  assert.deepEqual(r, engine.diff({ before: "a\nb", after: "b\na" }));
});
test("base, operation text and destination preconditions detect tampering", () => {
  const d = engine.diff({ before: "a", after: "b" });
  assert.throws(
    () => engine.apply({ before: "other", patch: d.patch }),
    (e) => e.status === 409 && e.code === "base_conflict",
  );
  const p = structuredClone(d.patch);
  p.edits[0].text = "tampered";
  assert.throws(
    () => engine.apply({ before: "a", patch: p }),
    (e) => e.status === 409,
  );
  p.edits = d.patch.edits;
  p.target_sha256 = "0".repeat(64);
  assert.throws(
    () => engine.apply({ before: "a", patch: p }),
    (e) => e.code === "target_conflict",
  );
});
test("incomplete base consumption is rejected", () => {
  const d = engine.diff({ before: "a\nb", after: "a" });
  d.patch.edits = d.patch.edits.slice(0, 1);
  assert.throws(
    () => engine.apply({ before: "a\nb", patch: d.patch }),
    (e) => e.code === "patch_conflict",
  );
});
test("invalid and unknown patch fields rejected", () => {
  const d = engine.diff({ before: "", after: "" });
  for (const p of [
    { ...d.patch, edits: null },
    { ...d.patch, edits: [{ op: "insert" }] },
    { ...d.patch, surprise: 1 },
    { ...d.patch, edits: [{ op: "exec", text: "" }] },
  ])
    assert.throws(
      () => engine.apply({ before: "", patch: p }),
      (e) => e.status === 422,
    );
});
test("text limits, Unicode surrogate and excessive LF tokens", () => {
  for (const before of [
    "x".repeat(4097),
    Array(121).fill("a").join("\n"),
    "\ud800",
  ])
    assert.throws(
      () => engine.diff({ before, after: "" }),
      (e) => e.status === 422,
    );
});
test("100 seeded text pairs roundtrip with minimal edit count from independent LCS oracle", () => {
  let seed = 177;
  const rand = (n) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % n;
  };
  function lcs(a, b) {
    let row = Array(b.length + 1).fill(0);
    for (const x of a) {
      const next = [0];
      b.forEach((y, i) =>
        next.push(x === y ? row[i] + 1 : Math.max(row[i + 1], next[i])),
      );
      row = next;
    }
    return row[b.length];
  }
  for (let i = 0; i < 100; i++) {
    const a = Array.from({ length: 1 + rand(8) }, () => String(rand(4))),
      b = Array.from({ length: 1 + rand(8) }, () => String(rand(4))),
      before = a.join("\n"),
      after = b.join("\n"),
      r = engine.diff({ before, after });
    assert.equal(
      r.stats.inserted + r.stats.deleted,
      a.length + b.length - 2 * lcs(a, b),
    );
    assert.equal(engine.apply({ before, patch: r.patch }).text, after);
  }
});
test("apply conflict is exposed as HTTP 409", async () => {
  const patch = engine.diff({ before: "a", after: "b" }).patch;
  const r = await handle(
    new Request("https://emenda.test/api/v1/apply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ before: "wrong", patch }),
    }),
  );
  assert.equal(r.status, 409);
  assert.equal((await r.json()).code, "base_conflict");
});
