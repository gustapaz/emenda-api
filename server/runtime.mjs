import wasm from "../engine/pkg/emenda.wasm";
import { createEngine } from "./core.mjs";
import { createHandler } from "./http.mjs";
import { createService } from "./service.mjs";
export const handle = createHandler(createService(createEngine(wasm)));
