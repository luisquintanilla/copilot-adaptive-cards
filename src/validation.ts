import { Worker } from "node:worker_threads";
import { WorkbenchError, type Document, type ObjectValue } from "./model.js";

async function run(payload: ObjectValue): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./expansion-worker.mjs", import.meta.url), {
      workerData: payload, resourceLimits: { maxOldGenerationSizeMb: 128 }
    });
    let finished = false;
    const finish = (error?: Error, result?: unknown) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      void worker.terminate();
      if (error) reject(error);
      else resolve(result);
    };
    const timer = setTimeout(() => finish(new WorkbenchError("evaluation_timeout", "Validation/expansion exceeded its 2-second deadline.")), 2000);
    worker.once("message", message => {
      if (message.error) finish(new WorkbenchError(message.error.code, message.error.message, message.error.diagnostics));
      else finish(undefined, message.result);
    });
    worker.once("error", error => finish(error));
    worker.once("exit", code => { if (!finished) finish(new WorkbenchError("worker_exit", `Validation worker exited without a result (${code}).`)); });
  });
}
export async function validateDocument(document: unknown): Promise<{ document: Document; expanded: ObjectValue }> {
  return await run({ kind: "compile", document }) as { document: Document; expanded: ObjectValue };
}
export async function validateSubmission(document: Document, actionId: string, inputs: unknown): Promise<ObjectValue> {
  return await run({ kind: "submission", document, actionId, inputs }) as ObjectValue;
}
