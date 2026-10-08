import type { World3D } from "./World3D";

export interface VoxelCoord {
  ix: number;
  iy: number;
  iz: number;
}

export interface VoxelRayHit {
  hit: VoxelCoord | null;
  before: VoxelCoord | null;
}

/** Grid march used by the editor. Independent of Three.js. */
export function raycastVoxels(
  world: World3D,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number,
): VoxelRayHit {
  const len = Math.hypot(dx, dy, dz) || 1;
  const sx = dx / len;
  const sy = dy / len;
  const sz = dz / len;
  const step = Math.max(0.15, world.cellSize * 0.28);
  let before: VoxelCoord | null = null;
  for (let t = 0; t <= maxDist; t += step) {
    const x = ox + sx * t;
    const y = oy + sy * t;
    const z = oz + sz * t;
    if (!world.contains(x, y, z)) {
      if (before) break;
      continue;
    }
    const v = world.voxelOf(x, y, z);
    if (!v) continue;
    if (world.isSolid(v.ix, v.iy, v.iz)) return { hit: v, before };
    before = v;
  }
  return { hit: null, before };
}

export function rayPlaneY(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  y: number,
): { x: number; y: number; z: number } | null {
  if (Math.abs(dy) < 1e-8) return null;
  const t = (y - oy) / dy;
  if (t < 0) return null;
  return { x: ox + dx * t, y, z: oz + dz * t };
}
