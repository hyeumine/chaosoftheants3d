import type { AgentKnowledge, AgentState, AntAgentData, ObstacleObservation, RouteSegment, Vector3D } from "../types/simulation";

const VISIT_MEMORY = 48;

export function createKnowledge(): AgentKnowledge {
  return {
    foodKnown: false,
    foodConfidence: 0,
    foodHops: 0,
    foodVersion: 0,
    foodSourceId: -1,
    homeKnown: false,
    homeConfidence: 0,
    homeHops: 0,
    homeVersion: 0,
    homeSourceId: -1,
    routeSegments: [],
    obstacleObservations: [],
    lastUpdated: 0,
  };
}

/**
 * Autonomous ant. Decision code may read this object's memory and sensors.
 * It never receives a live pointer to the hidden reference path.
 */
export class AntAgent implements AntAgentData {
  id: number;
  position: Vector3D;
  velocity: Vector3D;
  direction: Vector3D;
  state: AgentState;
  carryingFood: boolean;
  energy: number;
  knowledge: AgentKnowledge;
  visitedCells: number[];
  distanceTraveled: number;
  successfulTrips: number;

  sensedFood = false;
  sensorFoodX = 0;
  sensorFoodY = 0;
  sensorFoodZ = 0;
  sensedNest = false;
  sensorNestX = 0;
  sensorNestY = 0;
  sensorNestZ = 0;

  crumbX: Float32Array;
  crumbY: Float32Array;
  crumbZ: Float32Array;
  crumbCell: Int32Array;
  crumbCount = 0;

  outboundX: Float32Array;
  outboundY: Float32Array;
  outboundZ: Float32Array;
  outboundCount = 0;
  pendingOutbound = 0;
  outboundOrigin = 0;

  lastCell = -1;
  decisionCooldown = 0;
  recoverTimer = 0;
  recoverX = 0;
  recoverY = 0;
  recoverZ = 1;
  stuckTimer = 0;
  deliverTimer = 0;
  visitCount = 0;
  followingPheromone = false;
  usingSharedRoute = false;

  constructor(id: number, maxCrumbs: number) {
    this.id = id;
    this.position = { x: 0, y: 0, z: 0 };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.direction = { x: 1, y: 0, z: 0 };
    this.state = "EXPLORING";
    this.carryingFood = false;
    this.energy = 100;
    this.knowledge = createKnowledge();
    this.visitedCells = new Array(VISIT_MEMORY).fill(-1);
    this.distanceTraveled = 0;
    this.successfulTrips = 0;
    const crumbs = Math.max(8, maxCrumbs);
    this.crumbX = new Float32Array(crumbs);
    this.crumbY = new Float32Array(crumbs);
    this.crumbZ = new Float32Array(crumbs);
    this.crumbCell = new Int32Array(crumbs);
    this.outboundX = new Float32Array(300);
    this.outboundY = new Float32Array(300);
    this.outboundZ = new Float32Array(300);
  }

  reset(id: number, x: number, y: number, z: number, energy: number, dx: number, dy: number, dz: number): void {
    this.id = id;
    this.position.x = x;
    this.position.y = y;
    this.position.z = z;
    this.velocity.x = 0;
    this.velocity.y = 0;
    this.velocity.z = 0;
    this.direction.x = dx;
    this.direction.y = dy;
    this.direction.z = dz;
    this.state = "EXPLORING";
    this.carryingFood = false;
    this.energy = energy;
    this.knowledge = createKnowledge();
    this.visitedCells.fill(-1);
    this.visitCount = 0;
    this.distanceTraveled = 0;
    this.successfulTrips = 0;
    this.sensedFood = false;
    this.sensedNest = false;
    this.crumbCount = 0;
    this.outboundCount = 0;
    this.pendingOutbound = 0;
    this.outboundOrigin = 0;
    this.lastCell = -1;
    this.decisionCooldown = 0;
    this.recoverTimer = 0;
    this.stuckTimer = 0;
    this.deliverTimer = 0;
    this.followingPheromone = false;
    this.usingSharedRoute = false;
  }

  rememberHome(x: number, y: number, z: number, time: number): void {
    const k = this.knowledge;
    if (!k.homePosition) k.homePosition = { x, y, z };
    else {
      k.homePosition.x = x;
      k.homePosition.y = y;
      k.homePosition.z = z;
    }
    if (!k.homeKnown) k.homeVersion += 1;
    k.homeKnown = true;
    k.homeConfidence = 1;
    k.homeHops = 0;
    k.homeSourceId = this.id;
    k.lastUpdated = time;
  }

  rememberFood(x: number, y: number, z: number, time: number): void {
    const k = this.knowledge;
    const moved =
      !k.foodPosition ||
      Math.hypot(k.foodPosition.x - x, k.foodPosition.y - y, k.foodPosition.z - z) > 0.5;
    if (!k.foodPosition) k.foodPosition = { x, y, z };
    else {
      k.foodPosition.x = x;
      k.foodPosition.y = y;
      k.foodPosition.z = z;
    }
    if (!k.foodKnown || moved) k.foodVersion += 1;
    k.foodKnown = true;
    k.foodConfidence = 1;
    k.foodHops = 0;
    k.foodSourceId = this.id;
    k.lastUpdated = time;
  }

  rememberVisit(cell: number): void {
    this.visitedCells[this.visitCount % this.visitedCells.length] = cell;
    this.visitCount++;
  }

  recentlyVisited(cell: number): boolean {
    const n = Math.min(this.visitCount, this.visitedCells.length);
    for (let i = 0; i < n; i++) if (this.visitedCells[i] === cell) return true;
    return false;
  }

  pushCrumb(x: number, y: number, z: number, cell: number, spacing: number, force = false): void {
    if (this.crumbCount > 0 && !force) {
      const i = this.crumbCount - 1;
      const dx = x - this.crumbX[i];
      const dy = y - this.crumbY[i];
      const dz = z - this.crumbZ[i];
      if (dx * dx + dy * dy + dz * dz < spacing * spacing) return;
      for (let j = this.crumbCount - 1; j >= 0; j--) {
        if (this.crumbCell[j] === cell) {
          this.crumbCount = j + 1;
          this.crumbX[j] = x;
          this.crumbY[j] = y;
          this.crumbZ[j] = z;
          return;
        }
      }
    }
    if (this.crumbCount >= this.crumbX.length) return;
    const i = this.crumbCount++;
    this.crumbX[i] = x;
    this.crumbY[i] = y;
    this.crumbZ[i] = z;
    this.crumbCell[i] = cell;
  }

  popCloseCrumbs(x: number, y: number, z: number, radius: number): void {
    const r2 = radius * radius;
    while (this.crumbCount > 0) {
      const i = this.crumbCount - 1;
      const dx = x - this.crumbX[i];
      const dy = y - this.crumbY[i];
      const dz = z - this.crumbZ[i];
      if (dx * dx + dy * dy + dz * dz <= r2) this.crumbCount--;
      else break;
    }
  }

  dropBlockedCrumbs(isBlocked: (x: number, y: number, z: number) => boolean): void {
    for (let i = 0; i < this.crumbCount; i++) {
      if (isBlocked(this.crumbX[i], this.crumbY[i], this.crumbZ[i])) {
        this.crumbCount = 0;
        return;
      }
    }
  }

  sampleOutbound(x: number, y: number, z: number, spacing: number): void {
    if (this.outboundCount > 0) {
      const i = this.outboundCount - 1;
      const dx = x - this.outboundX[i];
      const dy = y - this.outboundY[i];
      const dz = z - this.outboundZ[i];
      if (dx * dx + dy * dy + dz * dz < spacing * spacing) return;
    }
    if (this.outboundCount >= this.outboundX.length) return;
    const i = this.outboundCount++;
    this.outboundX[i] = x;
    this.outboundY[i] = y;
    this.outboundZ[i] = z;
  }

  copyOutbound(): Vector3D[] {
    const pts: Vector3D[] = new Array(this.outboundCount);
    for (let i = 0; i < this.outboundCount; i++) {
      pts[i] = { x: this.outboundX[i], y: this.outboundY[i], z: this.outboundZ[i] };
    }
    return pts;
  }

  addSegment(segment: RouteSegment, cap: number): boolean {
    const list = this.knowledge.routeSegments;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (s.cellFrom === segment.cellFrom && s.cellTo === segment.cellTo) {
        if (segment.confidence > s.confidence + 1e-6) list[i] = segment;
        return false;
      }
    }
    if (list.length < cap) {
      list.push(segment);
      return true;
    }
    let worst = 0;
    for (let i = 1; i < list.length; i++) {
      if (list[i].confidence < list[worst].confidence) worst = i;
    }
    if (segment.confidence > list[worst].confidence + 1e-6) {
      list[worst] = segment;
      return true;
    }
    return false;
  }

  addObstacle(obs: ObstacleObservation, cap: number): boolean {
    const list = this.knowledge.obstacleObservations;
    for (let i = 0; i < list.length; i++) {
      if (list[i].cell === obs.cell) {
        if (obs.confidence > list[i].confidence + 1e-6) list[i] = obs;
        return false;
      }
    }
    if (list.length < cap) {
      list.push(obs);
      return true;
    }
    if (obs.confidence > list[list.length - 1].confidence) {
      list[list.length - 1] = obs;
      return true;
    }
    return false;
  }
}
