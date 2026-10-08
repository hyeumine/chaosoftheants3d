import type { AntAgent } from "../engine/AntAgent";
import { steer, type SteerContext } from "./steering";

/**
 * Mode 3 — Chaos of the Ants.
 * Pheromone reinforcement plus encounter-based knowledge:
 * confidence, age, hop count, and local shared route fragments.
 * Relayed positions are a neighbor bias, never a global planner.
 */
export function steerCoA(agent: AntAgent, ctx: SteerContext): void {
  steer(agent, ctx, {
    usePheromone: ctx.pheromoneEnabled,
    useRelayedKnowledge: true,
    useSharedSegments: true,
  });
}
