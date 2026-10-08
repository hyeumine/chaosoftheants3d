import { steerAco } from "../algorithms/ACO";
import { steerCoA } from "../algorithms/CoA";
import { steerRandom } from "../algorithms/RandomWalk";
import type { SteerContext } from "../algorithms/steering";
import type {
  DisruptionMark,
  ExperimentResult,
  HistorySample,
  MazeGenOptions,
  MazeType,
  SimulationConfig,
  SimulationMetrics,
  Vector3D,
} from "../types/simulation";
import { cloneConfig, createMetrics, performanceWarning, routeEfficiency } from "../utils/config";
import { SeededRandom } from "../utils/seededRandom";
import { AntAgent } from "./AntAgent";
import { bodyRadius, hasLineOfSight, isPositionBlocked, moveWithCollision } from "./CollisionSystem";
import { decayKnowledge, KnowledgeExchange } from "./KnowledgeExchange";
import { generateMaze as buildMaze } from "./MazeGenerator3D";
import { dominantPheromoneTrail, nearestOpenVoxel, shortestPath } from "./PathAnalysis";
import { PheromoneField } from "./PheromoneField";
import { SpatialHash } from "./SpatialHash";
import { createWorld, World3D } from "./World3D";

const DIRS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

export interface DisruptionResult {
  applied: boolean;
  disconnected: boolean;
  reason: string;
  ix?: number;
  iy?: number;
  iz?: number;
}

/**
 * Headless 3D swarm simulation.
 * The engine may know the full map. Agent policies cannot read referencePath.
 */
export class SimulationEngine {
  config: SimulationConfig;
  world: World3D;
  pheromones: PheromoneField;
  agents: AntAgent[] = [];
  readonly spatial: SpatialHash;
  readonly exchange = new KnowledgeExchange();
  metrics: SimulationMetrics;
  rng: SeededRandom;
  time = 0;
  runId = 1;
  sceneVersion = 1;
  radius: number;
  warning: string | null = null;
  statusMessage = "World ready.";
  referencePath: Vector3D[] = [];
  bestPath: Vector3D[] = [];
  private pathLengthSum = 0;
  private pathSamples = 0;
  private diffusionAccum = 0;
  private steerCtx: SteerContext;

  constructor(config: SimulationConfig) {
    this.config = cloneConfig(config);
    this.world = createWorld(this.config);
    this.pheromones = new PheromoneField(this.world.nx, this.world.ny, this.world.nz);
    const seed = this.config.seed >>> 0 || 1;
    this.rng = new SeededRandom(seed);
    this.metrics = createMetrics();
    this.spatial = new SpatialHash(Math.max(16, this.config.population), 4);
    this.radius = bodyRadius(this.config.agentRadius, this.world.cellSize);
    this.warning = this.composeWarning();
    this.steerCtx = {
      world: this.world,
      pheromones: this.pheromones,
      rng: this.rng,
      explorationProbability: this.config.explorationProbability,
      pheromoneEnabled: this.config.pheromoneEnabled,
      sensingRadius: this.config.sensingRadius,
    };
    if (this.world.reducedResolution) {
      this.statusMessage = "Voxel resolution was coarsened so the grid stays within the interactive budget.";
    }
  }

  private composeWarning(): string | null {
    return performanceWarning(this.config.population, this.world.voxelCount);
  }

  private mazeOptions(): MazeGenOptions {
    return {
      passageWidth: this.config.passageWidth,
      complexity: this.config.mazeComplexity,
      verticalConnectivity: this.config.verticalConnectivity,
      alternativeRoutes: this.config.alternativeRoutes,
      obstacleDensity: this.config.obstacleDensity,
      preferVertical: this.config.verticalConnectivity > 0.15,
    };
  }

  updateConfig(next: SimulationConfig): void {
    const population = Math.max(1, Math.min(2500, Math.floor(next.population)));
    this.config = cloneConfig({ ...next, population });
    this.radius = bodyRadius(this.config.agentRadius, this.world.cellSize);
    if (population !== this.agents.length) this.resizePopulation(population);
    this.warning = this.composeWarning();
    this.steerCtx.explorationProbability = this.config.explorationProbability;
    this.steerCtx.pheromoneEnabled = this.config.pheromoneEnabled;
    this.steerCtx.sensingRadius = this.config.sensingRadius;
  }

  generateMaze(type: MazeType = this.config.mazeType): void {
    const seed = this.config.seed >>> 0 || 1;
    this.config.mazeType = type;
    const mazeRng = new SeededRandom(seed);
    this.world.clearVisits();
    buildMaze(this.world, type, mazeRng, this.mazeOptions());
    this.pheromones.clear();
    this.exchange.reset();
    this.rng = new SeededRandom(seed);
    this.time = 0;
    this.pathLengthSum = 0;
    this.pathSamples = 0;
    this.bestPath = [];
    this.diffusionAccum = 0;
    this.metrics = createMetrics();
    this.resetAgents();
    this.recomputeReference();
    this.rollup();
    this.runId++;
    this.sceneVersion++;
    const len = this.metrics.optimalPathLength;
    this.statusMessage = this.world.reachable
      ? `Maze ready. Shortest reference path is ${len === null ? "unknown" : len.toFixed(1)} units and is hidden from agents.`
      : "The generator could not connect the nest to food.";
    this.warning = this.composeWarning();
  }

  restart(): void {
    const seed = this.config.seed >>> 0 || 1;
    this.rng = new SeededRandom(seed);
    this.pheromones.clear();
    this.exchange.reset();
    this.world.clearVisits();
    this.time = 0;
    this.pathLengthSum = 0;
    this.pathSamples = 0;
    this.bestPath = [];
    this.diffusionAccum = 0;
    this.metrics = createMetrics();
    this.resetAgents();
    this.recomputeReference();
    this.rollup();
    this.runId++;
    this.statusMessage = "Simulation restarted on the current maze.";
  }

  resetWorld(): void {
    this.generateMaze("empty");
    this.statusMessage = "World cleared to an empty chamber with a guaranteed nest-food connection.";
  }

  clearObstacles(): void {
    this.world.fill(false);
    this.recomputeReference();
    this.sceneVersion++;
    this.statusMessage = this.world.reachable
      ? "Obstacles cleared."
      : "Obstacles cleared. Nest and food are not on a connected open path.";
  }

  setObstacle(ix: number, iy: number, iz: number, solid: boolean): { ok: boolean; message: string } {
    if (!this.world.inBounds(ix, iy, iz)) return { ok: false, message: "That cell is outside the world." };
    const nest = this.world.voxelOf(this.world.nest.x, this.world.nest.y, this.world.nest.z);
    const food = this.world.voxelOf(this.world.food.x, this.world.food.y, this.world.food.z);
    if (solid && nest && nest.ix === ix && nest.iy === iy && nest.iz === iz) {
      return { ok: false, message: "The nest cell stays open." };
    }
    if (solid && food && food.ix === ix && food.iy === iy && food.iz === iz) {
      return { ok: false, message: "The food cell stays open." };
    }
    this.world.setSolid(ix, iy, iz, solid);
    if (solid) this.pheromones.clearIndex(this.world.index(ix, iy, iz));
    this.recomputeReference();
    this.sceneVersion++;
    for (const agent of this.agents) {
      agent.dropBlockedCrumbs((x, y, z) => this.world.isSolidAt(x, y, z));
    }
    this.statusMessage = this.world.reachable
      ? solid
        ? "Obstacle placed."
        : "Obstacle removed."
      : "This edit disconnected the nest from the food. The trial is disconnected.";
    this.metrics.routeDisconnected = !this.world.reachable;
    return { ok: true, message: this.statusMessage };
  }

  placeNest(ix: number, iy: number, iz: number): { ok: boolean; message: string } {
    if (!this.world.inBounds(ix, iy, iz)) return { ok: false, message: "Outside the world." };
    this.world.setSolid(ix, iy, iz, false);
    this.world.nest = this.world.cellCenter(ix, iy, iz);
    for (const agent of this.agents) {
      agent.knowledge.homeKnown = false;
      agent.knowledge.homeConfidence = 0;
      agent.knowledge.homePosition = undefined;
      agent.crumbCount = 0;
    }
    this.pheromones.clearHome();
    this.beginMeasurementWindow();
    this.recomputeReference();
    this.sceneVersion++;
    this.statusMessage = "Nest moved. Home knowledge and home pheromone were invalidated.";
    return { ok: true, message: this.statusMessage };
  }

  placeFood(ix: number, iy: number, iz: number): { ok: boolean; message: string } {
    if (!this.world.inBounds(ix, iy, iz)) return { ok: false, message: "Outside the world." };
    this.world.setSolid(ix, iy, iz, false);
    this.world.food = this.world.cellCenter(ix, iy, iz);
    for (const agent of this.agents) {
      agent.knowledge.foodKnown = false;
      agent.knowledge.foodConfidence = 0;
      agent.knowledge.foodPosition = undefined;
    }
    this.pheromones.clearFood();
    this.beginMeasurementWindow();
    this.recomputeReference();
    this.sceneVersion++;
    this.statusMessage = "Food moved. Food knowledge and food pheromone were invalidated.";
    return { ok: true, message: this.statusMessage };
  }

  private beginMeasurementWindow(): void {
    const exchanges = this.metrics.knowledgeExchanges;
    const disruptions = this.metrics.disruptions;
    this.time = 0;
    this.pathLengthSum = 0;
    this.pathSamples = 0;
    this.bestPath = [];
    this.metrics = createMetrics();
    this.metrics.knowledgeExchanges = exchanges;
    this.metrics.disruptions = disruptions;
    this.metrics.totalAgents = this.agents.length;
    this.runId++;
  }

  recomputeReference(): void {
    const path = shortestPath(this.world, this.world.nest, this.world.food);
    this.referencePath = path ? path.path : [];
    this.world.reachable = path !== null;
    this.metrics.optimalPathLength = path ? path.length : null;
    this.metrics.reachable = path !== null;
    this.metrics.routeDisconnected = path === null;
    this.metrics.routeEfficiency = routeEfficiency(this.metrics.optimalPathLength, this.metrics.bestPathLength);
  }

  destroyDominantRoute(): DisruptionResult {
    const trail = dominantPheromoneTrail(this.world, this.pheromones, this.world.nest, this.world.food);
    if (trail.length < 4) {
      this.statusMessage = "No established pheromone route to disrupt yet.";
      return { applied: false, disconnected: false, reason: this.statusMessage };
    }
    const nestV = this.world.voxelOf(this.world.nest.x, this.world.nest.y, this.world.nest.z);
    const foodV = this.world.voxelOf(this.world.food.x, this.world.food.y, this.world.food.z);
    const order = middleOut(trail);
    let fallback: number[] | null = null;
    let fallbackCell = -1;
    for (let k = 0; k < order.length; k++) {
      const id = order[k];
      const cell = this.world.decode(id);
      if (nestV && chebyshev(cell, nestV) < 2) continue;
      if (foodV && chebyshev(cell, foodV) < 2) continue;
      const axis = trailAxis(this.world, trail, id);
      const barrier = barrierCells(this.world, cell.ix, cell.iy, cell.iz, axis);
      const opened = barrier.filter((index) => this.world.solids[index] === 0);
      if (opened.length === 0) continue;
      for (let i = 0; i < opened.length; i++) this.world.solids[opened[i]] = 1;
      this.world.recomputeOpen();
      const connected = shortestPath(this.world, this.world.nest, this.world.food) !== null;
      if (!connected) {
        for (let i = 0; i < opened.length; i++) this.world.solids[opened[i]] = 0;
        this.world.recomputeOpen();
        if (!fallback) {
          fallback = opened;
          fallbackCell = id;
        }
        continue;
      }
      this.commitDisruption(opened, false);
      const decoded = this.world.decode(id);
      this.statusMessage = "Dominant route blocked. Agents must discover an alternative.";
      return { applied: true, disconnected: false, reason: this.statusMessage, ix: decoded.ix, iy: decoded.iy, iz: decoded.iz };
    }
    if (fallback && fallbackCell >= 0) {
      for (let i = 0; i < fallback.length; i++) this.world.solids[fallback[i]] = 1;
      this.world.recomputeOpen();
      this.commitDisruption(fallback, true);
      const decoded = this.world.decode(fallbackCell);
      this.statusMessage = "Every candidate barrier disconnected the food. The trial is classified as disconnected.";
      return {
        applied: true,
        disconnected: true,
        reason: this.statusMessage,
        ix: decoded.ix,
        iy: decoded.iy,
        iz: decoded.iz,
      };
    }
    this.statusMessage = "No disruptible segment was far enough from the nest and the food.";
    return { applied: false, disconnected: false, reason: this.statusMessage };
  }

  private commitDisruption(cells: number[], disconnected: boolean): void {
    for (let i = 0; i < cells.length; i++) this.pheromones.clearIndex(cells[i]);
    this.pheromones.recomputeTotals();
    this.world.revision++;
    for (const agent of this.agents) {
      agent.dropBlockedCrumbs((x, y, z) => this.world.isSolidAt(x, y, z));
      const segments = agent.knowledge.routeSegments;
      let w = 0;
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (this.world.solids[seg.cellFrom] === 1 || this.world.solids[seg.cellTo] === 1) continue;
        segments[w++] = seg;
      }
      segments.length = w;
      agent.recoverTimer = Math.max(agent.recoverTimer, 0.35);
    }
    this.recomputeReference();
    this.metrics.routeDisconnected = disconnected || !this.world.reachable;
    this.metrics.lastDisruptionTime = this.time;
    this.metrics.disruptionCount++;
    this.metrics.recoveryTime = null;
    this.metrics.awaitingRecovery = !this.metrics.routeDisconnected;
    this.metrics.foodAtDisruption = this.metrics.foodDelivered;
    const mark: DisruptionMark = { time: this.time, disconnected: this.metrics.routeDisconnected };
    this.metrics.disruptions = [...this.metrics.disruptions, mark];
    this.sceneVersion++;
  }

  step(dt: number): void {
    if (!(dt > 0)) return;
    this.time += dt;
    this.metrics.time = this.time;
    if (this.config.pheromoneEnabled) {
      const rho = Math.max(0, Math.min(0.95, this.config.evaporationRate));
      const factor = Math.pow(1 - rho, dt);
      this.pheromones.evaporate(factor, this.time);
      if (this.config.diffusionEnabled) {
        this.diffusionAccum += dt;
        if (this.diffusionAccum >= 0.3) {
          this.pheromones.diffuse(this.config.diffusionRate, this.world.solids);
          this.diffusionAccum = 0;
        }
      }
    }

    for (let i = 0; i < this.agents.length; i++) {
      decayKnowledge(this.agents[i], dt, this.config.knowledgeDecay);
      this.updateAgent(this.agents[i], dt);
    }

    this.rebuildSpatial();
    if (this.config.relayEnabled) {
      const events = this.exchange.exchange(
        this.agents,
        this.spatial,
        {
          radius: this.config.communicationRadius,
          retention: this.config.relayRetention,
          cooldown: this.config.exchangeCooldown,
          time: this.time,
          maxSegments: this.config.maxRouteSegments,
          conflictDistance: this.world.cellSize * 2,
        },
        true,
      );
      this.metrics.knowledgeExchanges += events;
    }
    this.exchange.pruneVisuals(this.time);
    if (this.config.pheromoneEnabled) this.pheromones.recomputeTotals();
    this.rollup();
  }

  private updateAgent(agent: AntAgent, dt: number): void {
    const cfg = this.config;
    if (agent.deliverTimer > 0) agent.deliverTimer = Math.max(0, agent.deliverTimer - dt);
    if (agent.recoverTimer > 0) agent.recoverTimer = Math.max(0, agent.recoverTimer - dt);

    if (agent.carryingFood && agent.energy <= 0) {
      agent.carryingFood = false;
      this.metrics.failedTrips++;
      agent.state = "RECOVERING";
      agent.recoverTimer = Math.max(agent.recoverTimer, 1);
      this.randomRecoverDirection(agent);
    }

    this.sense(agent);
    const regen = cfg.energyRegen * (agent.sensedNest ? 2.2 : 1);
    agent.energy = Math.min(cfg.energyMax, agent.energy + regen * dt);

    const nestDist = Math.hypot(
      agent.position.x - this.world.nest.x,
      agent.position.y - this.world.nest.y,
      agent.position.z - this.world.nest.z,
    );
    const foodDist = Math.hypot(
      agent.position.x - this.world.food.x,
      agent.position.y - this.world.food.y,
      agent.position.z - this.world.food.z,
    );
    const here = this.world.voxelOf(agent.position.x, agent.position.y, agent.position.z);
    const foodCell = this.world.voxelOf(this.world.food.x, this.world.food.y, this.world.food.z);
    const nestCell = this.world.voxelOf(this.world.nest.x, this.world.nest.y, this.world.nest.z);
    const inFood = !!here && !!foodCell && here.ix === foodCell.ix && here.iy === foodCell.iy && here.iz === foodCell.iz;
    const inNest = !!here && !!nestCell && here.ix === nestCell.ix && here.iy === nestCell.iy && here.iz === nestCell.iz;
    if (agent.carryingFood && (nestDist <= cfg.nestRadius || inNest)) this.deliver(agent);
    else if (!agent.carryingFood && agent.deliverTimer <= 0 && (foodDist <= cfg.foodRadius || inFood) && agent.energy > 1) this.pickup(agent);

    agent.decisionCooldown -= dt;
    const locked =
      (agent.carryingFood && agent.crumbCount > 0) || (agent.sensedFood && !agent.carryingFood) || agent.recoverTimer > 0;
    if (agent.decisionCooldown <= 0 || locked) {
      this.steerAgent(agent);
      agent.decisionCooldown = locked ? 0.05 : 0.22;
    }

    this.applySeparation(agent);
    const speed = cfg.moveSpeed * (agent.recoverTimer > 0 || agent.energy <= 0 ? 0.45 : 1);
    const requested = speed * dt;
    const moved = this.integrate(agent, requested);
    agent.distanceTraveled += moved;
    agent.energy = Math.max(0, agent.energy - cfg.energyDrain * moved);
    agent.velocity.x = agent.direction.x * speed;
    agent.velocity.y = agent.direction.y * speed;
    agent.velocity.z = agent.direction.z * speed;

    if (moved < requested * 0.35) {
      agent.stuckTimer += dt;
      this.noteCollision(agent);
    } else agent.stuckTimer = 0;
    if (agent.stuckTimer > 0.55) {
      agent.stuckTimer = 0;
      agent.recoverTimer = Math.max(agent.recoverTimer, 0.5);
      this.randomRecoverDirection(agent);
    }

    this.afterMove(agent, dt);
    this.assignState(agent);
  }

  private sense(agent: AntAgent): void {
    agent.sensedFood = false;
    agent.sensedNest = false;
    const reach = this.config.sensingRadius;
    const food = this.world.food;
    const nest = this.world.nest;
    const foodDist = Math.hypot(agent.position.x - food.x, agent.position.y - food.y, agent.position.z - food.z);
    if (
      foodDist <= reach &&
      hasLineOfSight(this.world, agent.position.x, agent.position.y, agent.position.z, food.x, food.y, food.z)
    ) {
      agent.sensedFood = true;
      agent.sensorFoodX = food.x;
      agent.sensorFoodY = food.y;
      agent.sensorFoodZ = food.z;
      agent.rememberFood(food.x, food.y, food.z, this.time);
      if (this.metrics.timeToFirstDiscovery === null) this.metrics.timeToFirstDiscovery = this.time;
    }
    const nestDist = Math.hypot(agent.position.x - nest.x, agent.position.y - nest.y, agent.position.z - nest.z);
    if (
      nestDist <= reach &&
      hasLineOfSight(this.world, agent.position.x, agent.position.y, agent.position.z, nest.x, nest.y, nest.z)
    ) {
      agent.sensedNest = true;
      agent.sensorNestX = nest.x;
      agent.sensorNestY = nest.y;
      agent.sensorNestZ = nest.z;
      agent.rememberHome(nest.x, nest.y, nest.z, this.time);
    }
  }

  private steerAgent(agent: AntAgent): void {
    this.steerCtx.rng = this.rng;
    this.steerCtx.world = this.world;
    this.steerCtx.pheromones = this.pheromones;
    this.steerCtx.explorationProbability = this.config.explorationProbability;
    this.steerCtx.pheromoneEnabled = this.config.pheromoneEnabled;
    this.steerCtx.sensingRadius = this.config.sensingRadius;
    if (!this.config.pheromoneEnabled && !this.config.relayEnabled) steerRandom(agent, this.steerCtx);
    else if (!this.config.relayEnabled) steerAco(agent, this.steerCtx);
    else steerCoA(agent, this.steerCtx);
  }

  private integrate(agent: AntAgent, distance: number): number {
    const maxSub = Math.max(0.05, this.world.cellSize * 0.45);
    const steps = Math.min(8, Math.max(1, Math.ceil(distance / maxSub)));
    const sub = distance / steps;
    let moved = 0;
    for (let i = 0; i < steps; i++) {
      moved += moveWithCollision(
        this.world,
        agent.position,
        agent.direction.x * sub,
        agent.direction.y * sub,
        agent.direction.z * sub,
        this.radius,
      );
    }
    return moved;
  }

  private afterMove(agent: AntAgent, dt: number): void {
    const voxel = this.world.voxelOf(agent.position.x, agent.position.y, agent.position.z);
    if (!voxel) return;
    const id = this.world.index(voxel.ix, voxel.iy, voxel.iz);
    if (id !== agent.lastCell) {
      if (agent.lastCell >= 0 && !agent.carryingFood) {
        const from = this.world.decode(agent.lastCell);
        agent.addSegment(
          {
            from: this.world.cellCenter(from.ix, from.iy, from.iz),
            to: this.world.cellCenter(voxel.ix, voxel.iy, voxel.iz),
            cost: this.world.cellSize,
            confidence: 1,
            version: 1,
            hops: 0,
            cellFrom: agent.lastCell,
            cellTo: id,
          },
          this.config.maxRouteSegments,
        );
      }
      agent.lastCell = id;
      agent.rememberVisit(id);
      this.world.markVisit(id);
    }
    if (!agent.carryingFood) {
      agent.pushCrumb(agent.position.x, agent.position.y, agent.position.z, id, this.config.crumbSpacing);
      agent.sampleOutbound(agent.position.x, agent.position.y, agent.position.z, this.config.crumbSpacing);
    } else {
      agent.popCloseCrumbs(agent.position.x, agent.position.y, agent.position.z, this.config.crumbSpacing * 0.7);
      if (agent.crumbCount > 0) {
        const i = agent.crumbCount - 1;
        while (agent.crumbCount > 0 && this.world.isSolidAt(agent.crumbX[agent.crumbCount - 1], agent.crumbY[agent.crumbCount - 1], agent.crumbZ[agent.crumbCount - 1])) {
        agent.crumbCount--;
      }
      }
    }
    if (this.config.pheromoneEnabled) {
      const amt = this.config.pheromoneStrength * dt;
      if (agent.carryingFood) this.pheromones.deposit(voxel.ix, voxel.iy, voxel.iz, amt * 1.25, 0, this.config.maxPheromone);
      else this.pheromones.deposit(voxel.ix, voxel.iy, voxel.iz, 0, amt, this.config.maxPheromone);
    }
  }

  private noteCollision(agent: AntAgent): void {
    const x = agent.position.x + agent.direction.x * this.world.cellSize;
    const y = agent.position.y + agent.direction.y * this.world.cellSize;
    const z = agent.position.z + agent.direction.z * this.world.cellSize;
    const voxel = this.world.voxelOf(x, y, z);
    if (!voxel || !this.world.isSolid(voxel.ix, voxel.iy, voxel.iz)) return;
    const center = this.world.cellCenter(voxel.ix, voxel.iy, voxel.iz);
    agent.addObstacle(
      {
        x: center.x,
        y: center.y,
        z: center.z,
        cell: this.world.index(voxel.ix, voxel.iy, voxel.iz),
        confidence: 1,
        time: this.time,
        hops: 0,
      },
      16,
    );
  }

  private pickup(agent: AntAgent): void {
    agent.carryingFood = true;
    agent.pendingOutbound = Math.max(0, agent.distanceTraveled - agent.outboundOrigin);
    const voxel = this.world.voxelOf(agent.position.x, agent.position.y, agent.position.z);
    const cell = voxel ? this.world.index(voxel.ix, voxel.iy, voxel.iz) : -1;
    agent.pushCrumb(agent.position.x, agent.position.y, agent.position.z, cell, 0, true);
    agent.sampleOutbound(agent.position.x, agent.position.y, agent.position.z, 0);
    agent.decisionCooldown = 0;
    agent.state = "RETURNING_HOME";
  }

  private deliver(agent: AntAgent): void {
    const trip = agent.pendingOutbound > 0 ? agent.pendingOutbound : Math.max(0, agent.distanceTraveled - agent.outboundOrigin);
    agent.carryingFood = false;
    agent.deliverTimer = 0.4;
    agent.successfulTrips++;
    this.metrics.foodDelivered++;
    this.metrics.successfulTrips++;
    if (this.metrics.timeToFirstDelivery === null) this.metrics.timeToFirstDelivery = this.time;
    if (trip > 0) {
      this.pathLengthSum += trip;
      this.pathSamples++;
      this.metrics.averagePathLength = this.pathLengthSum / this.pathSamples;
      if (this.metrics.bestPathLength === null || trip < this.metrics.bestPathLength) {
        this.metrics.bestPathLength = trip;
        const path = agent.copyOutbound();
        path.push({ x: agent.position.x, y: agent.position.y, z: agent.position.z });
        this.bestPath = path;
      }
    }
    this.metrics.routeEfficiency = routeEfficiency(this.metrics.optimalPathLength, this.metrics.bestPathLength);
    if (this.metrics.awaitingRecovery && this.metrics.lastDisruptionTime !== null) {
      this.metrics.recoveryTime = this.time - this.metrics.lastDisruptionTime;
      this.metrics.awaitingRecovery = false;
    }
    this.reinforce(agent);
    agent.crumbCount = 0;
    agent.outboundCount = 0;
    agent.outboundOrigin = agent.distanceTraveled;
    agent.pendingOutbound = 0;
    const voxel = this.world.voxelOf(agent.position.x, agent.position.y, agent.position.z);
    if (voxel) {
      const id = this.world.index(voxel.ix, voxel.iy, voxel.iz);
      agent.pushCrumb(agent.position.x, agent.position.y, agent.position.z, id, 0, true);
      agent.sampleOutbound(agent.position.x, agent.position.y, agent.position.z, 0);
    }
    agent.state = "DELIVERING";
  }

  private reinforce(agent: AntAgent): void {
    if (!this.config.pheromoneEnabled) return;
    const bonus = this.config.pheromoneStrength * 2;
    const seen = new Set<number>();
    for (let i = 0; i < agent.outboundCount; i++) {
      const voxel = this.world.voxelOf(agent.outboundX[i], agent.outboundY[i], agent.outboundZ[i]);
      if (!voxel) continue;
      const id = this.world.index(voxel.ix, voxel.iy, voxel.iz);
      if (seen.has(id) || this.world.solids[id] === 1) continue;
      seen.add(id);
      this.pheromones.deposit(voxel.ix, voxel.iy, voxel.iz, bonus, bonus * 0.65, this.config.maxPheromone);
    }
  }

  private assignState(agent: AntAgent): void {
    if (agent.deliverTimer > 0 && !agent.carryingFood) {
      agent.state = "DELIVERING";
      return;
    }
    if (agent.carryingFood) {
      agent.state = "RETURNING_HOME";
      return;
    }
    if (agent.recoverTimer > 0) {
      agent.state = "RECOVERING";
      return;
    }
    if (agent.sensedFood) {
      agent.state = "FOOD_DISCOVERED";
      return;
    }
    if (agent.followingPheromone || agent.usingSharedRoute) {
      agent.state = "FOLLOWING_TRAIL";
      return;
    }
    agent.state = "EXPLORING";
  }

  private applySeparation(agent: AntAgent): void {
    const reach = this.radius * 2.3;
    const count = this.spatial.query(agent.position.x, agent.position.y, agent.position.z, reach, agent.id);
    if (count === 0) return;
    let px = 0;
    let py = 0;
    let pz = 0;
    const r2 = reach * reach;
    for (let i = 0; i < count; i++) {
      const other = this.agents[this.spatial.queryIds[i]];
      const dx = agent.position.x - other.position.x;
      const dy = agent.position.y - other.position.y;
      const dz = agent.position.z - other.position.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > r2 || d2 < 1e-8) continue;
      const d = Math.sqrt(d2);
      const push = (reach - d) / reach;
      px += (dx / d) * push;
      py += (dy / d) * push;
      pz += (dz / d) * push;
    }
    let scale = 0.28;
    if (!agent.carryingFood && agent.sensedFood) {
      const goal = Math.hypot(agent.sensorFoodX - agent.position.x, agent.sensorFoodY - agent.position.y, agent.sensorFoodZ - agent.position.z);
      if (goal < this.config.foodRadius + 1.5) scale = 0;
    } else if (agent.carryingFood && agent.sensedNest) {
      const goal = Math.hypot(agent.sensorNestX - agent.position.x, agent.sensorNestY - agent.position.y, agent.sensorNestZ - agent.position.z);
      if (goal < this.config.nestRadius + 1.5) scale = 0;
    }
    agent.direction.x += px * scale;
    agent.direction.y += py * scale;
    agent.direction.z += pz * scale;
    const len = Math.hypot(agent.direction.x, agent.direction.y, agent.direction.z);
    if (len > 1e-6) {
      agent.direction.x /= len;
      agent.direction.y /= len;
      agent.direction.z /= len;
    }
  }

  private rebuildSpatial(): void {
    this.spatial.clear();
    this.spatial.resize(this.agents.length);
    for (let i = 0; i < this.agents.length; i++) {
      const p = this.agents[i].position;
      this.spatial.insert(i, p.x, p.y, p.z);
    }
  }

  private rollup(): void {
    const counts = this.metrics.stateCounts;
    counts.EXPLORING = 0;
    counts.FOOD_DISCOVERED = 0;
    counts.RETURNING_HOME = 0;
    counts.DELIVERING = 0;
    counts.FOLLOWING_TRAIL = 0;
    counts.RECOVERING = 0;
    let knowingFood = 0;
    let knowingHome = 0;
    let carrying = 0;
    for (let i = 0; i < this.agents.length; i++) {
      const agent = this.agents[i];
      counts[agent.state]++;
      if (agent.carryingFood) carrying++;
      if (agent.knowledge.foodKnown && agent.knowledge.foodConfidence >= 0.05) knowingFood++;
      if (agent.knowledge.homeKnown && agent.knowledge.homeConfidence >= 0.05) knowingHome++;
    }
    this.metrics.time = this.time;
    this.metrics.totalAgents = this.agents.length;
    this.metrics.exploring = counts.EXPLORING;
    this.metrics.returning = counts.RETURNING_HOME;
    this.metrics.carrying = carrying;
    this.metrics.knowingFood = knowingFood;
    this.metrics.knowingHome = knowingHome;
    this.metrics.exploredVolume = this.world.exploredPercent();
    this.metrics.meanPheromone = this.pheromones.mean();
    this.metrics.reachable = this.world.reachable;
    this.metrics.routeEfficiency = routeEfficiency(this.metrics.optimalPathLength, this.metrics.bestPathLength);
  }

  copyMetrics(): SimulationMetrics {
    return {
      ...this.metrics,
      stateCounts: { ...this.metrics.stateCounts },
      disruptions: this.metrics.disruptions.map((d) => ({ ...d })),
    };
  }

  historySample(): HistorySample {
    const n = Math.max(1, this.agents.length);
    return {
      t: this.metrics.time,
      foodDelivered: this.metrics.foodDelivered,
      routeEfficiency: this.metrics.routeEfficiency,
      knowingFoodPct: (this.metrics.knowingFood / n) * 100,
      knowledgeExchanges: this.metrics.knowledgeExchanges,
      meanPheromone: this.metrics.meanPheromone,
      exploredVolume: this.metrics.exploredVolume,
      exploring: this.metrics.stateCounts.EXPLORING,
      returning: this.metrics.stateCounts.RETURNING_HOME,
      carrying: this.metrics.carrying,
      recovering: this.metrics.stateCounts.RECOVERING,
      following: this.metrics.stateCounts.FOLLOWING_TRAIL,
      delivering: this.metrics.stateCounts.DELIVERING,
      discovered: this.metrics.stateCounts.FOOD_DISCOVERED,
      sinceDisruption:
        this.metrics.foodAtDisruption === null ? null : this.metrics.foodDelivered - this.metrics.foodAtDisruption,
    };
  }

  toResult(): ExperimentResult {
    return {
      experimentId: `${this.config.mode}-${this.config.mazeType}-s${this.config.seed}`,
      algorithm: this.config.mode,
      seed: this.config.seed,
      population: this.agents.length,
      mazeType: this.config.mazeType,
      discoveryTime: this.metrics.timeToFirstDiscovery,
      firstDeliveryTime: this.metrics.timeToFirstDelivery,
      foodDelivered: this.metrics.foodDelivered,
      averagePathLength: this.metrics.averagePathLength,
      bestPathLength: this.metrics.bestPathLength,
      optimalPathLength: this.metrics.optimalPathLength,
      routeEfficiency: this.metrics.routeEfficiency,
      knowledgeExchanges: this.metrics.knowledgeExchanges,
      exploredVolume: this.metrics.exploredVolume,
      disruptionRecoveryTime: this.metrics.recoveryTime,
      routeDisconnected: this.metrics.routeDisconnected,
    };
  }

  private resetAgents(): void {
    const count = Math.max(1, Math.min(2500, Math.floor(this.config.population)));
    this.ensureAgentCount(count);
    const cells = this.spawnCells(count);
    for (let i = 0; i < count; i++) {
      const cell = cells[i % cells.length];
      const center = this.world.cellCenter(cell.ix, cell.iy, cell.iz);
      const jitter = Math.max(0, this.world.cellSize * 0.5 - this.radius - 0.05) * 0.4;
      let x = center.x + this.rng.signed() * jitter;
      let y = center.y + this.rng.signed() * jitter;
      let z = center.z + this.rng.signed() * jitter;
      if (isPositionBlocked(this.world, x, y, z, this.radius)) {
        x = center.x;
        y = center.y;
        z = center.z;
      }
      const dir = this.randomUnit();
      const agent = this.agents[i];
      agent.reset(i, x, y, z, this.config.energyMax, dir.x, dir.y, dir.z);
      if (hasLineOfSight(this.world, x, y, z, this.world.nest.x, this.world.nest.y, this.world.nest.z)) {
        const nestDist = Math.hypot(x - this.world.nest.x, y - this.world.nest.y, z - this.world.nest.z);
        if (nestDist <= this.config.sensingRadius) {
          agent.rememberHome(this.world.nest.x, this.world.nest.y, this.world.nest.z, 0);
        }
      }
      const voxel = this.world.voxelOf(x, y, z);
      if (voxel) {
        const id = this.world.index(voxel.ix, voxel.iy, voxel.iz);
        agent.lastCell = id;
        agent.pushCrumb(x, y, z, id, 0, true);
        agent.sampleOutbound(x, y, z, 0);
        this.world.markVisit(id);
      }
    }
    this.agents.length = count;
    this.spatial.resize(count);
    this.rebuildSpatial();
  }

  private resizePopulation(count: number): void {
    if (count < this.agents.length) {
      this.agents.length = count;
      this.spatial.resize(count);
      return;
    }
    const cells = this.spawnCells(count);
    while (this.agents.length < count) {
      const i = this.agents.length;
      const agent = new AntAgent(i, this.config.maxCrumbs);
      const cell = cells[Math.min(i, cells.length - 1)];
      const center = this.world.cellCenter(cell.ix, cell.iy, cell.iz);
      const dir = this.randomUnit();
      agent.reset(i, center.x, center.y, center.z, this.config.energyMax, dir.x, dir.y, dir.z);
      if (hasLineOfSight(this.world, center.x, center.y, center.z, this.world.nest.x, this.world.nest.y, this.world.nest.z)) {
        const nestDist = Math.hypot(center.x - this.world.nest.x, center.y - this.world.nest.y, center.z - this.world.nest.z);
        if (nestDist <= this.config.sensingRadius) agent.rememberHome(this.world.nest.x, this.world.nest.y, this.world.nest.z, this.time);
      }
      this.agents.push(agent);
    }
    this.spatial.resize(count);
  }

  private ensureAgentCount(count: number): void {
    while (this.agents.length < count) this.agents.push(new AntAgent(this.agents.length, this.config.maxCrumbs));
  }

  private spawnCells(count: number): { ix: number; iy: number; iz: number }[] {
    const cells: { ix: number; iy: number; iz: number }[] = [];
    const origin = this.world.voxelOf(this.world.nest.x, this.world.nest.y, this.world.nest.z);
    const start = origin ? nearestOpenVoxel(this.world, origin.ix, origin.iy, origin.iz, 8) : nearestOpenVoxel(this.world, 1, 1, 1, 8);
    if (!start) {
      cells.push({ ix: 1, iy: 1, iz: 1 });
      return cells;
    }
    const food = this.world.voxelOf(this.world.food.x, this.world.food.y, this.world.food.z);
    const foodIndex = food ? this.world.index(food.ix, food.iy, food.iz) : -1;
    const seen = new Uint8Array(this.world.voxelCount);
    const depth = new Int16Array(this.world.voxelCount);
    const queue: number[] = [start.index];
    seen[start.index] = 1;
    depth[start.index] = 0;
    let head = 0;
    // Stay in the nest neighborhood. Spreading across the maze was putting
    // agents on the food with an empty trail, so return navigation never started.
    const maxDepth = 2;
    while (head < queue.length) {
      const cur = queue[head++];
      if (cur !== foodIndex) cells.push(this.world.decode(cur));
      if (depth[cur] >= maxDepth) continue;
      const c = this.world.decode(cur);
      for (let d = 0; d < 6; d++) {
        const ix = c.ix + DIRS[d][0];
        const iy = c.iy + DIRS[d][1];
        const iz = c.iz + DIRS[d][2];
        if (!this.world.inBounds(ix, iy, iz) || this.world.isSolid(ix, iy, iz)) continue;
        const ni = this.world.index(ix, iy, iz);
        if (seen[ni]) continue;
        seen[ni] = 1;
        depth[ni] = depth[cur] + 1;
        queue.push(ni);
      }
    }
    if (cells.length === 0) cells.push({ ix: start.ix, iy: start.iy, iz: start.iz });
    return cells;
  }

  private randomUnit(): Vector3D {
    const theta = this.rng.next() * Math.PI * 2;
    const u = this.rng.signed();
    const r = Math.sqrt(Math.max(0, 1 - u * u));
    return { x: Math.cos(theta) * r, y: u, z: Math.sin(theta) * r };
  }

  private randomRecoverDirection(agent: AntAgent): void {
    const dir = this.randomUnit();
    agent.recoverX = dir.x;
    agent.recoverY = dir.y;
    agent.recoverZ = dir.z;
    agent.direction.x = dir.x;
    agent.direction.y = dir.y;
    agent.direction.z = dir.z;
  }
}

function middleOut(trail: number[]): number[] {
  const mid = Math.floor(trail.length / 2);
  const order: number[] = [];
  for (let d = 0; d < trail.length; d++) {
    if (mid - d >= 0) order.push(trail[mid - d]);
    if (d > 0 && mid + d < trail.length) order.push(trail[mid + d]);
  }
  return order;
}

function chebyshev(
  a: { ix: number; iy: number; iz: number },
  b: { ix: number; iy: number; iz: number },
): number {
  return Math.max(Math.abs(a.ix - b.ix), Math.abs(a.iy - b.iy), Math.abs(a.iz - b.iz));
}

function trailAxis(world: World3D, trail: number[], id: number): 0 | 1 | 2 {
  const at = trail.indexOf(id);
  const other = trail[Math.min(trail.length - 1, at + 1)] ?? trail[Math.max(0, at - 1)];
  const a = world.decode(id);
  const b = world.decode(other);
  const dx = Math.abs(a.ix - b.ix);
  const dy = Math.abs(a.iy - b.iy);
  const dz = Math.abs(a.iz - b.iz);
  if (dy >= dx && dy >= dz) return 1;
  if (dz >= dx && dz >= dy) return 2;
  return 0;
}

function barrierCells(world: World3D, ix: number, iy: number, iz: number, axis: 0 | 1 | 2): number[] {
  const cells: number[] = [];
  const push = (x: number, y: number, z: number) => {
    if (!world.inBounds(x, y, z) || world.isShell(x, y, z)) return;
    const nest = world.voxelOf(world.nest.x, world.nest.y, world.nest.z);
    const food = world.voxelOf(world.food.x, world.food.y, world.food.z);
    if (nest && nest.ix === x && nest.iy === y && nest.iz === z) return;
    if (food && food.ix === x && food.iy === y && food.iz === z) return;
    cells.push(world.index(x, y, z));
  };
  if (axis === 0) {
    for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) push(ix, iy + y, iz + z);
  } else if (axis === 1) {
    for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) push(ix + x, iy, iz + z);
  } else {
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) push(ix + x, iy + y, iz);
  }
  if (cells.length === 0) push(ix, iy, iz);
  return cells;
}
