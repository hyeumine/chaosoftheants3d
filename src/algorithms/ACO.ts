import type { AntAgent } from "../engine/AntAgent";
import { steer, type SteerContext } from "./steering";

/**
 * Mode 2 — ACO-inspired baseline.
 * This is not a verbatim reproduction of a published Ant System, Ant Colony
 * System, or Max-Min variant. It is a 3D baseline with:
 *   - dual food/home pheromone fields
 *   - probabilistic exploitation of the local 6-neighbor gradient
 *   - evaporation, reinforcement after a successful delivery
 *   - personal sensing and breadcrumb return
 * Encounter relay is ignored even if stale relayed facts are present.
 */
export function steerAco(agent: AntAgent, ctx: SteerContext): void {
  steer(agent, ctx, {
    usePheromone: ctx.pheromoneEnabled,
    useRelayedKnowledge: false,
    useSharedSegments: false,
  });
}
