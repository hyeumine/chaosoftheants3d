import type { AlgorithmMode, ExperimentResult, ExperimentSpec } from "../types/simulation";
import { applyAlgorithmMode, cloneConfig } from "../utils/config";
import { SimulationEngine } from "./SimulationEngine";

export interface ModeSummary {
  algorithm: string;
  trials: number;
  meanFoodDelivered: number;
  meanDiscoveryTime: number | null;
  meanFirstDelivery: number | null;
  meanEfficiency: number | null;
  meanExchanges: number;
  meanExplored: number;
  meanRecovery: number | null;
  discoverySamples: number;
  deliverySamples: number;
  efficiencySamples: number;
  recoverySamples: number;
}

const STEP = 1 / 20;

/**
 * Headless repeated trials. Trial i uses seed + i so a batch is reproducible
 * and trials are not identical copies.
 */
export function runSingleTrial(spec: ExperimentSpec, trialIndex = 0): ExperimentResult {
  const seed = (spec.seed + trialIndex) >>> 0 || 1;
  const config = applyAlgorithmMode(
    {
      ...cloneConfig(spec.config),
      seed,
      population: spec.population,
      mazeType: spec.mazeType,
      mode: spec.algorithm,
    },
    spec.algorithm,
  );
  const engine = new SimulationEngine(config);
  engine.generateMaze(spec.mazeType);
  const steps = Math.max(0, Math.round(spec.duration / STEP));
  const disruptAt = spec.disruption ? Math.min(steps - 1, Math.max(0, Math.floor(steps * spec.disruptionFraction))) : -1;
  for (let s = 0; s < steps; s++) {
    if (s === disruptAt) engine.destroyDominantRoute();
    engine.step(STEP);
  }
  const result = engine.toResult();
  result.experimentId = `${spec.algorithm}-${spec.mazeType}-s${seed}-t${trialIndex}`;
  result.seed = seed;
  result.algorithm = spec.algorithm;
  return result;
}

export function runExperiment(spec: ExperimentSpec): ExperimentResult[] {
  const trials = Math.max(1, Math.floor(spec.trials));
  const results: ExperimentResult[] = [];
  for (let i = 0; i < trials; i++) results.push(runSingleTrial(spec, i));
  return results;
}

export async function runExperimentChunked(
  spec: ExperimentSpec,
  onProgress: (current: number, total: number) => void,
  shouldStop: () => boolean,
): Promise<ExperimentResult[]> {
  const trials = Math.max(1, Math.floor(spec.trials));
  const results: ExperimentResult[] = [];
  for (let i = 0; i < trials; i++) {
    if (shouldStop()) break;
    results.push(runSingleTrial(spec, i));
    onProgress(i + 1, trials);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return results;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i];
  return sum / values.length;
}

export function summarizeGroup(algorithm: string, results: ExperimentResult[]): ModeSummary {
  const discovery = results.map((r) => r.discoveryTime).filter((v): v is number => v !== null);
  const delivery = results.map((r) => r.firstDeliveryTime).filter((v): v is number => v !== null);
  const efficiency = results.map((r) => r.routeEfficiency).filter((v): v is number => v !== null);
  const recovery = results.map((r) => r.disruptionRecoveryTime).filter((v): v is number => v !== null);
  let food = 0;
  let exchanges = 0;
  let explored = 0;
  for (const result of results) {
    food += result.foodDelivered;
    exchanges += result.knowledgeExchanges;
    explored += result.exploredVolume;
  }
  const n = Math.max(1, results.length);
  return {
    algorithm,
    trials: results.length,
    meanFoodDelivered: food / n,
    meanDiscoveryTime: mean(discovery),
    meanFirstDelivery: mean(delivery),
    meanEfficiency: mean(efficiency),
    meanExchanges: exchanges / n,
    meanExplored: explored / n,
    meanRecovery: mean(recovery),
    discoverySamples: discovery.length,
    deliverySamples: delivery.length,
    efficiencySamples: efficiency.length,
    recoverySamples: recovery.length,
  };
}

export function summarizeByAlgorithm(results: ExperimentResult[]): ModeSummary[] {
  const order: AlgorithmMode[] = ["random", "aco", "coa"];
  const groups = new Map<string, ExperimentResult[]>();
  for (const result of results) {
    const list = groups.get(result.algorithm) ?? [];
    list.push(result);
    groups.set(result.algorithm, list);
  }
  const summaries: ModeSummary[] = [];
  for (const algorithm of order) {
    const list = groups.get(algorithm);
    if (list) summaries.push(summarizeGroup(algorithm, list));
  }
  for (const [algorithm, list] of groups) {
    if (!order.includes(algorithm as AlgorithmMode)) summaries.push(summarizeGroup(algorithm, list));
  }
  return summaries;
}
