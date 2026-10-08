import type { Vector3D } from "../types/simulation";
import type { World3D } from "./World3D";

export function bodyRadius(requested: number, cellSize: number): number {
  return Math.min(requested, Math.max(0.08, cellSize * 0.3));
}

export function isPositionBlocked(world: World3D, x: number, y: number, z: number, radius: number): boolean {
  if (x < radius || y < radius || z < radius) return true;
  if (x > world.width - radius || y > world.height - radius || z > world.depth - radius) return true;
  const cs = world.cellSize;
  const minX = Math.max(0, Math.floor((x - radius) / cs));
  const maxX = Math.min(world.nx - 1, Math.floor((x + radius - 1e-6) / cs));
  const minY = Math.max(0, Math.floor((y - radius) / cs));
  const maxY = Math.min(world.ny - 1, Math.floor((y + radius - 1e-6) / cs));
  const minZ = Math.max(0, Math.floor((z - radius) / cs));
  const maxZ = Math.min(world.nz - 1, Math.floor((z + radius - 1e-6) / cs));
  for (let iz = minZ; iz <= maxZ; iz++) {
    for (let iy = minY; iy <= maxY; iy++) {
      for (let ix = minX; ix <= maxX; ix++) {
        if (world.solids[world.index(ix, iy, iz)] === 1) return true;
      }
    }
  }
  return false;
}

/** Axis-separated slide. Long moves are sub-stepped so agents cannot tunnel through walls. */
export function moveWithCollision(
  world: World3D,
  pos: Vector3D,
  dx: number,
  dy: number,
  dz: number,
  radius: number,
): number {
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 1e-8) return 0;
  const maxStep = Math.max(0.05, Math.min(radius, world.cellSize * 0.45));
  const steps = Math.min(32, Math.max(1, Math.ceil(dist / maxStep)));
  const sx = dx / steps;
  const sy = dy / steps;
  const sz = dz / steps;
  let moved = 0;
  for (let i = 0; i < steps; i++) {
    const ox = pos.x;
    const oy = pos.y;
    const oz = pos.z;
    if (!isPositionBlocked(world, pos.x + sx, pos.y + sy, pos.z + sz, radius)) {
      pos.x += sx;
      pos.y += sy;
      pos.z += sz;
    } else {
      if (!isPositionBlocked(world, pos.x + sx, pos.y, pos.z, radius)) pos.x += sx;
      if (!isPositionBlocked(world, pos.x, pos.y + sy, pos.z, radius)) pos.y += sy;
      if (!isPositionBlocked(world, pos.x, pos.y, pos.z + sz, radius)) pos.z += sz;
    }
    const step = Math.hypot(pos.x - ox, pos.y - oy, pos.z - oz);
    moved += step;
    if (step < 1e-6) break;
  }
  return moved;
}

export function hasLineOfSight(
  world: World3D,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dz = z1 - z0;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 1e-6) return true;
  const step = Math.max(0.2, world.cellSize * 0.45);
  const steps = Math.max(1, Math.ceil(dist / step));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (world.isSolidAt(x0 + dx * t, y0 + dy * t, z0 + dz * t)) return false;
  }
  return true;
}
