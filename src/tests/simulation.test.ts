import { describe, expect, it } from "vitest";
import { runSingleTrial, summarizeByAlgorithm } from "../engine/ExperimentRunner";
import { isPositionBlocked, moveWithCollision } from "../engine/CollisionSystem";
import { SimulationEngine } from "../engine/SimulationEngine";
import { createDefaultConfig, routeEfficiency } from "../utils/config";
import { resultsToCsv, resultsToJson } from "../utils/exportResults";
import { SeededRandom } from "../utils/seededRandom";
import type { SimulationConfig } from "../types/simulation";

function small(patch: Partial<SimulationConfig> = {}): SimulationConfig {
  return {
    ...createDefaultConfig(),
    worldWidth: 30,
    worldHeight: 15,
    worldDepth: 30,
    cellSize: 3,
    population: 8,
    seed: 21,
    ...patch,
  };
}

describe("simulation mechanics", () => {
  it("blocks movement into solid voxels", () => {
    const engine = new SimulationEngine(small());
    engine.generateMaze("empty");
    engine.world.setSolid(3, 1, 1, true);
    const pos = { x: 8.2, y: 4.5, z: 4.5 };
    moveWithCollision(engine.world, pos, 6, 0, 0, 0.3);
    expect(pos.x).toBeLessThan(9);
    expect(engine.world.isSolidAt(pos.x, pos.y, pos.z)).toBe(false);
    expect(isPositionBlocked(engine.world, 10, 4.5, 4.5, 0.3)).toBe(true);
  });

  it("keeps agents out of obstacles across random steps", () => {
    const engine = new SimulationEngine(small({ population: 15, seed: 8, mazeType: "backtracking" }));
    engine.generateMaze("backtracking");
    for (let i = 0; i < 40; i++) engine.step(0.05);
    for (const agent of engine.agents) {
      expect(isPositionBlocked(engine.world, agent.position.x, agent.position.y, agent.position.z, engine.radius)).toBe(false);
    }
  });

  it("moves continuously instead of teleporting toward a goal", () => {
    const engine = new SimulationEngine(small({ population: 1, moveSpeed: 5, seed: 2 }));
    engine.generateMaze("empty");
    const before = { ...engine.agents[0].position };
    engine.step(0.05);
    const step = Math.hypot(
      engine.agents[0].position.x - before.x,
      engine.agents[0].position.y - before.y,
      engine.agents[0].position.z - before.z,
    );
    expect(step).toBeLessThanOrEqual(5 * 0.05 + 0.05);
    expect(step).toBeGreaterThan(0);
  });

  it("picks up food and delivers it by occupying the nest", () => {
    const engine = new SimulationEngine(
      small({ population: 1, moveSpeed: 0, energyDrain: 0, sensingRadius: 2, nestRadius: 1.5, foodRadius: 1.5 }),
    );
    engine.generateMaze("empty");
    const agent = engine.agents[0];
    agent.position.x = engine.world.food.x;
    agent.position.y = engine.world.food.y;
    agent.position.z = engine.world.food.z;
    agent.outboundOrigin = 0;
    agent.distanceTraveled = 12;
    engine.step(0.05);
    expect(agent.carryingFood).toBe(true);
    agent.position.x = engine.world.nest.x;
    agent.position.y = engine.world.nest.y;
    agent.position.z = engine.world.nest.z;
    engine.step(0.05);
    expect(agent.carryingFood).toBe(false);
    expect(engine.metrics.foodDelivered).toBe(1);
    expect(engine.metrics.successfulTrips).toBe(1);
    expect(engine.metrics.timeToFirstDelivery).not.toBeNull();
    expect(engine.metrics.bestPathLength).not.toBeNull();
  });

  it("counts a failed trip when a carrier runs out of energy", () => {
    const engine = new SimulationEngine(small({ population: 1, moveSpeed: 0, energyRegen: 0, energyDrain: 0 }));
    engine.generateMaze("empty");
    const agent = engine.agents[0];
    agent.carryingFood = true;
    agent.energy = 0;
    agent.position.x = engine.world.width * 0.5;
    agent.position.y = engine.world.height * 0.5;
    agent.position.z = engine.world.depth * 0.5;
    engine.step(0.05);
    expect(agent.carryingFood).toBe(false);
    expect(engine.metrics.failedTrips).toBe(1);
    expect(engine.metrics.foodDelivered).toBe(0);
  });

  it("reproduces agent positions from the same seed", () => {
    const make = () => {
      const engine = new SimulationEngine(small({ population: 10, seed: 99, mazeType: "division" }));
      engine.generateMaze("division");
      for (let i = 0; i < 25; i++) engine.step(0.05);
      return engine.agents.map((a) => [a.position.x, a.position.y, a.position.z, a.state]);
    };
    expect(make()).toEqual(make());
  });

  it("disrupts a pheromone trail and clears pheromone in the barrier", () => {
    const engine = new SimulationEngine(small({ population: 1, moveSpeed: 0 }));
    engine.generateMaze("empty");
    const path = engine.referencePath;
    expect(path.length).toBeGreaterThan(4);
    for (const point of path) {
      const voxel = engine.world.voxelOf(point.x, point.y, point.z);
      if (!voxel) continue;
      engine.pheromones.deposit(voxel.ix, voxel.iy, voxel.iz, 5, 5, 10);
    }
    const result = engine.destroyDominantRoute();
    expect(result.applied).toBe(true);
    expect(result.ix).toBeDefined();
    const ix = result.ix!;
    const iy = result.iy!;
    const iz = result.iz!;
    expect(engine.world.isSolid(ix, iy, iz)).toBe(true);
    expect(engine.pheromones.food[engine.world.index(ix, iy, iz)]).toBe(0);
    expect(engine.pheromones.home[engine.world.index(ix, iy, iz)]).toBe(0);
    expect(engine.metrics.disruptionCount).toBe(1);
  });

  it("classifies a one-cell tunnel disruption as disconnected", () => {
    const engine = new SimulationEngine(
      small({ worldWidth: 36, worldHeight: 12, worldDepth: 12, population: 1, moveSpeed: 0 }),
    );
    engine.world.fill(true);
    for (let x = 1; x < engine.world.nx - 1; x++) engine.world.solids[engine.world.index(x, 1, 1)] = 0;
    engine.world.recomputeOpen();
    engine.world.nest = engine.world.cellCenter(1, 1, 1);
    engine.world.food = engine.world.cellCenter(engine.world.nx - 2, 1, 1);
    engine.recomputeReference();
    expect(engine.world.reachable).toBe(true);
    const path = engine.referencePath;
    for (const point of path) {
      const voxel = engine.world.voxelOf(point.x, point.y, point.z);
      if (!voxel) continue;
      engine.pheromones.deposit(voxel.ix, voxel.iy, voxel.iz, 4, 4, 10);
    }
    const result = engine.destroyDominantRoute();
    expect(result.applied).toBe(true);
    expect(result.disconnected).toBe(true);
    expect(engine.metrics.optimalPathLength).toBeNull();
    expect(engine.metrics.recoveryTime).toBeNull();
  });

  it("delivers food from local sensing in an open chamber", () => {
    const engine = new SimulationEngine(
      small({
        population: 18,
        moveSpeed: 14,
        sensingRadius: 40,
        explorationProbability: 0.02,
        energyDrain: 0,
        seed: 6,
        mode: "coa",
        pheromoneEnabled: true,
        relayEnabled: true,
        communicationRadius: 6,
      }),
    );
    engine.generateMaze("empty");
    const nest = engine.world.voxelOf(engine.world.nest.x, engine.world.nest.y, engine.world.nest.z)!;
    engine.placeFood(nest.ix + 3, nest.iy, nest.iz + 2);
    for (let i = 0; i < 200; i++) engine.step(0.05);
    expect(engine.metrics.timeToFirstDiscovery).not.toBeNull();
    expect(engine.metrics.foodDelivered).toBeGreaterThan(0);
    expect(engine.metrics.timeToFirstDelivery).not.toBeNull();
  });
});

describe("experiment results", () => {
  it("uses null when a short trial discovers nothing", () => {
    const spec = {
      algorithm: "random" as const,
      mazeType: "backtracking" as const,
      population: 2,
      seed: 4,
      duration: 0.2,
      trials: 1,
      disruption: false,
      disruptionFraction: 0.5,
      config: small({ sensingRadius: 1.2, moveSpeed: 1, population: 2 }),
    };
    const result = runSingleTrial(spec, 0);
    expect(result.foodDelivered).toBe(0);
    expect(result.discoveryTime).toBeNull();
    expect(result.firstDeliveryTime).toBeNull();
    expect(result.averagePathLength).toBeNull();
    expect(result.bestPathLength).toBeNull();
    expect(result.routeEfficiency).toBeNull();
    expect(result.optimalPathLength).not.toBeNull();
    expect(result.knowledgeExchanges).toBe(0);
    expect(result.algorithm).toBe("random");
    expect(result.seed).toBe(4);
  });

  it("keeps relay exchanges at zero in the ACO baseline", () => {
    const spec = {
      algorithm: "aco" as const,
      mazeType: "empty" as const,
      population: 6,
      seed: 15,
      duration: 1,
      trials: 1,
      disruption: false,
      disruptionFraction: 0.5,
      config: small({ population: 6, communicationRadius: 8 }),
    };
    const result = runSingleTrial(spec, 0);
    expect(result.knowledgeExchanges).toBe(0);
    expect(result.optimalPathLength).toBeGreaterThan(0);
  });

  it("summarizes only measured values", () => {
    const rows = [
      {
        experimentId: "a",
        algorithm: "coa",
        seed: 1,
        population: 4,
        mazeType: "empty",
        discoveryTime: 2,
        firstDeliveryTime: null,
        foodDelivered: 3,
        averagePathLength: null,
        bestPathLength: 10,
        optimalPathLength: 5,
        routeEfficiency: 0.5,
        knowledgeExchanges: 4,
        exploredVolume: 20,
        disruptionRecoveryTime: null,
        routeDisconnected: false,
      },
      {
        experimentId: "b",
        algorithm: "coa",
        seed: 2,
        population: 4,
        mazeType: "empty",
        discoveryTime: 4,
        firstDeliveryTime: 6,
        foodDelivered: 1,
        averagePathLength: 12,
        bestPathLength: 8,
        optimalPathLength: 5,
        routeEfficiency: null,
        knowledgeExchanges: 2,
        exploredVolume: 10,
        disruptionRecoveryTime: 3,
        routeDisconnected: false,
      },
    ];
    const [summary] = summarizeByAlgorithm(rows);
    expect(summary.meanFoodDelivered).toBe(2);
    expect(summary.meanDiscoveryTime).toBe(3);
    expect(summary.deliverySamples).toBe(1);
    expect(summary.meanFirstDelivery).toBe(6);
    expect(summary.efficiencySamples).toBe(1);
    expect(summary.meanRecovery).toBe(3);
    expect(routeEfficiency(5, 10)).toBe(0.5);
    expect(routeEfficiency(null, 10)).toBeNull();
    expect(routeEfficiency(5, 0)).toBeNull();
  });

  it("exports csv and json without inventing nulls as zero", () => {
    const result = runSingleTrial(
      {
        algorithm: "random",
        mazeType: "empty",
        population: 1,
        seed: 3,
        duration: 0,
        trials: 1,
        disruption: false,
        disruptionFraction: 0.4,
        config: small({ population: 1 }),
      },
      0,
    );
    const csv = resultsToCsv([result]);
    expect(csv.split("\n")[0]).toContain("discoveryTime");
    expect(csv.split("\n")[1].split(",")[5]).toBe("");
    const parsed = JSON.parse(resultsToJson([result]));
    expect(parsed[0].discoveryTime).toBeNull();
  });

  it("a default backtracking colony walks food home", () => {
    const engine = new SimulationEngine(createDefaultConfig());
    engine.generateMaze("backtracking");
    const food = engine.world.voxelOf(engine.world.food.x, engine.world.food.y, engine.world.food.z);
    expect(food).not.toBeNull();
    for (const agent of engine.agents) {
      const here = engine.world.voxelOf(agent.position.x, agent.position.y, agent.position.z);
      expect(here).not.toBeNull();
      expect(here!.ix === food!.ix && here!.iy === food!.iy && here!.iz === food!.iz).toBe(false);
    }
    const dt = 1 / 20;
    for (let i = 0; i < 20 * 150 && engine.metrics.foodDelivered === 0; i++) engine.step(dt);
    expect(engine.metrics.foodDelivered).toBeGreaterThan(0);
    expect(engine.metrics.timeToFirstDiscovery).not.toBeNull();
    expect(engine.metrics.timeToFirstDelivery).toBeGreaterThan(1);
  }, 30000);
});

describe("seeded randomness", () => {
  it("replays an identical stream", () => {
    const a = new SeededRandom(123456);
    const b = new SeededRandom(123456);
    const c = new SeededRandom(123457);
    const seqA = [a.next(), a.next(), a.nextInt(10), a.signed()];
    const seqB = [b.next(), b.next(), b.nextInt(10), b.signed()];
    const seqC = [c.next(), c.next(), c.nextInt(10), c.signed()];
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
  });
});
