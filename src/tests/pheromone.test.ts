import { describe, expect, it } from "vitest";
import { PheromoneField } from "../engine/PheromoneField";
import { SimulationEngine } from "../engine/SimulationEngine";
import { createDefaultConfig } from "../utils/config";

describe("pheromone deposition and evaporation", () => {
  it("adds deposit and evaporates with the discrete decay rule", () => {
    const field = new PheromoneField(4, 4, 4);
    field.deposit(1, 1, 1, 2, 0, 10);
    field.deposit(1, 1, 1, 0, 4, 10);
    const i = field.index(1, 1, 1);
    expect(field.food[i]).toBeCloseTo(2);
    expect(field.home[i]).toBeCloseTo(4);
    field.evaporate(0.5, 1);
    expect(field.food[i]).toBeCloseTo(1);
    expect(field.home[i]).toBeCloseTo(2);
    field.evaporate(1e-5, 2);
    expect(field.food[i]).toBe(0);
    expect(field.home[i]).toBe(0);
  });

  it("clamps at the configured maximum", () => {
    const field = new PheromoneField(2, 2, 2);
    field.deposit(0, 0, 0, 5, 5, 3);
    field.deposit(0, 0, 0, 5, 0, 3);
    expect(field.food[0]).toBe(3);
    expect(field.home[0]).toBe(3);
  });

  it("agents deposit home pheromone only when the field is enabled", () => {
    const enabled = new SimulationEngine({
      ...createDefaultConfig(),
      worldWidth: 24,
      worldHeight: 12,
      worldDepth: 24,
      cellSize: 3,
      population: 1,
      seed: 4,
      moveSpeed: 0,
      pheromoneEnabled: true,
      relayEnabled: false,
      mode: "aco",
    });
    enabled.generateMaze("empty");
    enabled.step(0.5);
    expect(enabled.pheromones.totalConcentration).toBeGreaterThan(0);

    const disabled = new SimulationEngine({
      ...createDefaultConfig(),
      worldWidth: 24,
      worldHeight: 12,
      worldDepth: 24,
      cellSize: 3,
      population: 1,
      seed: 4,
      moveSpeed: 0,
      pheromoneEnabled: false,
      relayEnabled: false,
      mode: "random",
    });
    disabled.generateMaze("empty");
    disabled.pheromones.deposit(1, 1, 1, 3, 3, 10);
    disabled.step(0.5);
    const total = disabled.pheromones.food.reduce((s, v) => s + v, 0) + disabled.pheromones.home.reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(6);
  });
});
