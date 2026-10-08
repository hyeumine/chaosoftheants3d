import type { AlgorithmMode, SimulationConfig, SimulationMetrics, StateCounts } from "../types/simulation";

export function createDefaultConfig(): SimulationConfig {
  return {
    worldWidth: 60,
    worldHeight: 30,
    worldDepth: 60,
    cellSize: 3,

    population: 160,
    moveSpeed: 6,
    explorationProbability: 0.22,
    pheromoneStrength: 0.55,
    evaporationRate: 0.12,
    diffusionEnabled: false,
    diffusionRate: 0.2,
    maxPheromone: 6,
    knowledgeDecay: 0.04,
    communicationRadius: 5,
    relayRetention: 0.75,
    sensingRadius: 7,
    obstacleDensity: 0.16,
    simulationSpeed: 4,
    seed: 42,

    mode: "coa",
    pheromoneEnabled: true,
    relayEnabled: true,

    mazeType: "backtracking",
    mazeComplexity: 6,
    passageWidth: 1,
    verticalConnectivity: 0.85,
    alternativeRoutes: 6,

    agentRadius: 0.32,
    nestRadius: 1.85,
    foodRadius: 1.85,
    energyMax: 100,
    energyDrain: 0.012,
    energyRegen: 3.5,
    crumbSpacing: 1.5,
    maxCrumbs: 220,
    maxRouteSegments: 10,
    exchangeCooldown: 0.8,
  };
}

export function cloneConfig(config: SimulationConfig): SimulationConfig {
  return { ...config };
}

export function applyAlgorithmMode(config: SimulationConfig, mode: AlgorithmMode): SimulationConfig {
  const next = cloneConfig(config);
  next.mode = mode;
  if (mode === "random") {
    next.pheromoneEnabled = false;
    next.relayEnabled = false;
  } else if (mode === "aco") {
    next.pheromoneEnabled = true;
    next.relayEnabled = false;
  } else {
    next.pheromoneEnabled = true;
    next.relayEnabled = true;
  }
  return next;
}

export function activePreset(config: SimulationConfig): AlgorithmMode | null {
  if (!config.pheromoneEnabled && !config.relayEnabled) return "random";
  if (config.pheromoneEnabled && !config.relayEnabled) return "aco";
  if (config.pheromoneEnabled && config.relayEnabled) return "coa";
  return null;
}

export interface ResolvedWorld {
  cellSize: number;
  nx: number;
  ny: number;
  nz: number;
  width: number;
  height: number;
  depth: number;
  reduced: boolean;
}

export function resolveWorldSize(config: Pick<SimulationConfig, "worldWidth" | "worldHeight" | "worldDepth" | "cellSize">): ResolvedWorld {
  let cell = Math.max(0.75, config.cellSize);
  const fit = (c: number) => {
    const nx = Math.max(6, Math.round(config.worldWidth / c));
    const ny = Math.max(4, Math.round(config.worldHeight / c));
    const nz = Math.max(6, Math.round(config.worldDepth / c));
    return { nx, ny, nz };
  };
  let dims = fit(cell);
  let reduced = false;
  while (dims.nx * dims.ny * dims.nz > 160000 && cell < 20) {
    cell += 0.5;
    dims = fit(cell);
    reduced = true;
  }
  return {
    cellSize: cell,
    nx: dims.nx,
    ny: dims.ny,
    nz: dims.nz,
    width: dims.nx * cell,
    height: dims.ny * cell,
    depth: dims.nz * cell,
    reduced,
  };
}

export function emptyStateCounts(): StateCounts {
  return {
    EXPLORING: 0,
    FOOD_DISCOVERED: 0,
    RETURNING_HOME: 0,
    DELIVERING: 0,
    FOLLOWING_TRAIL: 0,
    RECOVERING: 0,
  };
}

export function createMetrics(): SimulationMetrics {
  return {
    time: 0,
    totalAgents: 0,
    exploring: 0,
    returning: 0,
    carrying: 0,
    knowingFood: 0,
    knowingHome: 0,
    foodDelivered: 0,
    successfulTrips: 0,
    failedTrips: 0,
    knowledgeExchanges: 0,
    averagePathLength: null,
    bestPathLength: null,
    optimalPathLength: null,
    routeEfficiency: null,
    exploredVolume: 0,
    timeToFirstDiscovery: null,
    timeToFirstDelivery: null,
    recoveryTime: null,
    awaitingRecovery: false,
    lastDisruptionTime: null,
    routeDisconnected: false,
    disruptionCount: 0,
    foodAtDisruption: null,
    meanPheromone: 0,
    stateCounts: emptyStateCounts(),
    disruptions: [],
    reachable: false,
  };
}

/**
 * Route efficiency is the grid reference length divided by the best measured
 * outbound trip. Null when either measurement is unavailable.
 * The ratio can exceed 1 when a continuous trajectory cuts voxel-center corners.
 */
export function routeEfficiency(optimal: number | null, best: number | null): number | null {
  if (optimal === null || best === null) return null;
  if (!(optimal > 0) || !(best > 0)) return null;
  return optimal / best;
}

export function performanceWarning(population: number, voxels: number): string | null {
  if (population >= 1500 || voxels >= 100000) {
    return "Heavy configuration: pheromone, heatmap, and encounter drawing are capped. Frame rate depends on this machine and is not guaranteed.";
  }
  if (population >= 800 || voxels >= 60000) {
    return "Large configuration: rendering detail is reduced automatically. The simulation itself still steps every agent.";
  }
  return null;
}
