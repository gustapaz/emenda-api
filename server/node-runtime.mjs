import { readFileSync } from "node:fs";
import { createEngine } from "./core.mjs";
import { createHandler } from "./http.mjs";
import { createService } from "./service.mjs";
export const engine = createEngine(
  new WebAssembly.Module(
    readFileSync(new URL("../engine/pkg/emenda.wasm", import.meta.url)),
  ),
);
export const handle = createHandler(createService(engine));
