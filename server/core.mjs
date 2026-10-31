import { WASI, File, OpenFile } from "@bjorn3/browser_wasi_shim";
import { exact, InputError, invalid } from "./http.mjs";
function text(v) {
  if (
    typeof v !== "string" ||
    new TextEncoder().encode(v).byteLength > 4096 ||
    v.split("\n").length > 120
  )
    invalid("text_limit", "Textos devem ter até 4096 bytes e 120 tokens LF.");
  for (const p of v) {
    const c = p.codePointAt(0);
    if (c >= 0xd800 && c <= 0xdfff)
      invalid("invalid_unicode", "Texto contém surrogate Unicode isolado.");
  }
}
export function createEngine(module) {
  function invoke(input) {
    const stdout = new File([]),
      stderr = new File([]);
    const wasi = new WASI(
      [],
      [],
      [
        new OpenFile(new File(new TextEncoder().encode(JSON.stringify(input)))),
        new OpenFile(stdout),
        new OpenFile(stderr),
      ],
      { debug: false },
    );
    const instance = new WebAssembly.Instance(module, {
      wasi_snapshot_preview1: wasi.wasiImport,
    });
    const code = wasi.start(instance);
    if (code !== 0) throw new Error("Go WASI execution failed");
    const output = JSON.parse(new TextDecoder().decode(stdout.data));
    if (output.error)
      throw new InputError(
        output.error.code,
        output.error.message,
        output.error.status,
      );
    return output.data;
  }
  const diff = (input) => {
    exact(input, ["before", "after"], "diff");
    text(input.before);
    text(input.after);
    return invoke({ ...input, action: "diff" });
  };
  const apply = (input) => {
    exact(input, ["before", "patch"], "apply");
    text(input.before);
    exact(input.patch, ["base_sha256", "target_sha256", "edits"], "patch");
    if (
      !Array.isArray(input.patch.edits) ||
      input.patch.edits.length > 240 ||
      !["base_sha256", "target_sha256"].every(
        (k) =>
          typeof input.patch[k] === "string" &&
          /^[a-f0-9]{64}$/.test(input.patch[k]),
      )
    )
      invalid("invalid_patch", "Patch ou digests inválidos.");
    for (const edit of input.patch.edits) {
      exact(edit, ["op", "text"], "operação");
      if (
        typeof edit.text !== "string" ||
        !["equal", "delete", "insert"].includes(edit.op)
      )
        invalid("invalid_patch", "Operação inválida.");
      text(edit.text);
    }
    return invoke({ ...input, action: "apply" });
  };
  const roundtrip = (input) => {
    const report = diff(input),
      result = apply({ before: input.before, patch: report.patch });
    return {
      engine: "go-wasi",
      verified: result.text === input.after,
      sha256: result.sha256,
      stats: report.stats,
      patch: report.patch,
    };
  };
  return { diff, apply, roundtrip };
}
