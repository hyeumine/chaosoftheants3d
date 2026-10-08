import { SimulationEngine } from "../engine/SimulationEngine";
import { createDefaultConfig } from "../utils/config";

let engine: SimulationEngine | null = null;

export function getEngine(): SimulationEngine {
  if (!engine) {
    engine = new SimulationEngine(createDefaultConfig());
    engine.generateMaze(engine.config.mazeType);
  }
  return engine;
}

export function replaceEngine(next: SimulationEngine): void {
  engine = next;
}
