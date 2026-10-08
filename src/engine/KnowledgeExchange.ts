import type { AntAgent } from "./AntAgent";
import type { SpatialHash } from "./SpatialHash";

export interface ExchangeParams {
  radius: number;
  retention: number;
  cooldown: number;
  time: number;
  maxSegments: number;
  conflictDistance: number;
}

export interface EncounterVisual {
  x1: number;
  y1: number;
  z1: number;
  x2: number;
  y2: number;
  z2: number;
  born: number;
}

/**
 * Encounter rule: agents exchange only inside the communication radius.
 * transferredConfidence = sourceConfidence * relayRetention * hopReliability * distanceFactor.
 * Pair cooldowns and version ids suppress repeated copies of the same fact.
 */
export class KnowledgeExchange {
  private lastPair = new Map<number, number>();
  visuals: EncounterVisual[] = [];

  reset(): void {
    this.lastPair.clear();
    this.visuals.length = 0;
  }

  pruneVisuals(time: number, life = 0.45): void {
    if (this.visuals.length === 0) return;
    let w = 0;
    for (let i = 0; i < this.visuals.length; i++) {
      if (time - this.visuals[i].born <= life) this.visuals[w++] = this.visuals[i];
    }
    this.visuals.length = w;
  }

  exchange(agents: AntAgent[], spatial: SpatialHash, params: ExchangeParams, enabled: boolean): number {
    if (!enabled) return 0;
    let events = 0;
    const { radius, time, cooldown } = params;
    for (let i = 0; i < agents.length; i++) {
      const count = spatial.query(agents[i].position.x, agents[i].position.y, agents[i].position.z, radius, i);
      for (let q = 0; q < count; q++) {
        const j = spatial.queryIds[q];
        if (j <= i) continue;
        const a = agents[i];
        const b = agents[j];
        const dx = a.position.x - b.position.x;
        const dy = a.position.y - b.position.y;
        const dz = a.position.z - b.position.z;
        const dist = Math.hypot(dx, dy, dz);
        if (dist > radius) continue;
        const key = i * 131072 + j;
        const previous = this.lastPair.get(key) ?? -1e9;
        if (time - previous < cooldown) continue;
        this.lastPair.set(key, time);
        const distanceFactor = 1 - 0.25 * (radius <= 0 ? 0 : dist / radius);
        const changed =
          transferFood(a, b, params, distanceFactor) ||
          transferFood(b, a, params, distanceFactor) ||
          transferHome(a, b, params, distanceFactor) ||
          transferHome(b, a, params, distanceFactor) ||
          transferSegments(a, b, params, distanceFactor) ||
          transferSegments(b, a, params, distanceFactor) ||
          transferObstacles(a, b, params, distanceFactor) ||
          transferObstacles(b, a, params, distanceFactor);
        if (changed) {
          events++;
          if (this.visuals.length < 240) {
            this.visuals.push({
              x1: a.position.x,
              y1: a.position.y,
              z1: a.position.z,
              x2: b.position.x,
              y2: b.position.y,
              z2: b.position.z,
              born: time,
            });
          }
        }
      }
    }
    return events;
  }
}

function hopReliability(hops: number): number {
  return 1 / (1 + hops * 0.25);
}

function transferFood(src: AntAgent, dst: AntAgent, params: ExchangeParams, distanceFactor: number): boolean {
  const sk = src.knowledge;
  const dk = dst.knowledge;
  if (!sk.foodKnown || !sk.foodPosition || sk.foodConfidence <= 0.02) return false;
  const transferred = sk.foodConfidence * params.retention * hopReliability(sk.foodHops) * distanceFactor;
  if (transferred <= 0.02) return false;
  const sameFact =
    dk.foodKnown && dk.foodVersion === sk.foodVersion && dk.foodSourceId === sk.foodSourceId;
  if (sameFact && dk.foodConfidence >= transferred - 1e-6) return false;
  if (dk.foodKnown && dk.foodPosition && sk.foodPosition) {
    const conflict = Math.hypot(
      dk.foodPosition.x - sk.foodPosition.x,
      dk.foodPosition.y - sk.foodPosition.y,
      dk.foodPosition.z - sk.foodPosition.z,
    );
    if (conflict > params.conflictDistance && dk.foodConfidence >= transferred) return false;
  }
  if (dk.foodKnown && dk.foodConfidence > transferred) return false;
  if (!dk.foodPosition) dk.foodPosition = { x: 0, y: 0, z: 0 };
  dk.foodPosition.x = sk.foodPosition.x;
  dk.foodPosition.y = sk.foodPosition.y;
  dk.foodPosition.z = sk.foodPosition.z;
  dk.foodKnown = true;
  dk.foodConfidence = transferred;
  dk.foodHops = sk.foodHops + 1;
  dk.foodVersion = sk.foodVersion;
  dk.foodSourceId = sk.foodSourceId;
  dk.lastUpdated = params.time;
  return !sameFact;
}

function transferHome(src: AntAgent, dst: AntAgent, params: ExchangeParams, distanceFactor: number): boolean {
  const sk = src.knowledge;
  const dk = dst.knowledge;
  if (!sk.homeKnown || !sk.homePosition || sk.homeConfidence <= 0.02) return false;
  const transferred = sk.homeConfidence * params.retention * hopReliability(sk.homeHops) * distanceFactor;
  if (transferred <= 0.02) return false;
  const sameFact =
    dk.homeKnown && dk.homeVersion === sk.homeVersion && dk.homeSourceId === sk.homeSourceId;
  if (sameFact && dk.homeConfidence >= transferred - 1e-6) return false;
  if (dk.homeKnown && dk.homeConfidence > transferred) return false;
  if (!dk.homePosition) dk.homePosition = { x: 0, y: 0, z: 0 };
  dk.homePosition.x = sk.homePosition.x;
  dk.homePosition.y = sk.homePosition.y;
  dk.homePosition.z = sk.homePosition.z;
  dk.homeKnown = true;
  dk.homeConfidence = transferred;
  dk.homeHops = sk.homeHops + 1;
  dk.homeVersion = sk.homeVersion;
  dk.homeSourceId = sk.homeSourceId;
  dk.lastUpdated = params.time;
  return !sameFact;
}

function transferSegments(src: AntAgent, dst: AntAgent, params: ExchangeParams, distanceFactor: number): boolean {
  let changed = false;
  const list = src.knowledge.routeSegments;
  for (let i = 0; i < list.length; i++) {
    const seg = list[i];
    const confidence = seg.confidence * params.retention * hopReliability(seg.hops) * distanceFactor;
    if (confidence <= 0.05) continue;
    const wrote = dst.addSegment(
      {
        from: { x: seg.from.x, y: seg.from.y, z: seg.from.z },
        to: { x: seg.to.x, y: seg.to.y, z: seg.to.z },
        cost: seg.cost,
        confidence,
        version: seg.version,
        hops: seg.hops + 1,
        cellFrom: seg.cellFrom,
        cellTo: seg.cellTo,
      },
      params.maxSegments,
    );
    if (wrote) changed = true;
  }
  return changed;
}

function transferObstacles(src: AntAgent, dst: AntAgent, params: ExchangeParams, distanceFactor: number): boolean {
  let changed = false;
  const list = src.knowledge.obstacleObservations;
  for (let i = 0; i < list.length; i++) {
    const obs = list[i];
    const confidence = obs.confidence * params.retention * hopReliability(obs.hops) * distanceFactor;
    if (confidence <= 0.05) continue;
    const wrote = dst.addObstacle(
      {
        x: obs.x,
        y: obs.y,
        z: obs.z,
        cell: obs.cell,
        confidence,
        time: params.time,
        hops: obs.hops + 1,
      },
      16,
    );
    if (wrote) changed = true;
  }
  return changed;
}

export function decayKnowledge(agent: AntAgent, dt: number, rate: number): void {
  if (!(rate > 0) || !(dt > 0)) return;
  const factor = Math.exp(-rate * dt);
  const k = agent.knowledge;
  if (k.foodKnown) {
    k.foodConfidence *= factor;
    if (k.foodConfidence < 0.05) {
      k.foodKnown = false;
      k.foodConfidence = 0;
    }
  }
  if (k.homeKnown) {
    k.homeConfidence *= factor;
    if (k.homeConfidence < 0.05) {
      k.homeKnown = false;
      k.homeConfidence = 0;
    }
  }
  let w = 0;
  for (let i = 0; i < k.routeSegments.length; i++) {
    k.routeSegments[i].confidence *= factor;
    if (k.routeSegments[i].confidence >= 0.05) k.routeSegments[w++] = k.routeSegments[i];
  }
  k.routeSegments.length = w;
  w = 0;
  for (let i = 0; i < k.obstacleObservations.length; i++) {
    k.obstacleObservations[i].confidence *= factor;
    if (k.obstacleObservations[i].confidence >= 0.05) k.obstacleObservations[w++] = k.obstacleObservations[i];
  }
  k.obstacleObservations.length = w;
}
