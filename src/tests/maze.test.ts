import { describe, expect, it } from "vitest";
import { SimulationEngine } from "../engine/SimulationEngine";
import { verticalOpenLinks } from "../engine/PathAnalysis";
import { createDefaultConfig } from "../utils/config";
import type { MazeType, SimulationConfig } from "../types/simulation";

function config(seed: number, patch: Partial<SimulationConfig> = {}): SimulationConfig {
  return {
    ...createDefaultConfig(),
    worldWidth: 36,
    worldHeight: 24,
    worldDepth: 36,
    cellSize: 3,
    population: 4,
    seed,
    verticalConnectivity: 1,
    alternativeRoutes: 3,
    mazeComplexity: 4,
    passageWidth: 1,
    ...patch,
  };
}

const kinds: MazeType[] = ["backtracking", "division", "obstacles"];

describe("3D maze connectivity", () => {
  for (const kind of kinds) {
    for (const seed of [1, 2, 7, 42]) {
      it(`${kind} seed ${seed} connects nest to food`, () => {
        const engine = new SimulationEngine(config(seed, { mazeType: kind, obstacleDensity: 0.2 }));
        engine.generateMaze(kind);
        expect(engine.world.reachable).toBe(true);
        expect(engine.metrics.optimalPathLength).not.toBeNull();
        expect(engine.metrics.optimalPathLength!).toBeGreaterThan(0);
        expect(engine.referencePath.length).toBeGreaterThan(1);
        expect(engine.world.isSolidAt(engine.world.nest.x, engine.world.nest.y, engine.world.nest.z)).toBe(false);
        expect(engine.world.isSolidAt(engine.world.food.x, engine.world.food.y, engine.world.food.z)).toBe(false);
        const separated =
          Math.hypot(
            engine.world.nest.x - engine.world.food.x,
            engine.world.nest.y - engine.world.food.y,
            engine.world.nest.z - engine.world.food.z,
          ) > engine.world.cellSize;
        expect(separated).toBe(true);
      });
    }
  }

  it("is reproducible for the same seed and different for another seed", () => {
    const a = new SimulationEngine(config(11, { mazeType: "backtracking" }));
    const b = new SimulationEngine(config(11, { mazeType: "backtracking" }));
    const c = new SimulationEngine(config(12, { mazeType: "backtracking" }));
    a.generateMaze("backtracking");
    b.generateMaze("backtracking");
    c.generateMaze("backtracking");
    expect(Array.from(a.world.solids)).toEqual(Array.from(b.world.solids));
    expect(Array.from(a.world.solids)).not.toEqual(Array.from(c.world.solids));
  });

  it("default backtracking food sits a medium distance from the nest", () => {
    const engine = new SimulationEngine({ ...createDefaultConfig(), population: 2, seed: 42 });
    engine.generateMaze("backtracking");
    const length = engine.metrics.optimalPathLength;
    expect(length).not.toBeNull();
    expect(length!).toBeGreaterThan(engine.world.cellSize * 8);
    expect(length!).toBeLessThan(engine.world.cellSize * 48);
    const ys = new Set(engine.referencePath.map((p) => Math.floor(p.y / engine.world.cellSize)));
    expect(ys.size).toBeGreaterThan(1);
  });

  it("backtracking with full vertical connectivity opens vertical links", () => {
    const engine = new SimulationEngine(config(5, { mazeType: "backtracking", verticalConnectivity: 1 }));
    engine.generateMaze("backtracking");
    expect(verticalOpenLinks(engine.world)).toBeGreaterThan(0);
    const ys = new Set(engine.referencePath.map((p) => Math.floor(p.y / engine.world.cellSize)));
    expect(ys.size).toBeGreaterThan(1);
  });

  it("a vertical shaft is reachable by the reference search", () => {
    const engine = new SimulationEngine(config(1, { worldHeight: 21, population: 1 }));
    engine.world.fill(true);
    for (let y = 1; y < engine.world.ny - 1; y++) engine.world.solids[engine.world.index(1, y, 1)] = 0;
    engine.world.recomputeOpen();
    engine.world.nest = engine.world.cellCenter(1, 1, 1);
    engine.world.food = engine.world.cellCenter(1, engine.world.ny - 2, 1);
    engine.recomputeReference();
    expect(engine.metrics.optimalPathLength).not.toBeNull();
    const ys = engine.referencePath.map((p) => p.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(engine.world.cellSize);
  });
});
