import { runSingleTrial } from "../engine/ExperimentRunner";
import type { ExperimentResult, ExperimentSpec } from "../types/simulation";

interface InMessage {
  spec: ExperimentSpec;
}

type OutMessage =
  | { type: "progress"; current: number; total: number }
  | { type: "done"; results: ExperimentResult[] }
  | { type: "error"; message: string };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<InMessage>) => void) | null;
  postMessage: (data: OutMessage) => void;
};

scope.onmessage = (event) => {
  try {
    const spec = event.data.spec;
    const trials = Math.max(1, Math.floor(spec.trials));
    const results: ExperimentResult[] = [];
    for (let i = 0; i < trials; i++) {
      results.push(runSingleTrial(spec, i));
      scope.postMessage({ type: "progress", current: i + 1, total: trials });
    }
    scope.postMessage({ type: "done", results });
  } catch (error) {
    scope.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
