import type { AntAgent } from "../engine/AntAgent";
import { steer, type SteerContext } from "./steering";

/**
 * Mode 1 — random exploration.
 * Agents use local sensing and their own breadcrumb memory.
 * Pheromone gradients and encounter relay do not influence movement.
 */
export function steerRandom(agent: AntAgent, ctx: SteerContext): void {
  steer(agent, ctx, {
    usePheromone: false,
    useRelayedKnowledge: false,
    useSharedSegments: false,
  });
}
