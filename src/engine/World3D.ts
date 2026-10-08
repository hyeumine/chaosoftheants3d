import type { Vector3D } from "../types/simulation";
import { resolveWorldSize, type ResolvedWorld } from "../utils/config";

export class World3D {
  width: number;
  height: number;
  depth: number;
  cellSize: number;
  nx: number;
  ny: number;
  nz: number;
  solids: Uint8Array;
  visits: Uint16Array;
  nest: Vector3D;
  food: Vector3D;
  revision = 0;
  openCount = 0;
  exploredCount = 0;
  reachable = false;
  reducedResolution = false;

  constructor(size: ResolvedWorld) {
    this.cellSize = size.cellSize;
    this.nx = size.nx;
    this.ny = size.ny;
    this.nz = size.nz;
    this.width = size.width;
    this.height = size.height;
    this.depth = size.depth;
    this.reducedResolution = size.reduced;
    const n = this.nx * this.ny * this.nz;
    this.solids = new Uint8Array(n);
    this.visits = new Uint16Array(n);
    this.nest = { x: this.cellSize * 1.5, y: this.cellSize * 1.5, z: this.cellSize * 1.5 };
    this.food = {
      x: this.width - this.cellSize * 1.5,
      y: this.height - this.cellSize * 1.5,
      z: this.depth - this.cellSize * 1.5,
    };
    this.recomputeOpen();
  }

  get voxelCount(): number {
    return this.nx * this.ny * this.nz;
  }

  index(ix: number, iy: number, iz: number): number {
    return ix + this.nx * (iy + this.ny * iz);
  }

  inBounds(ix: number, iy: number, iz: number): boolean {
    return ix >= 0 && iy >= 0 && iz >= 0 && ix < this.nx && iy < this.ny && iz < this.nz;
  }

  isShell(ix: number, iy: number, iz: number): boolean {
    return ix === 0 || iy === 0 || iz === 0 || ix === this.nx - 1 || iy === this.ny - 1 || iz === this.nz - 1;
  }

  decode(index: number): { ix: number; iy: number; iz: number } {
    const ix = index % this.nx;
    const iy = Math.floor(index / this.nx) % this.ny;
    const iz = Math.floor(index / (this.nx * this.ny));
    return { ix, iy, iz };
  }

  isSolid(ix: number, iy: number, iz: number): boolean {
    if (!this.inBounds(ix, iy, iz)) return true;
    return this.solids[this.index(ix, iy, iz)] === 1;
  }

  contains(x: number, y: number, z: number): boolean {
    return x >= 0 && y >= 0 && z >= 0 && x < this.width && y < this.height && z < this.depth;
  }

  voxelOf(x: number, y: number, z: number): { ix: number; iy: number; iz: number } | null {
    if (!this.contains(x, y, z)) return null;
    const ix = Math.min(this.nx - 1, Math.floor(x / this.cellSize));
    const iy = Math.min(this.ny - 1, Math.floor(y / this.cellSize));
    const iz = Math.min(this.nz - 1, Math.floor(z / this.cellSize));
    return { ix, iy, iz };
  }

  isSolidAt(x: number, y: number, z: number): boolean {
    if (!this.contains(x, y, z)) return true;
    const ix = Math.min(this.nx - 1, Math.floor(x / this.cellSize));
    const iy = Math.min(this.ny - 1, Math.floor(y / this.cellSize));
    const iz = Math.min(this.nz - 1, Math.floor(z / this.cellSize));
    return this.solids[this.index(ix, iy, iz)] === 1;
  }

  cellCenter(ix: number, iy: number, iz: number): Vector3D {
    const c = this.cellSize;
    return { x: (ix + 0.5) * c, y: (iy + 0.5) * c, z: (iz + 0.5) * c };
  }

  setSolid(ix: number, iy: number, iz: number, solid: boolean): void {
    if (!this.inBounds(ix, iy, iz)) return;
    const i = this.index(ix, iy, iz);
    const was = this.solids[i] === 1;
    const next = solid ? 1 : 0;
    if (was === solid) return;
    this.solids[i] = next;
    if (solid) {
      this.openCount = Math.max(0, this.openCount - 1);
      if (this.visits[i] > 0) this.exploredCount = Math.max(0, this.exploredCount - 1);
    } else {
      this.openCount++;
      if (this.visits[i] > 0) this.exploredCount++;
    }
    this.revision++;
  }

  fill(solid: boolean): void {
    this.solids.fill(solid ? 1 : 0);
    this.revision++;
    this.recomputeOpen();
  }

  fillShell(): void {
    const { nx, ny, nz } = this;
    for (let iz = 0; iz < nz; iz++) {
      for (let iy = 0; iy < ny; iy++) {
        for (let ix = 0; ix < nx; ix++) {
          if (this.isShell(ix, iy, iz)) this.solids[this.index(ix, iy, iz)] = 1;
        }
      }
    }
    this.revision++;
    this.recomputeOpen();
  }

  clearVisits(): void {
    this.visits.fill(0);
    this.exploredCount = 0;
  }

  markVisit(index: number): void {
    if (index < 0 || index >= this.visits.length) return;
    if (this.solids[index] === 1) return;
    if (this.visits[index] === 0) this.exploredCount++;
    if (this.visits[index] < 65535) this.visits[index]++;
  }

  recomputeOpen(): void {
    let open = 0;
    let explored = 0;
    for (let i = 0; i < this.solids.length; i++) {
      if (this.solids[i] === 0) {
        open++;
        if (this.visits[i] > 0) explored++;
      }
    }
    this.openCount = open;
    this.exploredCount = explored;
  }

  exploredFraction(): number {
    if (this.openCount <= 0) return 0;
    return this.exploredCount / this.openCount;
  }

  /** Percentage of traversable voxels entered by at least one agent. */
  exploredPercent(): number {
    return this.exploredFraction() * 100;
  }
}

export function createWorld(config: { worldWidth: number; worldHeight: number; worldDepth: number; cellSize: number }): World3D {
  return new World3D(resolveWorldSize(config));
}
