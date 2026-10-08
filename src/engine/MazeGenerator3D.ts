import type { MazeGenOptions } from "../types/simulation";
import type { SeededRandom } from "../utils/seededRandom";
import { isSingleOpenComponent, nearestOpenVoxel, shortestPath } from "./PathAnalysis";
import type { World3D } from "./World3D";

const D6: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

interface Layout {
  passage: number;
  wall: number;
  stride: number;
  roomsX: number;
  roomsY: number;
  roomsZ: number;
}

function layoutOf(world: World3D, passageWidth: number): Layout {
  const passage = Math.max(1, Math.min(3, Math.floor(passageWidth)));
  const wall = 1;
  const stride = passage + wall;
  return {
    passage,
    wall,
    stride,
    roomsX: Math.max(1, Math.floor((world.nx - wall) / stride)),
    roomsY: Math.max(1, Math.floor((world.ny - wall) / stride)),
    roomsZ: Math.max(1, Math.floor((world.nz - wall) / stride)),
  };
}

function carveBox(world: World3D, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
  const xa = Math.max(0, Math.min(x0, x1));
  const xb = Math.min(world.nx - 1, Math.max(x0, x1));
  const ya = Math.max(0, Math.min(y0, y1));
  const yb = Math.min(world.ny - 1, Math.max(y0, y1));
  const za = Math.max(0, Math.min(z0, z1));
  const zb = Math.min(world.nz - 1, Math.max(z0, z1));
  for (let z = za; z <= zb; z++) {
    for (let y = ya; y <= yb; y++) {
      for (let x = xa; x <= xb; x++) world.solids[world.index(x, y, z)] = 0;
    }
  }
}

function carveRoom(world: World3D, rx: number, ry: number, rz: number, layout: Layout): void {
  const x0 = layout.wall + rx * layout.stride;
  const y0 = layout.wall + ry * layout.stride;
  const z0 = layout.wall + rz * layout.stride;
  carveBox(world, x0, y0, z0, x0 + layout.passage - 1, y0 + layout.passage - 1, z0 + layout.passage - 1);
}

function carveLink(
  world: World3D,
  rx: number,
  ry: number,
  rz: number,
  dx: number,
  dy: number,
  dz: number,
  layout: Layout,
): void {
  const x0 = layout.wall + rx * layout.stride;
  const y0 = layout.wall + ry * layout.stride;
  const z0 = layout.wall + rz * layout.stride;
  if (dx === 1) {
    carveBox(world, x0 + layout.passage, y0, z0, x0 + layout.passage + layout.wall - 1, y0 + layout.passage - 1, z0 + layout.passage - 1);
  } else if (dx === -1) {
    carveBox(world, x0 - layout.wall, y0, z0, x0 - 1, y0 + layout.passage - 1, z0 + layout.passage - 1);
  } else if (dy === 1) {
    carveBox(world, x0, y0 + layout.passage, z0, x0 + layout.passage - 1, y0 + layout.passage + layout.wall - 1, z0 + layout.passage - 1);
  } else if (dy === -1) {
    carveBox(world, x0, y0 - layout.wall, z0, x0 + layout.passage - 1, y0 - 1, z0 + layout.passage - 1);
  } else if (dz === 1) {
    carveBox(world, x0, y0, z0 + layout.passage, x0 + layout.passage - 1, y0 + layout.passage - 1, z0 + layout.passage + layout.wall - 1);
  } else if (dz === -1) {
    carveBox(world, x0, y0, z0 - layout.wall, x0 + layout.passage - 1, y0 + layout.passage - 1, z0 - 1);
  }
}

function roomOpen(world: World3D, rx: number, ry: number, rz: number, layout: Layout): boolean {
  const x = layout.wall + rx * layout.stride;
  const y = layout.wall + ry * layout.stride;
  const z = layout.wall + rz * layout.stride;
  if (!world.inBounds(x, y, z)) return false;
  return !world.isSolid(x, y, z);
}

export function carveTunnel(
  world: World3D,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  radius: number,
): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), 1);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(x0 + (x1 - x0) * t);
    const y = Math.round(y0 + (y1 - y0) * t);
    const z = Math.round(z0 + (z1 - z0) * t);
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const ix = x + dx;
          const iy = y + dy;
          const iz = z + dz;
          if (!world.inBounds(ix, iy, iz)) continue;
          if (world.isShell(ix, iy, iz)) continue;
          world.solids[world.index(ix, iy, iz)] = 0;
        }
      }
    }
  }
  world.revision++;
  world.recomputeOpen();
}

/**
 * Place nest and food on open cells and guarantee a traversable connection.
 * The reference path produced afterwards is for measurement only.
 */
export function finalizeGoals(world: World3D, options: MazeGenOptions): void {
  let start = nearestOpenVoxel(world, 1, 1, 1);
  if (!start) {
    carveTunnel(world, 1, 1, 1, Math.max(1, world.nx - 2), 1, Math.max(1, world.nz - 2), 0);
    start = nearestOpenVoxel(world, 1, 1, 1);
  }
  if (!start) return;
  const targetY = options.preferVertical ? Math.max(1, world.ny - 2) : start.iy;
  const far = nearestOpenVoxel(world, Math.max(1, world.nx - 2), targetY, Math.max(1, world.nz - 2));
  if (!far || far.index === start.index) {
    carveTunnel(
      world,
      start.ix,
      start.iy,
      start.iz,
      Math.max(1, world.nx - 2),
      targetY,
      Math.max(1, world.nz - 2),
      Math.max(0, options.passageWidth - 1),
    );
  }
  start = nearestOpenVoxel(world, 1, 1, 1) ?? start;
  let best = selectFoodCell(world, start.index, options);
  if (best === start.index) {
    carveTunnel(world, start.ix, start.iy, start.iz, Math.max(1, world.nx - 2), targetY, Math.max(1, world.nz - 2), 0);
    start = nearestOpenVoxel(world, 1, 1, 1) ?? start;
    best = selectFoodCell(world, start.index, options);
  }
  const food = world.decode(best);
  const nestCenter = world.cellCenter(start.ix, start.iy, start.iz);
  const foodCenter = world.cellCenter(food.ix, food.iy, food.iz);
  world.nest = nestCenter;
  world.food = foodCenter;
  const path = shortestPath(world, world.nest, world.food);
  world.reachable = path !== null;
  if (!path) {
    carveTunnel(world, start.ix, start.iy, start.iz, food.ix, food.iy, food.iz, 0);
    world.nest = world.cellCenter(start.ix, start.iy, start.iz);
    world.food = world.cellCenter(food.ix, food.iy, food.iz);
    world.reachable = shortestPath(world, world.nest, world.food) !== null;
  }
  world.recomputeOpen();
}

/**
 * Pick an open cell near a medium BFS distance from the nest.
 * The old farthest-cell rule produced reference routes of a thousand units
 * on the default 60×30×60 maze, which a bounded breadcrumb memory cannot walk.
 * When vertical routes are requested, a cell on another floor inside the
 * distance band wins over a same-floor cell at the exact target.
 */
function selectFoodCell(world: World3D, startIndex: number, options: MazeGenOptions): number {
  const n = world.voxelCount;
  const dist = new Int32Array(n);
  dist.fill(-1);
  const queue = new Int32Array(n);
  let qh = 0;
  let qt = 0;
  queue[qt++] = startIndex;
  dist[startIndex] = 0;
  const start = world.decode(startIndex);
  let maxDist = 0;
  while (qh < qt) {
    const cur = queue[qh++];
    const c = world.decode(cur);
    for (let d = 0; d < 6; d++) {
      const ix = c.ix + D6[d][0];
      const iy = c.iy + D6[d][1];
      const iz = c.iz + D6[d][2];
      if (!world.inBounds(ix, iy, iz)) continue;
      const ni = world.index(ix, iy, iz);
      if (dist[ni] !== -1 || world.solids[ni] === 1) continue;
      dist[ni] = dist[cur] + 1;
      if (dist[ni] > maxDist) maxDist = dist[ni];
      queue[qt++] = ni;
    }
  }
  const requested = Math.round(16 + Math.max(0, options.complexity) * 1.5);
  const goal = Math.max(2, Math.min(requested, maxDist));
  const band = Math.max(5, Math.round(goal * 0.45));
  let bestAny = startIndex;
  let bestAnyErr = Number.POSITIVE_INFINITY;
  let bestVertical = -1;
  let bestVertErr = Number.POSITIVE_INFINITY;
  let bestVertDy = 0;
  const nx = world.nx;
  const ny = world.ny;
  for (let i = 0; i < n; i++) {
    if (dist[i] < 2) continue;
    const err = Math.abs(dist[i] - goal);
    if (err < bestAnyErr) {
      bestAnyErr = err;
      bestAny = i;
    }
    if (!options.preferVertical) continue;
    const iy = Math.floor(i / nx) % ny;
    const dy = Math.abs(iy - start.iy);
    if (dy === 0 || err > band) continue;
    if (err < bestVertErr || (err === bestVertErr && dy > bestVertDy)) {
      bestVertErr = err;
      bestVertDy = dy;
      bestVertical = i;
    }
  }
  if (options.preferVertical && bestVertical >= 0) return bestVertical;
  return bestAny;
}

function sprinklePillars(world: World3D, rng: SeededRandom, count: number): void {
  let placed = 0;
  let tries = 0;
  while (placed < count && tries < count * 30) {
    tries++;
    const x = 1 + rng.nextInt(Math.max(1, world.nx - 2));
    const y = 1 + rng.nextInt(Math.max(1, world.ny - 2));
    const z = 1 + rng.nextInt(Math.max(1, world.nz - 2));
    if (world.isSolid(x, y, z) || world.isShell(x, y, z)) continue;
    world.solids[world.index(x, y, z)] = 1;
    world.recomputeOpen();
    if (!isSingleOpenComponent(world)) {
      world.solids[world.index(x, y, z)] = 0;
      world.recomputeOpen();
      continue;
    }
    placed++;
  }
  world.revision++;
}

export function generateRecursiveBacktracking(world: World3D, rng: SeededRandom, options: MazeGenOptions): void {
  const layout = layoutOf(world, options.passageWidth);
  world.fill(true);
  const { roomsX, roomsY, roomsZ } = layout;
  const roomCount = roomsX * roomsY * roomsZ;
  const visited = new Uint8Array(roomCount);
  const rIndex = (x: number, y: number, z: number) => x + roomsX * (y + roomsY * z);
  const stack: number[] = [0, 0, 0];
  visited[0] = 1;
  carveRoom(world, 0, 0, 0, layout);
  const verticalP = Math.max(0, Math.min(1, options.verticalConnectivity));

  while (stack.length >= 3) {
    const cz = stack[stack.length - 1];
    const cy = stack[stack.length - 2];
    const cx = stack[stack.length - 3];
    const neighbors: number[] = [];
    for (let d = 0; d < 6; d++) {
      const dx = D6[d][0];
      const dy = D6[d][1];
      const dz = D6[d][2];
      if (dy !== 0 && verticalP < 1 && rng.next() > verticalP) continue;
      const nx = cx + dx;
      const ny = cy + dy;
      const nz = cz + dz;
      if (nx < 0 || ny < 0 || nz < 0 || nx >= roomsX || ny >= roomsY || nz >= roomsZ) continue;
      if (visited[rIndex(nx, ny, nz)]) continue;
      neighbors.push(dx, dy, dz);
    }
    if (neighbors.length === 0) {
      stack.length -= 3;
      continue;
    }
    const pick = rng.nextInt(neighbors.length / 3);
    const dx = neighbors[pick * 3];
    const dy = neighbors[pick * 3 + 1];
    const dz = neighbors[pick * 3 + 2];
    const nx = cx + dx;
    const ny = cy + dy;
    const nz = cz + dz;
    carveRoom(world, nx, ny, nz, layout);
    carveLink(world, cx, cy, cz, dx, dy, dz, layout);
    visited[rIndex(nx, ny, nz)] = 1;
    stack.push(nx, ny, nz);
  }

  const extras = Math.max(0, Math.floor(options.alternativeRoutes));
  let carved = 0;
  let guard = 0;
  while (carved < extras && guard < extras * 40) {
    guard++;
    const rx = rng.nextInt(roomsX);
    const ry = rng.nextInt(roomsY);
    const rz = rng.nextInt(roomsZ);
    if (!roomOpen(world, rx, ry, rz, layout)) continue;
    const dir = D6[rng.nextInt(6)];
    const nx = rx + dir[0];
    const ny = ry + dir[1];
    const nz = rz + dir[2];
    if (nx < 0 || ny < 0 || nz < 0 || nx >= roomsX || ny >= roomsY || nz >= roomsZ) continue;
    if (!roomOpen(world, nx, ny, nz, layout)) continue;
    if (dir[1] !== 0 && verticalP <= 0) continue;
    carveLink(world, rx, ry, rz, dir[0], dir[1], dir[2], layout);
    carved++;
  }

  sprinklePillars(world, rng, Math.max(0, Math.min(12, options.complexity)));
  world.recomputeOpen();
  finalizeGoals(world, options);
}

export function generateRecursiveDivision(world: World3D, rng: SeededRandom, options: MazeGenOptions): void {
  world.fill(false);
  world.fillShell();
  const pw = Math.max(1, Math.min(3, Math.floor(options.passageWidth)));
  const maxDepth = Math.max(1, Math.min(24, options.complexity + 2));
  const verticalP = Math.max(0, Math.min(1, options.verticalConnectivity));
  const extraHole = options.alternativeRoutes > 2;

  const split = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, depth: number) => {
    if (depth >= maxDepth) return;
    if (x1 < x0 || y1 < y0 || z1 < z0) return;
    const sx = x1 - x0 + 1;
    const sy = y1 - y0 + 1;
    const sz = z1 - z0 + 1;
    const minSide = Math.max(1, pw);
    const candidates: number[] = [];
    if (sx >= minSide * 2 + 1) candidates.push(0);
    if (sz >= minSide * 2 + 1) candidates.push(2);
    if (sy >= minSide * 2 + 1 && verticalP > 0) candidates.push(1);
    if (candidates.length === 0) return;
    let axis = candidates[rng.nextInt(candidates.length)];
    if (axis === 1 && rng.next() > verticalP) {
      const horiz = candidates.filter((a) => a !== 1);
      if (horiz.length === 0) return;
      axis = horiz[rng.nextInt(horiz.length)];
    }
    const span = axis === 0 ? sx : axis === 1 ? sy : sz;
    const origin = axis === 0 ? x0 : axis === 1 ? y0 : z0;
    const positions = span - minSide * 2;
    if (positions <= 0) return;
    const wall = origin + minSide + rng.nextInt(positions);
    if (axis === 0) {
      for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) world.solids[world.index(wall, y, z)] = 1;
      punchHole(world, rng, axis, wall, y0, y1, z0, z1, pw, extraHole);
      split(x0, y0, z0, wall - 1, y1, z1, depth + 1);
      split(wall + 1, y0, z0, x1, y1, z1, depth + 1);
    } else if (axis === 1) {
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) world.solids[world.index(x, wall, z)] = 1;
      punchHole(world, rng, axis, wall, x0, x1, z0, z1, pw, extraHole);
      split(x0, y0, z0, x1, wall - 1, z1, depth + 1);
      split(x0, wall + 1, z0, x1, y1, z1, depth + 1);
    } else {
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) world.solids[world.index(x, y, wall)] = 1;
      punchHole(world, rng, axis, wall, x0, x1, y0, y1, pw, extraHole);
      split(x0, y0, z0, x1, y1, wall - 1, depth + 1);
      split(x0, y0, wall + 1, x1, y1, z1, depth + 1);
    }
  };

  split(1, 1, 1, world.nx - 2, world.ny - 2, world.nz - 2, 0);
  world.revision++;
  world.recomputeOpen();
  finalizeGoals(world, options);
}

function punchHole(
  world: World3D,
  rng: SeededRandom,
  axis: number,
  wall: number,
  a0: number,
  a1: number,
  b0: number,
  b1: number,
  pw: number,
  extra: boolean,
): void {
  const holes = 1 + (extra && rng.chance(0.65) ? 1 : 0);
  const aSpan = a1 - a0 + 1;
  const bSpan = b1 - b0 + 1;
  for (let h = 0; h < holes; h++) {
    const aw = Math.min(pw, aSpan);
    const bw = Math.min(pw, bSpan);
    const a = a0 + rng.nextInt(Math.max(1, aSpan - aw + 1));
    const b = b0 + rng.nextInt(Math.max(1, bSpan - bw + 1));
    for (let da = 0; da < aw; da++) {
      for (let db = 0; db < bw; db++) {
        const u = a + da;
        const v = b + db;
        if (axis === 0) world.solids[world.index(wall, u, v)] = 0;
        else if (axis === 1) world.solids[world.index(u, wall, v)] = 0;
        else world.solids[world.index(u, v, wall)] = 0;
      }
    }
  }
}

export function generateRandomObstacles(world: World3D, rng: SeededRandom, options: MazeGenOptions): void {
  world.fill(false);
  world.fillShell();
  const density = Math.max(0, Math.min(0.75, options.obstacleDensity));
  const interior = Math.max(1, (world.nx - 2) * (world.ny - 2) * (world.nz - 2));
  const blobs = Math.max(1, Math.floor(density * interior / 10));
  const complexity = Math.max(1, options.complexity);
  const nestX = 1;
  const nestY = 1;
  const nestZ = 1;
  const foodX = world.nx - 2;
  const foodY = options.preferVertical ? world.ny - 2 : 1;
  const foodZ = world.nz - 2;
  const clear = 2;
  const protectedCell = (x: number, y: number, z: number) => {
    if (Math.abs(x - nestX) <= clear && Math.abs(y - nestY) <= clear && Math.abs(z - nestZ) <= clear) return true;
    if (Math.abs(x - foodX) <= clear && Math.abs(y - foodY) <= clear && Math.abs(z - foodZ) <= clear) return true;
    return false;
  };

  for (let i = 0; i < blobs; i++) {
    const kind = rng.nextInt(3);
    let w = 1;
    let h = 1;
    let d = 1;
    if (kind === 0) {
      w = 1 + rng.nextInt(Math.min(4, complexity));
      h = 1 + rng.nextInt(Math.min(Math.max(1, world.ny - 2), 1 + Math.floor(complexity / 2)));
      d = 1 + rng.nextInt(Math.min(4, complexity));
    } else if (kind === 1) {
      const axis = rng.nextInt(3);
      w = axis === 0 ? 1 : 2 + rng.nextInt(Math.max(1, Math.min(6, world.nx - 3)));
      h = axis === 1 ? 1 : 1 + rng.nextInt(Math.max(1, Math.min(4, world.ny - 2)));
      d = axis === 2 ? 1 : 2 + rng.nextInt(Math.max(1, Math.min(6, world.nz - 3)));
    } else {
      w = 1;
      d = 1;
      h = 2 + rng.nextInt(Math.max(1, world.ny - 3));
    }
    w = Math.max(1, Math.min(w, world.nx - 2));
    h = Math.max(1, Math.min(h, world.ny - 2));
    d = Math.max(1, Math.min(d, world.nz - 2));
    const xMax = Math.max(1, world.nx - 1 - w);
    const yMax = Math.max(1, world.ny - 1 - h);
    const zMax = Math.max(1, world.nz - 1 - d);
    const x = 1 + rng.nextInt(xMax);
    const y = options.verticalConnectivity < 0.05 ? 1 : 1 + rng.nextInt(yMax);
    const z = 1 + rng.nextInt(zMax);
    for (let dz = 0; dz < d; dz++) {
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          const ix = x + dx;
          const iy = y + dy;
          const iz = z + dz;
          if (!world.inBounds(ix, iy, iz) || world.isShell(ix, iy, iz)) continue;
          if (protectedCell(ix, iy, iz)) continue;
          world.solids[world.index(ix, iy, iz)] = 1;
        }
      }
    }
  }
  world.revision++;
  world.recomputeOpen();
  finalizeGoals(world, options);
}

export function generateEmptyChamber(world: World3D, options: MazeGenOptions): void {
  world.fill(false);
  world.fillShell();
  finalizeGoals(world, options);
}

export function generateMaze(world: World3D, kind: "backtracking" | "division" | "obstacles" | "empty", rng: SeededRandom, options: MazeGenOptions): void {
  if (kind === "backtracking") generateRecursiveBacktracking(world, rng, options);
  else if (kind === "division") generateRecursiveDivision(world, rng, options);
  else if (kind === "obstacles") generateRandomObstacles(world, rng, options);
  else generateEmptyChamber(world, options);
}
