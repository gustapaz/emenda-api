import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
const go = process.env.GO_BIN ?? "go";
function run(args, env = process.env) {
  const r = spawnSync(go, args, { cwd: "engine", env, stdio: "inherit" });
  if (r.error) throw r.error;
  if (r.status !== 0) process.exit(r.status ?? 1);
}
run(["test", "./..."]);
mkdirSync("engine/pkg", { recursive: true });
run(["build", "-trimpath", "-ldflags=-s -w", "-o", "pkg/emenda.wasm", "."], {
  ...process.env,
  GOOS: "wasip1",
  GOARCH: "wasm",
  CGO_ENABLED: "0",
});
console.log("Go native tests passed; WASI module built.");
