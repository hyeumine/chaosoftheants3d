export type Vector3D = {
  x: number;
  y: number;
  z: number;
};

export type AgentState =
  | "EXPLORING"
  | "FOOD_DISCOVERED"
  | "RETURNING_HOME"
  | "DELIVERING"
  | "FOLLOWING_TRAIL"
  | "RECOVERING";

export type AlgorithmMode = "random" | "aco" | "coa";

export type MazeType = "backtracking" | "division" | "obstacles" | "empty";

export interface RouteSegment {
  from: Vector3D;
  to: Vector3D;
  cost: number;
  confidence: number;
  version: number;
  hops: number;
  cellFrom: number;
  cellTo: number;
}

export interface ObstacleObservation {
  x: number;
  y: number;
  z: number;
  cell: number;
  confidence: number;
  time: number;
  hops: number;
}

export interface AgentKnowledge {
  foodKnown: boolean;
  foodPosition?: Vector3D;
  foodConfidence: number;
  foodHops: number;
  foodVersion: number;
  foodSourceId: number;

  homeKnown: boolean;
  homePosition?: Vector3D;
  homeConfidence: number;
  homeHops: number;
  homeVersion: number;
  homeSourceId: number;

  routeSegments: RouteSegment[];
  obstacleObservations: ObstacleObservation[];

  lastUpdated: number;
}

export interface AntAgentData {
  id: number;
  position: Vector3D;
  velocity: Vector3D;
  direction: Vector3D;
  state: AgentState;
  carryingFood: boolean;
  energy: number;
  knowledge: AgentKnowledge;
  visitedCells: number[];
  distanceTraveled: number;
  successfulTrips: number;
}

export interface PheromoneVoxel {
  foodStrength: number;
  homeStrength: number;
  lastUpdated: number;
}

export interface SimulationConfig {
  worldWidth: number;
  worldHeight: number;
  worldDepth: number;
  cellSize: number;

  population: number;
  moveSpeed: number;
  explorationProbability: number;
  pheromoneStrength: number;
  evaporationRate: number;
  diffusionEnabled: boolean;
  diffusionRate: number;
  maxPheromone: number;
  knowledgeDecay: number;
  communicationRadius: number;
  relayRetention: number;
  sensingRadius: number;
  obstacleDensity: number;
  simulationSpeed: number;
  seed: number;

  mode: AlgorithmMode;
  pheromoneEnabled: boolean;
  relayEnabled: boolean;

  mazeType: MazeType;
  mazeComplexity: number;
  passageWidth: number;
  verticalConnectivity: number;
  alternativeRoutes: number;

  agentRadius: number;
  nestRadius: number;
  foodRadius: number;
  energyMax: number;
  energyDrain: number;
  energyRegen: number;
  crumbSpacing: number;
  maxCrumbs: number;
  maxRouteSegments: number;
  exchangeCooldown: number;
}

export interface StateCounts {
  EXPLORING: number;
  FOOD_DISCOVERED: number;
  RETURNING_HOME: number;
  DELIVERING: number;
  FOLLOWING_TRAIL: number;
  RECOVERING: number;
}

export interface DisruptionMark {
  time: number;
  disconnected: boolean;
}

export interface SimulationMetrics {
  time: number;
  totalAgents: number;
  exploring: number;
  returning: number;
  carrying: number;
  knowingFood: number;
  knowingHome: number;
  foodDelivered: number;
  successfulTrips: number;
  failedTrips: number;
  knowledgeExchanges: number;
  averagePathLength: number | null;
  bestPathLength: number | null;
  optimalPathLength: number | null;
  routeEfficiency: number | null;
  exploredVolume: number;
  timeToFirstDiscovery: number | null;
  timeToFirstDelivery: number | null;
  recoveryTime: number | null;
  awaitingRecovery: boolean;
  lastDisruptionTime: number | null;
  routeDisconnected: boolean;
  disruptionCount: number;
  foodAtDisruption: number | null;
  meanPheromone: number;
  stateCounts: StateCounts;
  disruptions: DisruptionMark[];
  reachable: boolean;
}

export interface HistorySample {
  t: number;
  foodDelivered: number;
  routeEfficiency: number | null;
  knowingFoodPct: number;
  knowledgeExchanges: number;
  meanPheromone: number;
  exploredVolume: number;
  exploring: number;
  returning: number;
  carrying: number;
  recovering: number;
  following: number;
  delivering: number;
  discovered: number;
  sinceDisruption: number | null;
}

export interface ExperimentResult {
  experimentId: string;
  algorithm: string;
  seed: number;
  population: number;
  mazeType: string;

  discoveryTime: number | null;
  firstDeliveryTime: number | null;

  foodDelivered: number;
  averagePathLength: number | null;
  bestPathLength: number | null;
  optimalPathLength: number | null;

  routeEfficiency: number | null;
  knowledgeExchanges: number;
  exploredVolume: number;

  disruptionRecoveryTime: number | null;
  routeDisconnected: boolean;
}

export interface ExperimentSpec {
  algorithm: AlgorithmMode;
  mazeType: MazeType;
  population: number;
  seed: number;
  duration: number;
  trials: number;
  disruption: boolean;
  disruptionFraction: number;
  config: SimulationConfig;
}

export type EditorTool =
  | "navigate"
  | "nest"
  | "food"
  | "add"
  | "remove"
  | "paint"
  | "erase";

export interface LayerSettings {
  agents: boolean;
  obstacles: boolean;
  foodPheromone: boolean;
  homePheromone: boolean;
  encounters: boolean;
  communication: boolean;
  heatmap: boolean;
  bestRoute: boolean;
  shortestRoute: boolean;
  grid: boolean;
  axes: boolean;
  labels: boolean;
  boundary: boolean;
}

export type CameraPreset = "top" | "front" | "side" | "iso";

export interface ViewSettings {
  preset: CameraPreset;
  presetNonce: number;
  projection: "perspective" | "orthographic";
  firstPerson: boolean;
  cameraSpeed: number;
  obstacleOpacity: number;
  sliceEnabled: boolean;
  sliceLayer: number;
}

export interface MazeGenOptions {
  passageWidth: number;
  complexity: number;
  verticalConnectivity: number;
  alternativeRoutes: number;
  obstacleDensity: number;
  preferVertical: boolean;
}

export const AGENT_STATES: AgentState[] = [
  "EXPLORING",
  "FOOD_DISCOVERED",
  "RETURNING_HOME",
  "DELIVERING",
  "FOLLOWING_TRAIL",
  "RECOVERING",
];
