import type { AntAgent } from "../engine/AntAgent";
import { isPositionBlocked } from "../engine/CollisionSystem";
import type { PheromoneField } from "../engine/PheromoneField";
import type { World3D } from "../engine/World3D";
import type { RouteSegment, Vector3D } from "../types/simulation";
import { SeededRandom } from "../utils/seededRandom";

export const NEIGHBORS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

export interface SteerContext {
  world: World3D;
  pheromones: PheromoneField;
  rng: SeededRandom;
  explorationProbability: number;
  pheromoneEnabled: boolean;
  sensingRadius: number;
}

export interface SteerOptions {
  usePheromone: boolean;
  useRelayedKnowledge: boolean;
  useSharedSegments: boolean;
}

export interface MemoryPoint {
  point: Vector3D;
  confidence: number;
}

/**
 * Personal observations (hop count 0, learned by this agent) are always usable.
 * Relayed facts are usable only when the mode allows encounter knowledge.
 */
export function rememberedPoint(agent: AntAgent, kind: "food" | "home", allowRelay: boolean): MemoryPoint | null {
  const k = agent.knowledge;
  if (kind === "food") {
    if (!k.foodKnown || !k.foodPosition || k.foodConfidence < 0.08) return null;
    const personal = k.foodHops === 0 && k.foodSourceId === agent.id;
    if (!personal && !allowRelay) return null;
    return { point: k.foodPosition, confidence: k.foodConfidence };
  }
  if (!k.homeKnown || !k.homePosition || k.homeConfidence < 0.08) return null;
  const personal = k.homeHops === 0 && k.homeSourceId === agent.id;
  if (!personal && !allowRelay) return null;
  return { point: k.homePosition, confidence: k.homeConfidence };
}

export interface WeightView {
  weights: number[];
  maxChemical: number;
}

/** Local 6-neighbor scores. Blocked cells score 0. No global path is consulted. */
export function computeNeighborWeights(agent: AntAgent, ctx: SteerContext, options: SteerOptions): WeightView {
  const weights = [0, 0, 0, 0, 0, 0];
  const voxel = ctx.world.voxelOf(agent.position.x, agent.position.y, agent.position.z);
  if (!voxel) return { weights, maxChemical: 0 };
  const memory = agent.carryingFood
    ? rememberedPoint(agent, "home", options.useRelayedKnowledge)
    : rememberedPoint(agent, "food", options.useRelayedKnowledge);
  let maxChemical = 0;
  for (let d = 0; d < 6; d++) {
    const ix = voxel.ix + NEIGHBORS[d][0];
    const iy = voxel.iy + NEIGHBORS[d][1];
    const iz = voxel.iz + NEIGHBORS[d][2];
    if (!ctx.world.inBounds(ix, iy, iz) || ctx.world.isSolid(ix, iy, iz)) continue;
    const index = ctx.world.index(ix, iy, iz);
    let weight = 0.08;
    if (options.usePheromone && ctx.pheromoneEnabled) {
      const chem = agent.carryingFood ? ctx.pheromones.home[index] : ctx.pheromones.food[index];
      if (chem > maxChemical) maxChemical = chem;
      weight += Math.pow(Math.max(0, chem), 1.35);
    }
    if (!agent.carryingFood && agent.recentlyVisited(index)) weight *= 0.22;
    if (memory) {
      const here = ctx.world.cellCenter(voxel.ix, voxel.iy, voxel.iz);
      const there = ctx.world.cellCenter(ix, iy, iz);
      const h = Math.hypot(here.x - memory.point.x, here.y - memory.point.y, here.z - memory.point.z);
      const t = Math.hypot(there.x - memory.point.x, there.y - memory.point.y, there.z - memory.point.z);
      if (t + 1e-4 < h) weight += 0.45 * memory.confidence;
    }
    const observations = agent.knowledge.obstacleObservations;
    for (let o = 0; o < observations.length; o++) {
      const obs = observations[o];
      if (obs.cell !== index) continue;
      const personal = obs.hops === 0;
      if (!personal && !options.useRelayedKnowledge) continue;
      weight *= 0.2;
      break;
    }
    weights[d] = weight;
  }
  return { weights, maxChemical };
}

function approachIfClear(agent: AntAgent, world: World3D, x: number, y: number, z: number): boolean {
  const dx = x - agent.position.x;
  const dy = y - agent.position.y;
  const dz = z - agent.position.z;
  const len = Math.hypot(dx, dy, dz);
  if (len > 0.2) {
    const step = Math.min(len, world.cellSize * 0.85);
    const px = agent.position.x + (dx / len) * step;
    const py = agent.position.y + (dy / len) * step;
    const pz = agent.position.z + (dz / len) * step;
    if (isPositionBlocked(world, px, py, pz, Math.min(0.3, world.cellSize * 0.25))) return false;
  }
  aim(agent, x, y, z);
  return true;
}

function aim(agent: AntAgent, x: number, y: number, z: number): void {
  const dx = x - agent.position.x;
  const dy = y - agent.position.y;
  const dz = z - agent.position.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return;
  agent.direction.x = dx / len;
  agent.direction.y = dy / len;
  agent.direction.z = dz / len;
}

function repel(agent: AntAgent, world: World3D): void {
  const voxel = world.voxelOf(agent.position.x, agent.position.y, agent.position.z);
  if (!voxel) return;
  let x = agent.direction.x;
  let y = agent.direction.y;
  let z = agent.direction.z;
  for (let d = 0; d < 6; d++) {
    const ix = voxel.ix + NEIGHBORS[d][0];
    const iy = voxel.iy + NEIGHBORS[d][1];
    const iz = voxel.iz + NEIGHBORS[d][2];
    if (!world.inBounds(ix, iy, iz) || world.isSolid(ix, iy, iz)) {
      x -= NEIGHBORS[d][0] * 0.85;
      y -= NEIGHBORS[d][1] * 0.85;
      z -= NEIGHBORS[d][2] * 0.85;
    }
  }
  const len = Math.hypot(x, y, z);
  if (len < 1e-6) return;
  agent.direction.x = x / len;
  agent.direction.y = y / len;
  agent.direction.z = z / len;
}

function localSharedSegment(agent: AntAgent, ctx: SteerContext, toward: Vector3D | null): RouteSegment | null {
  let best: RouteSegment | null = null;
  let bestScore = -1;
  const reach = ctx.sensingRadius;
  const list = agent.knowledge.routeSegments;
  for (let i = 0; i < list.length; i++) {
    const seg = list[i];
    if (seg.hops <= 0 || seg.confidence < 0.1) continue;
    const dx = agent.position.x - seg.from.x;
    const dy = agent.position.y - seg.from.y;
    const dz = agent.position.z - seg.from.z;
    if (dx * dx + dy * dy + dz * dz > reach * reach) continue;
    let score = seg.confidence;
    if (toward) {
      const d1 = Math.hypot(agent.position.x - toward.x, agent.position.y - toward.y, agent.position.z - toward.z);
      const d2 = Math.hypot(seg.to.x - toward.x, seg.to.y - toward.y, seg.to.z - toward.z);
      if (d2 >= d1) continue;
      score += d1 - d2;
    }
    if (score > bestScore) {
      bestScore = score;
      best = seg;
    }
  }
  return best;
}

function pickIndex(weights: number[], explore: boolean, rng: SeededRandom): number {
  let open = 0;
  for (let i = 0; i < weights.length; i++) if (weights[i] > 0) open++;
  if (open === 0) return -1;
  if (explore) {
    let choice = rng.nextInt(open);
    for (let i = 0; i < weights.length; i++) {
      if (weights[i] <= 0) continue;
      if (choice === 0) return i;
      choice--;
    }
  }
  let best = -1;
  let bestW = -1;
  const ties: number[] = [];
  for (let i = 0; i < weights.length; i++) {
    if (weights[i] > bestW) {
      bestW = weights[i];
      best = i;
      ties.length = 0;
      ties.push(i);
    } else if (weights[i] === bestW && weights[i] > 0) {
      ties.push(i);
    }
  }
  if (ties.length <= 1) return best;
  return ties[rng.nextInt(ties.length)];
}

/**
 * Writes agent.direction from local sensing, limited memory, and optional fields.
 * Reference paths are intentionally not readable here.
 */
export function steer(agent: AntAgent, ctx: SteerContext, options: SteerOptions): void {
  agent.followingPheromone = false;
  agent.usingSharedRoute = false;
  if (agent.recoverTimer > 0) {
    agent.direction.x = agent.recoverX;
    agent.direction.y = agent.recoverY;
    agent.direction.z = agent.recoverZ;
    return;
  }

  if (agent.carryingFood && agent.sensedNest) {
    if (approachIfClear(agent, ctx.world, agent.sensorNestX, agent.sensorNestY, agent.sensorNestZ)) return;
  }

  if (agent.carryingFood && agent.crumbCount > 0) {
    const i = agent.crumbCount - 1;
    aim(agent, agent.crumbX[i], agent.crumbY[i], agent.crumbZ[i]);
    repel(agent, ctx.world);
    return;
  }

  if (!agent.carryingFood && agent.sensedFood) {
    if (approachIfClear(agent, ctx.world, agent.sensorFoodX, agent.sensorFoodY, agent.sensorFoodZ)) return;
  }

  if (options.useSharedSegments) {
    const toward = agent.carryingFood
      ? rememberedPoint(agent, "home", options.useRelayedKnowledge)?.point ?? null
      : rememberedPoint(agent, "food", options.useRelayedKnowledge)?.point ?? null;
    const seg = localSharedSegment(agent, ctx, toward);
    if (seg) {
      aim(agent, seg.to.x, seg.to.y, seg.to.z);
      agent.usingSharedRoute = true;
      repel(agent, ctx.world);
      return;
    }
  }

  const view = computeNeighborWeights(agent, ctx, options);
  agent.followingPheromone = options.usePheromone && ctx.pheromoneEnabled && view.maxChemical > 0.08;
  const lostCarrier = agent.carryingFood && agent.crumbCount === 0 && !agent.sensedNest;
  const explore = (!agent.carryingFood || lostCarrier) && ctx.rng.chance(ctx.explorationProbability);
  const pick = pickIndex(view.weights, explore, ctx.rng);
  if (pick < 0) {
    const theta = ctx.rng.next() * Math.PI * 2;
    const u = ctx.rng.signed();
    const r = Math.sqrt(Math.max(0, 1 - u * u));
    agent.direction.x = Math.cos(theta) * r;
    agent.direction.y = u;
    agent.direction.z = Math.sin(theta) * r;
    return;
  }
  agent.direction.x = NEIGHBORS[pick][0];
  agent.direction.y = NEIGHBORS[pick][1];
  agent.direction.z = NEIGHBORS[pick][2];
  repel(agent, ctx.world);
}
