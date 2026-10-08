import { describe, expect, it } from "vitest";
import { computeNeighborWeights } from "../algorithms/steering";
import { decayKnowledge } from "../engine/KnowledgeExchange";
import { SimulationEngine } from "../engine/SimulationEngine";
import { createDefaultConfig } from "../utils/config";
import type { SimulationConfig } from "../types/simulation";

function base(patch: Partial<SimulationConfig> = {}): SimulationConfig {
  return {
    ...createDefaultConfig(),
    worldWidth: 30,
    worldHeight: 15,
    worldDepth: 30,
    cellSize: 3,
    population: 2,
    seed: 9,
    moveSpeed: 0,
    sensingRadius: 1,
    communicationRadius: 5,
    relayRetention: 0.5,
    knowledgeDecay: 0,
    exchangeCooldown: 0,
    explorationProbability: 0,
    pheromoneEnabled: false,
    relayEnabled: false,
    mode: "random",
    ...patch,
  };
}

function teachFood(engine: SimulationEngine): void {
  const agent = engine.agents[0];
  agent.knowledge.foodKnown = true;
  agent.knowledge.foodPosition = { x: 3, y: 3, z: 3 };
  agent.knowledge.foodConfidence = 1;
  agent.knowledge.foodHops = 0;
  agent.knowledge.foodVersion = 4;
  agent.knowledge.foodSourceId = 0;
  engine.agents[0].position.x = 12;
  engine.agents[0].position.y = 6;
  engine.agents[0].position.z = 12;
  engine.agents[1].position.x = 12.4;
  engine.agents[1].position.y = 6;
  engine.agents[1].position.z = 12;
  engine.agents[1].knowledge.foodKnown = false;
  engine.agents[1].knowledge.foodConfidence = 0;
}

describe("knowledge relay", () => {
  it("decays confidence with exp(-rate * dt)", () => {
    const engine = new SimulationEngine(base());
    engine.generateMaze("empty");
    const agent = engine.agents[0];
    agent.knowledge.foodKnown = true;
    agent.knowledge.foodConfidence = 1;
    agent.knowledge.foodPosition = { x: 1, y: 1, z: 1 };
    decayKnowledge(agent, 1, Math.log(2));
    expect(agent.knowledge.foodConfidence).toBeCloseTo(0.5);
  });

  it("does not transfer food knowledge when relay is disabled", () => {
    const engine = new SimulationEngine(base({ relayEnabled: false, mode: "aco", pheromoneEnabled: true }));
    engine.generateMaze("empty");
    teachFood(engine);
    engine.step(0.05);
    engine.step(0.05);
    expect(engine.agents[1].knowledge.foodKnown).toBe(false);
    expect(engine.metrics.knowledgeExchanges).toBe(0);
  });

  it("transfers food knowledge inside the radius and reduces confidence", () => {
    const engine = new SimulationEngine(base({ relayEnabled: true, mode: "coa", pheromoneEnabled: true }));
    engine.generateMaze("empty");
    teachFood(engine);
    engine.step(0.05);
    const received = engine.agents[1].knowledge;
    expect(received.foodKnown).toBe(true);
    expect(received.foodHops).toBe(1);
    expect(received.foodConfidence).toBeLessThan(1);
    expect(received.foodConfidence).toBeGreaterThan(0.3);
    expect(received.foodPosition?.x).toBeCloseTo(3);
    expect(engine.metrics.knowledgeExchanges).toBe(1);
    decayKnowledge(engine.agents[1], 1, Math.log(2));
    for (const agent of engine.agents) {
      agent.knowledge.routeSegments.length = 0;
      agent.knowledge.obstacleObservations.length = 0;
      agent.knowledge.homeKnown = true;
      agent.knowledge.homeConfidence = 1;
      agent.knowledge.homeHops = 0;
      agent.knowledge.homeVersion = 1;
      agent.knowledge.homeSourceId = agent.id;
      const voxel = engine.world.voxelOf(agent.position.x, agent.position.y, agent.position.z);
      if (voxel) agent.lastCell = engine.world.index(voxel.ix, voxel.iy, voxel.iz);
    }
    const before = engine.agents[1].knowledge.foodConfidence;
    engine.step(0.05);
    expect(engine.metrics.knowledgeExchanges).toBe(1);
    expect(engine.agents[1].knowledge.foodConfidence).toBeGreaterThanOrEqual(before - 1e-6);
    expect(engine.agents[1].knowledge.foodVersion).toBe(4);
  });

  it("does not transfer across a gap larger than the communication radius", () => {
    const engine = new SimulationEngine(base({ relayEnabled: true, mode: "coa", communicationRadius: 2 }));
    engine.generateMaze("empty");
    teachFood(engine);
    engine.agents[1].position.x = 25;
    engine.agents[1].position.y = 6;
    engine.agents[1].position.z = 12;
    engine.step(0.05);
    expect(engine.agents[1].knowledge.foodKnown).toBe(false);
  });

  it("CoA neighbor weights use relayed food memory and ACO weights do not", () => {
    const engine = new SimulationEngine(base({ population: 1 }));
    engine.generateMaze("empty");
    const agent = engine.agents[0];
    agent.position.x = engine.world.cellCenter(4, 2, 4).x;
    agent.position.y = engine.world.cellCenter(4, 2, 4).y;
    agent.position.z = engine.world.cellCenter(4, 2, 4).z;
    agent.knowledge.foodKnown = true;
    agent.knowledge.foodConfidence = 1;
    agent.knowledge.foodHops = 3;
    agent.knowledge.foodSourceId = 99;
    agent.knowledge.foodPosition = { x: agent.position.x + 12, y: agent.position.y, z: agent.position.z };
    const ctx = {
      world: engine.world,
      pheromones: engine.pheromones,
      rng: engine.rng,
      explorationProbability: 0,
      pheromoneEnabled: false,
      sensingRadius: 5,
    };
    const coa = computeNeighborWeights(agent, ctx, {
      usePheromone: false,
      useRelayedKnowledge: true,
      useSharedSegments: true,
    });
    const aco = computeNeighborWeights(agent, ctx, {
      usePheromone: false,
      useRelayedKnowledge: false,
      useSharedSegments: false,
    });
    expect(coa.weights[0]).toBeGreaterThan(coa.weights[1]);
    expect(aco.weights[0]).toBeCloseTo(aco.weights[1]);
  });
});
