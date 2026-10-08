import { useRef, useState } from "react";
import { Download } from "lucide-react";
import { runExperimentChunked, summarizeByAlgorithm, type ModeSummary } from "../engine/ExperimentRunner";
import { useSimulationStore } from "../store/simulationStore";
import type { AlgorithmMode, ExperimentResult, ExperimentSpec, MazeType } from "../types/simulation";
import { downloadText, resultsToCsv, resultsToJson } from "../utils/exportResults";

interface FormState {
  algorithm: AlgorithmMode;
  mazeType: MazeType;
  population: number;
  seed: number;
  duration: number;
  trials: number;
  disruption: boolean;
  disruptionFraction: number;
}

export function ExperimentPanel() {
  const config = useSimulationStore((state) => state.config);
  const results = useSimulationStore((state) => state.experimentResults);
  const running = useSimulationStore((state) => state.experimentRunning);
  const progress = useSimulationStore((state) => state.experimentProgress);
  const error = useSimulationStore((state) => state.experimentError);
  const [form, setForm] = useState<FormState>({
    algorithm: config.mode,
    mazeType: config.mazeType === "empty" ? "backtracking" : config.mazeType,
    population: config.population,
    seed: config.seed,
    duration: 40,
    trials: 3,
    disruption: true,
    disruptionFraction: 0.55,
  });
  const stop = useRef(false);
  const summaries = summarizeByAlgorithm(results);

  const specFor = (algorithm: AlgorithmMode): ExperimentSpec => ({
    algorithm,
    mazeType: form.mazeType,
    population: form.population,
    seed: form.seed,
    duration: form.duration,
    trials: form.trials,
    disruption: form.disruption,
    disruptionFraction: form.disruptionFraction,
    config: useSimulationStore.getState().config,
  });

  const execute = async (algorithms: AlgorithmMode[]) => {
    const store = useSimulationStore.getState();
    stop.current = false;
    store.setExperimentError(null);
    store.setExperimentRunning(true);
    store.setExperimentResults([]);
    try {
      for (const algorithm of algorithms) {
        if (stop.current) break;
        const spec = specFor(algorithm);
        let batch: ExperimentResult[];
        try {
          batch = await runInWorker(spec, (current, total) => {
            useSimulationStore.getState().setExperimentProgress(current, total * algorithms.length);
          });
        } catch (workerError) {
          batch = await runExperimentChunked(
            spec,
            (current, total) => useSimulationStore.getState().setExperimentProgress(current, total),
            () => stop.current,
          );
          if (workerError instanceof Error) {
            useSimulationStore.getState().setExperimentError(`Worker unavailable (${workerError.message}). Ran on the main thread.`);
          }
        }
        useSimulationStore.getState().appendExperimentResults(batch);
      }
    } catch (failure) {
      useSimulationStore.getState().setExperimentError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      useSimulationStore.getState().setExperimentRunning(false);
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-lg font-semibold text-slate-100">Repeated trials</h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-400">
          Trials share the world settings in the simulation sidebar, then override mode, maze, population, and seed. Trial i uses seed + i. The ACO arm is an implemented pheromone baseline, not a claim that every published ACO equation was reproduced. Unavailable measurements stay blank.
        </p>
        <div className="mt-4 grid gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4 md:grid-cols-4">
          <Field label="Algorithm">
            <select value={form.algorithm} onChange={(event) => setForm({ ...form, algorithm: event.target.value as AlgorithmMode })}>
              <option value="random">Random exploration</option>
              <option value="aco">ACO-inspired</option>
              <option value="coa">Chaos of the Ants</option>
            </select>
          </Field>
          <Field label="Maze">
            <select value={form.mazeType} onChange={(event) => setForm({ ...form, mazeType: event.target.value as MazeType })}>
              <option value="backtracking">Backtracking</option>
              <option value="division">Division</option>
              <option value="obstacles">Obstacle field</option>
              <option value="empty">Empty chamber</option>
            </select>
          </Field>
          <NumberField label="Agents" value={form.population} min={1} max={2000} onChange={(population) => setForm({ ...form, population })} />
          <NumberField label="Seed" value={form.seed} min={1} max={999999999} onChange={(seed) => setForm({ ...form, seed })} />
          <NumberField label="Duration (s)" value={form.duration} min={1} max={300} onChange={(duration) => setForm({ ...form, duration })} />
          <NumberField label="Trials" value={form.trials} min={1} max={30} onChange={(trials) => setForm({ ...form, trials })} />
          <label className="flex items-end gap-2 pb-1 text-sm text-slate-300">
            <input type="checkbox" checked={form.disruption} onChange={(event) => setForm({ ...form, disruption: event.target.checked })} />
            Disrupt midway
          </label>
          <NumberField label="Disruption fraction" value={form.disruptionFraction} min={0.1} max={0.9} step={0.05} onChange={(disruptionFraction) => setForm({ ...form, disruptionFraction })} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button disabled={running} className="rounded bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50" onClick={() => void execute([form.algorithm])}>
            Run trials
          </button>
          <button disabled={running} className="rounded border border-cyan-700 px-3 py-2 text-sm text-cyan-100 disabled:opacity-50" onClick={() => void execute(["random", "aco", "coa"])}>
            Compare all modes
          </button>
          <button
            disabled={!running}
            className="rounded border border-slate-700 px-3 py-2 text-sm text-slate-200"
            onClick={() => {
              stop.current = true;
            }}
          >
            Stop
          </button>
          <button className="rounded border border-slate-700 px-3 py-2 text-sm text-slate-200" onClick={() => useSimulationStore.getState().clearExperimentResults()}>
            Clear
          </button>
          <button className="inline-flex items-center gap-1 rounded border border-slate-700 px-3 py-2 text-sm text-slate-200" onClick={() => downloadText("coa-results.json", resultsToJson(results), "application/json")} disabled={results.length === 0}>
            <Download size={14} /> JSON
          </button>
          <button className="inline-flex items-center gap-1 rounded border border-slate-700 px-3 py-2 text-sm text-slate-200" onClick={() => downloadText("coa-results.csv", resultsToCsv(results), "text/csv")} disabled={results.length === 0}>
            <Download size={14} /> CSV
          </button>
        </div>
        {running && (
          <div className="mt-3 text-sm text-amber-200">
            Running {progress.current} / {progress.total || "…"}
          </div>
        )}
        {error && <div className="mt-3 text-sm text-rose-300">{error}</div>}
        {summaries.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500">
                <tr>
                  {["Mode", "Trials", "Food", "Discovery", "First delivery", "Efficiency", "Exchanges", "Explored %", "Recovery"].map((heading) => (
                    <th key={heading} className="border-b border-slate-800 px-2 py-2 font-medium">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summaries.map((summary) => (
                  <SummaryRow key={summary.algorithm} summary={summary} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {results.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="text-slate-500">
                <tr>
                  {["Id", "Mode", "Seed", "Food", "Discovery", "Delivery", "Best", "Optimal", "Efficiency", "Exchanges", "Explored", "Recovery", "Disconnected"].map((heading) => (
                    <th key={heading} className="border-b border-slate-800 px-2 py-2 font-medium">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((result) => (
                  <tr key={result.experimentId} className="border-b border-slate-900 font-mono text-slate-200">
                    <td className="px-2 py-1">{result.experimentId}</td>
                    <td className="px-2 py-1">{result.algorithm}</td>
                    <td className="px-2 py-1">{result.seed}</td>
                    <td className="px-2 py-1">{result.foodDelivered}</td>
                    <td className="px-2 py-1">{cell(result.discoveryTime)}</td>
                    <td className="px-2 py-1">{cell(result.firstDeliveryTime)}</td>
                    <td className="px-2 py-1">{cell(result.bestPathLength)}</td>
                    <td className="px-2 py-1">{cell(result.optimalPathLength)}</td>
                    <td className="px-2 py-1">{result.routeEfficiency === null ? "—" : result.routeEfficiency.toFixed(2)}</td>
                    <td className="px-2 py-1">{result.knowledgeExchanges}</td>
                    <td className="px-2 py-1">{result.exploredVolume.toFixed(1)}</td>
                    <td className="px-2 py-1">{cell(result.disruptionRecoveryTime)}</td>
                    <td className="px-2 py-1">{result.routeDisconnected ? "yes" : "no"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryRow({ summary }: { summary: ModeSummary }) {
  return (
    <tr className="border-b border-slate-900 font-mono text-slate-100">
      <td className="px-2 py-1">{summary.algorithm}</td>
      <td className="px-2 py-1">{summary.trials}</td>
      <td className="px-2 py-1">{summary.meanFoodDelivered.toFixed(2)}</td>
      <td className="px-2 py-1">{cell(summary.meanDiscoveryTime, summary.discoverySamples)}</td>
      <td className="px-2 py-1">{cell(summary.meanFirstDelivery, summary.deliverySamples)}</td>
      <td className="px-2 py-1">{summary.meanEfficiency === null ? "—" : summary.meanEfficiency.toFixed(2)}</td>
      <td className="px-2 py-1">{summary.meanExchanges.toFixed(1)}</td>
      <td className="px-2 py-1">{summary.meanExplored.toFixed(1)}</td>
      <td className="px-2 py-1">{cell(summary.meanRecovery, summary.recoverySamples)}</td>
    </tr>
  );
}

function cell(value: number | null, samples?: number): string {
  if (value === null) return "—";
  const text = value.toFixed(2);
  return samples === undefined ? text : `${text} (n=${samples})`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs text-slate-400">
      <span className="mb-1 block">{label}</span>
      <div className="[&_input]:w-full [&_input]:rounded [&_input]:border [&_input]:border-slate-700 [&_input]:bg-slate-950 [&_input]:px-2 [&_input]:py-1 [&_input]:text-slate-100 [&_select]:w-full [&_select]:rounded [&_select]:border [&_select]:border-slate-700 [&_select]:bg-slate-950 [&_select]:px-2 [&_select]:py-1 [&_select]:text-slate-100">
        {children}
      </div>
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <Field label={label}>
      <input type="number" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </Field>
  );
}

function runInWorker(spec: ExperimentSpec, onProgress: (current: number, total: number) => void): Promise<ExperimentResult[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/experimentWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<{ type: string; current?: number; total?: number; results?: ExperimentResult[]; message?: string }>) => {
      const data = event.data;
      if (data.type === "progress" && data.current !== undefined && data.total !== undefined) onProgress(data.current, data.total);
      if (data.type === "done" && data.results) {
        worker.terminate();
        resolve(data.results);
      }
      if (data.type === "error") {
        worker.terminate();
        reject(new Error(data.message ?? "Experiment worker failed"));
      }
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message));
    };
    worker.postMessage({ spec });
  });
}
