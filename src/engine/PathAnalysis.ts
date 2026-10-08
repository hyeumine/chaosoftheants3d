import type { Vector3D } from "../types/simulation";
import { routeEfficiency } from "../utils/config";
import type { PheromoneField } from "./PheromoneField";
import type { World3D } from "./World3D";

const DIRS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

export interface GridPath {
  length: number;
  path: Vector3D[];
  cells: number[];
}

export function nearestOpenVoxel(
  world: World3D,
  ix: number,
  iy: number,
  iz: number,
  maxRadius?: number,
): { ix: number; iy: number; iz: number; index: number } | null {
  const limit = maxRadius ?? Math.max(world.nx, world.ny, world.nz);
  const sx = Math.max(0, Math.min(world.nx - 1, ix));
  const sy = Math.max(0, Math.min(world.ny - 1, iy));
  const sz = Math.max(0, Math.min(world.nz - 1, iz));
  if (!world.isSolid(sx, sy, sz)) {
    return { ix: sx, iy: sy, iz: sz, index: world.index(sx, sy, sz) };
  }
  for (let r = 1; r <= limit; r++) {
    for (let z = -r; z <= r; z++) {
      for (let y = -r; y <= r; y++) {
        for (let x = -r; x <= r; x++) {
          if (Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) !== r) continue;
          const cx = sx + x;
          const cy = sy + y;
          const cz = sz + z;
          if (!world.inBounds(cx, cy, cz)) continue;
          if (!world.isSolid(cx, cy, cz)) {
            return { ix: cx, iy: cy, iz: cz, index: world.index(cx, cy, cz) };
          }
        }
      }
    }
  }
  return null;
}

export function shortestPath(world: World3D, start: Vector3D, goal: Vector3D): GridPath | null {
  const sv = world.voxelOf(start.x, start.y, start.z);
  const gv = world.voxelOf(goal.x, goal.y, goal.z);
  if (!sv || !gv) return null;
  const startCell = nearestOpenVoxel(world, sv.ix, sv.iy, sv.iz, 6);
  const goalCell = nearestOpenVoxel(world, gv.ix, gv.iy, gv.iz, 6);
  if (!startCell || !goalCell) return null;
  const n = world.voxelCount;
  const parent = new Int32Array(n);
  parent.fill(-2);
  const dist = new Int32Array(n);
  dist.fill(-1);
  const queue = new Int32Array(n);
  let qh = 0;
  let qt = 0;
  queue[qt++] = startCell.index;
  dist[startCell.index] = 0;
  parent[startCell.index] = -1;
  let found = false;
  while (qh < qt) {
    const cur = queue[qh++];
    if (cur === goalCell.index) {
      found = true;
      break;
    }
    const c = world.decode(cur);
    for (let d = 0; d < 6; d++) {
      const ix = c.ix + DIRS[d][0];
      const iy = c.iy + DIRS[d][1];
      const iz = c.iz + DIRS[d][2];
      if (!world.inBounds(ix, iy, iz)) continue;
      const ni = world.index(ix, iy, iz);
      if (dist[ni] !== -1) continue;
      if (world.solids[ni] === 1) continue;
      dist[ni] = dist[cur] + 1;
      parent[ni] = cur;
      queue[qt++] = ni;
    }
  }
  if (!found && startCell.index !== goalCell.index) return null;
  const cells: number[] = [];
  let cursor = goalCell.index;
  let guard = 0;
  while (cursor !== -1 && guard++ < n) {
    cells.push(cursor);
    if (cursor === startCell.index) break;
    cursor = parent[cursor];
    if (cursor === -2) return null;
  }
  cells.reverse();
  const path: Vector3D[] = new Array(cells.length);
  for (let i = 0; i < cells.length; i++) {
    const c = world.decode(cells[i]);
    path[i] = world.cellCenter(c.ix, c.iy, c.iz);
  }
  let length = 0;
  for (let i = 1; i < path.length; i++) {
    length += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y, path[i].z - path[i - 1].z);
  }
  return { length, path, cells };
}

export function countReachable(world: World3D, startIndex: number): number {
  const n = world.voxelCount;
  const seen = new Uint8Array(n);
  const queue = new Int32Array(n);
  let qh = 0;
  let qt = 0;
  if (world.solids[startIndex] === 1) return 0;
  queue[qt++] = startIndex;
  seen[startIndex] = 1;
  let count = 0;
  while (qh < qt) {
    const cur = queue[qh++];
    count++;
    const c = world.decode(cur);
    for (let d = 0; d < 6; d++) {
      const ix = c.ix + DIRS[d][0];
      const iy = c.iy + DIRS[d][1];
      const iz = c.iz + DIRS[d][2];
      if (!world.inBounds(ix, iy, iz)) continue;
      const ni = world.index(ix, iy, iz);
      if (seen[ni] || world.solids[ni] === 1) continue;
      seen[ni] = 1;
      queue[qt++] = ni;
    }
  }
  return count;
}

export function isSingleOpenComponent(world: World3D): boolean {
  let start = -1;
  let open = 0;
  for (let i = 0; i < world.solids.length; i++) {
    if (world.solids[i] === 0) {
      open++;
      if (start < 0) start = i;
    }
  }
  if (open === 0) return false;
  return countReachable(world, start) === open;
}

export function verticalOpenLinks(world: World3D): number {
  let links = 0;
  for (let iz = 0; iz < world.nz; iz++) {
    for (let iy = 0; iy < world.ny - 1; iy++) {
      for (let ix = 0; ix < world.nx; ix++) {
        if (!world.isSolid(ix, iy, iz) && !world.isSolid(ix, iy + 1, iz)) links++;
      }
    }
  }
  return links;
}

export interface TrailHit {
  cells: number[];
  middle: number;
}

/** Greedy walk on combined pheromone. Benchmark code may call this; agents do not. */
export function dominantPheromoneTrail(world: World3D, field: PheromoneField, nest: Vector3D, food: Vector3D): number[] {
  const startV = world.voxelOf(nest.x, nest.y, nest.z);
  const goalV = world.voxelOf(food.x, food.y, food.z);
  if (!startV) return [];
  const seen = new Uint8Array(world.voxelCount);
  const trail: number[] = [];
  let cx = startV.ix;
  let cy = startV.iy;
  let cz = startV.iz;
  const limit = Math.min(world.voxelCount, 4000);
  for (let step = 0; step < limit; step++) {
    if (!world.inBounds(cx, cy, cz) || world.isSolid(cx, cy, cz)) break;
    const id = world.index(cx, cy, cz);
    if (seen[id]) break;
    seen[id] = 1;
    const strength = field.food[id] + field.home[id];
    if (step > 0 && strength <= 0.02) break;
    trail.push(id);
    if (goalV && cx === goalV.ix && cy === goalV.iy && cz === goalV.iz) break;
    let best = 0.02;
    let nx = cx;
    let ny = cy;
    let nz = cz;
    let found = false;
    for (let d = 0; d < 6; d++) {
      const ix = cx + DIRS[d][0];
      const iy = cy + DIRS[d][1];
      const iz = cz + DIRS[d][2];
      if (!world.inBounds(ix, iy, iz) || world.isSolid(ix, iy, iz)) continue;
      const ni = world.index(ix, iy, iz);
      if (seen[ni]) continue;
      const s = field.food[ni] + field.home[ni];
      if (s > best) {
        best = s;
        nx = ix;
        ny = iy;
        nz = iz;
        found = true;
      }
    }
    if (!found) break;
    cx = nx;
    cy = ny;
    cz = nz;
  }
  return trail;
}

export { routeEfficiency };
