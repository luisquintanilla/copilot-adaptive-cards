import { parentPort, workerData } from "node:worker_threads";
import { compile, normalizeSubmission } from "./pipeline.js";
import { WorkbenchError } from "./model.js";
try {
  const result = workerData.kind === "submission"
    ? normalizeSubmission(workerData.document, workerData.actionId, workerData.inputs)
    : compile(workerData.document);
  parentPort?.postMessage({ result });
} catch (error) {
  parentPort?.postMessage({
    error: {
      code: error instanceof WorkbenchError ? error.code : "expansion_failed",
      message: error instanceof Error ? error.message : "Expansion failed.",
      diagnostics: error instanceof WorkbenchError ? error.diagnostics : [
        { stage: "binding", code: "expansion_failed", path: "/", message: error instanceof Error ? error.message : "Expansion failed." }
      ]
    }
  });
}
