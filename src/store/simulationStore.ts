import { create } from "zustand";
import type {
  CameraPreset,
  EditorTool,
  ExperimentResult,
  HistorySample,
  LayerSettings,
  SimulationConfig,
  SimulationMetrics,
  ViewSettings,
} from "../types/simulation";
import { applyAlgorithmMode, createDefaultConfig, createMetrics } from "../utils/config";
import { getEngine } from "./engineInstance";

export interface SimulationStore {
  config: SimulationConfig;
  metrics: SimulationMetrics;
  history: HistorySample[];
  running: boolean;
  tool: EditorTool;
  layers: LayerSettings;
  view: ViewSettings;
  runId: number;
  sceneVersion: number;
  lastSample: number;
  status: string;
  warning: string | null;
  experimentRunning: boolean;
  experimentProgress: { current: number; total: number };
  experimentResults: ExperimentResult[];
  experimentError: string | null;
  patchConfig: (patch: Partial<SimulationConfig>) => void;
  setRunning: (running: boolean) => void;
  toggleRunning: () => void;
  setTool: (tool: EditorTool) => void;
  toggleLayer: (key: keyof LayerSettings) => void;
  patchView: (patch: Partial<ViewSettings>) => void;
  setPreset: (preset: CameraPreset) => void;
  setMetrics: (metrics: SimulationMetrics) => void;
  setSceneVersion: (sceneVersion: number) => void;
  setStatus: (status: string, warning: string | null) => void;
  pushSample: (sample: HistorySample, time: number) => void;
  resetSeries: (runId: number, metrics: SimulationMetrics) => void;
  restart: () => void;
  generateMaze: () => void;
  rebuildSeed: () => void;
  resetWorld: () => void;
  clearObstacles: () => void;
  destroyRoute: () => void;
  stepOnce: () => void;
  setExperimentRunning: (running: boolean) => void;
  setExperimentProgress: (current: number, total: number) => void;
  setExperimentResults: (results: ExperimentResult[]) => void;
  appendExperimentResults: (results: ExperimentResult[]) => void;
  setExperimentError: (error: string | null) => void;
  clearExperimentResults: () => void;
}

const layers: LayerSettings = {
  agents: true,
  obstacles: true,
  foodPheromone: true,
  homePheromone: true,
  encounters: true,
  communication: false,
  heatmap: false,
  bestRoute: true,
  shortestRoute: false,
  grid: true,
  axes: true,
  labels: true,
  boundary: true,
};

const view: ViewSettings = {
  preset: "iso",
  presetNonce: 0,
  projection: "perspective",
  firstPerson: false,
  cameraSpeed: 1,
  obstacleOpacity: 0.38,
  sliceEnabled: false,
  sliceLayer: 1,
};

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  config: createDefaultConfig(),
  metrics: createMetrics(),
  history: [],
  running: true,
  tool: "navigate",
  layers,
  view,
  runId: 0,
  sceneVersion: 0,
  lastSample: -1,
  status: "Starting simulation.",
  warning: null,
  experimentRunning: false,
  experimentProgress: { current: 0, total: 0 },
  experimentResults: [],
  experimentError: null,
  patchConfig: (patch) => set((state) => ({ config: { ...state.config, ...patch } })),
  setRunning: (running) => set({ running }),
  toggleRunning: () => set((state) => ({ running: !state.running })),
  setTool: (tool) => set({ tool }),
  toggleLayer: (key) => set((state) => ({ layers: { ...state.layers, [key]: !state.layers[key] } })),
  patchView: (patch) => set((state) => ({ view: { ...state.view, ...patch } })),
  setPreset: (preset) => set((state) => ({ view: { ...state.view, preset, presetNonce: state.view.presetNonce + 1, firstPerson: false } })),
  setMetrics: (metrics) => set({ metrics }),
  setSceneVersion: (sceneVersion) => set({ sceneVersion }),
  setStatus: (status, warning) => set({ status, warning }),
  pushSample: (sample, time) =>
    set((state) => ({
      history: [...state.history, sample].slice(-240),
      lastSample: time,
    })),
  resetSeries: (runId, metrics) => set({ runId, metrics, history: [], lastSample: -1 }),
  restart: () => {
    const engine = getEngine();
    engine.updateConfig(get().config);
    engine.restart();
    set({
      history: [],
      lastSample: -1,
      runId: engine.runId,
      metrics: engine.copyMetrics(),
      status: engine.statusMessage,
      warning: engine.warning,
    });
  },
  generateMaze: () => {
    const state = get();
    const seed = (state.config.seed + 9973) >>> 0;
    const config = { ...state.config, seed };
    const engine = getEngine();
    engine.updateConfig(config);
    engine.generateMaze(config.mazeType);
    set({
      config,
      history: [],
      lastSample: -1,
      runId: engine.runId,
      sceneVersion: engine.sceneVersion,
      metrics: engine.copyMetrics(),
      status: engine.statusMessage,
      warning: engine.warning,
    });
  },
  rebuildSeed: () => {
    const engine = getEngine();
    engine.updateConfig(get().config);
    engine.generateMaze(get().config.mazeType);
    set({
      history: [],
      lastSample: -1,
      runId: engine.runId,
      sceneVersion: engine.sceneVersion,
      metrics: engine.copyMetrics(),
      status: engine.statusMessage,
      warning: engine.warning,
    });
  },
  resetWorld: () => {
    const selected = get().config.mazeType;
    const engine = getEngine();
    engine.updateConfig(get().config);
    engine.resetWorld();
    engine.config.mazeType = selected;
    set({
      history: [],
      lastSample: -1,
      runId: engine.runId,
      sceneVersion: engine.sceneVersion,
      metrics: engine.copyMetrics(),
      status: engine.statusMessage,
      warning: engine.warning,
    });
  },
  clearObstacles: () => {
    const engine = getEngine();
    engine.clearObstacles();
    set({
      sceneVersion: engine.sceneVersion,
      metrics: engine.copyMetrics(),
      status: engine.statusMessage,
    });
  },
  destroyRoute: () => {
    const engine = getEngine();
    engine.destroyDominantRoute();
    set({
      sceneVersion: engine.sceneVersion,
      metrics: engine.copyMetrics(),
      status: engine.statusMessage,
    });
  },
  stepOnce: () => {
    const engine = getEngine();
    engine.step(1 / 20);
    const state = get();
    const history =
      engine.time - state.lastSample >= 0.5 || state.history.length === 0
        ? [...state.history, engine.historySample()].slice(-240)
        : state.history;
    set({
      running: false,
      metrics: engine.copyMetrics(),
      history,
      lastSample: history === state.history ? state.lastSample : engine.time,
      status: engine.statusMessage,
    });
  },
  setExperimentRunning: (experimentRunning) => set({ experimentRunning }),
  setExperimentProgress: (current, total) => set({ experimentProgress: { current, total } }),
  setExperimentResults: (experimentResults) => set({ experimentResults }),
  appendExperimentResults: (results) => set((state) => ({ experimentResults: [...state.experimentResults, ...results] })),
  setExperimentError: (experimentError) => set({ experimentError }),
  clearExperimentResults: () => set({ experimentResults: [], experimentError: null, experimentProgress: { current: 0, total: 0 } }),
}));

export function selectMode(mode: SimulationConfig["mode"]): void {
  useSimulationStore.setState((state) => ({ config: applyAlgorithmMode(state.config, mode) }));
}
