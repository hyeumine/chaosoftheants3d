import type { PheromoneVoxel } from "../types/simulation";

const DIRS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/**
 * Dual volumetric pheromone field on the world voxel grid.
 * Discrete update, scaled to elapsed simulation time:
 *   tau(t + dt) = (1 - rho) ^ dt * tau(t) + deposit
 * which is the time-consistent form of tau(t+1) = (1-rho)*tau(t) + deposit.
 */
export class PheromoneField {
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  food: Float32Array;
  home: Float32Array;
  private foodBuf: Float32Array;
  private homeBuf: Float32Array;
  totalConcentration = 0;
  activeCount = 0;
  lastUpdated = 0;

  constructor(nx: number, ny: number, nz: number) {
    this.nx = nx;
    this.ny = ny;
    this.nz = nz;
    const n = nx * ny * nz;
    this.food = new Float32Array(n);
    this.home = new Float32Array(n);
    this.foodBuf = new Float32Array(n);
    this.homeBuf = new Float32Array(n);
  }

  get length(): number {
    return this.food.length;
  }

  index(ix: number, iy: number, iz: number): number {
    return ix + this.nx * (iy + this.ny * iz);
  }

  inBounds(ix: number, iy: number, iz: number): boolean {
    return ix >= 0 && iy >= 0 && iz >= 0 && ix < this.nx && iy < this.ny && iz < this.nz;
  }

  clear(): void {
    this.food.fill(0);
    this.home.fill(0);
    this.totalConcentration = 0;
    this.activeCount = 0;
    this.lastUpdated = 0;
  }

  clearFood(): void {
    this.food.fill(0);
    this.recomputeTotals();
  }

  clearHome(): void {
    this.home.fill(0);
    this.recomputeTotals();
  }

  clearIndex(index: number): void {
    if (index < 0 || index >= this.food.length) return;
    this.food[index] = 0;
    this.home[index] = 0;
  }

  voxelAt(index: number): PheromoneVoxel {
    return {
      foodStrength: this.food[index] ?? 0,
      homeStrength: this.home[index] ?? 0,
      lastUpdated: this.lastUpdated,
    };
  }

  deposit(ix: number, iy: number, iz: number, foodAmt: number, homeAmt: number, maxStrength: number): void {
    if (!this.inBounds(ix, iy, iz)) return;
    const i = this.index(ix, iy, iz);
    if (foodAmt > 0) this.food[i] = Math.min(maxStrength, this.food[i] + foodAmt);
    if (homeAmt > 0) this.home[i] = Math.min(maxStrength, this.home[i] + homeAmt);
  }

  /** Multiply every trace by `factor` (already scaled for dt). */
  evaporate(factor: number, time: number): void {
    const food = this.food;
    const home = this.home;
    let sum = 0;
    let active = 0;
    for (let i = 0; i < food.length; i++) {
      let f = food[i];
      let h = home[i];
      if (f === 0 && h === 0) continue;
      f *= factor;
      h *= factor;
      if (f <= 1e-4) f = 0;
      if (h <= 1e-4) h = 0;
      food[i] = f;
      home[i] = h;
      sum += f + h;
      if (f > 0 || h > 0) active++;
    }
    this.totalConcentration = sum;
    this.activeCount = active;
    this.lastUpdated = time;
  }

  recomputeTotals(): void {
    let sum = 0;
    let active = 0;
    for (let i = 0; i < this.food.length; i++) {
      const v = this.food[i] + this.home[i];
      sum += v;
      if (v > 0) active++;
    }
    this.totalConcentration = sum;
    this.activeCount = active;
  }

  mean(): number {
    return this.totalConcentration / this.food.length;
  }

  /**
   * Optional neighbor blur. `rate` is the blend toward the local average.
   * Solids are skipped so walls do not leak scent.
   */
  diffuse(rate: number, solids: Uint8Array): void {
    const blend = Math.max(0, Math.min(1, rate));
    if (blend <= 0) return;
    const nextF = this.foodBuf;
    const nextH = this.homeBuf;
    const food = this.food;
    const home = this.home;
    const nx = this.nx;
    const ny = this.ny;
    const nz = this.nz;
    for (let iz = 0; iz < nz; iz++) {
      for (let iy = 0; iy < ny; iy++) {
        for (let ix = 0; ix < nx; ix++) {
          const i = ix + nx * (iy + ny * iz);
          if (solids[i] === 1 || (food[i] === 0 && home[i] === 0)) {
            nextF[i] = solids[i] === 1 ? 0 : food[i];
            nextH[i] = solids[i] === 1 ? 0 : home[i];
            continue;
          }
          let sumF = food[i];
          let sumH = home[i];
          let n = 1;
          for (let d = 0; d < DIRS.length; d++) {
            const jx = ix + DIRS[d][0];
            const jy = iy + DIRS[d][1];
            const jz = iz + DIRS[d][2];
            if (jx < 0 || jy < 0 || jz < 0 || jx >= nx || jy >= ny || jz >= nz) continue;
            const j = jx + nx * (jy + ny * jz);
            if (solids[j] === 1) continue;
            sumF += food[j];
            sumH += home[j];
            n++;
          }
          const avgF = sumF / n;
          const avgH = sumH / n;
          nextF[i] = food[i] * (1 - blend) + avgF * blend;
          nextH[i] = home[i] * (1 - blend) + avgH * blend;
        }
      }
    }
    this.foodBuf = this.food;
    this.homeBuf = this.home;
    this.food = nextF;
    this.home = nextH;
    this.recomputeTotals();
  }

  sampleStrongest(
    kind: "food" | "home",
    limit: number,
    solids: Uint8Array,
    minStrength: number,
  ): { index: number; strength: number }[] {
    const src = kind === "food" ? this.food : this.home;
    const out: { index: number; strength: number }[] = [];
    for (let i = 0; i < src.length; i++) {
      const s = src[i];
      if (s < minStrength || solids[i] === 1) continue;
      if (out.length < limit) {
        out.push({ index: i, strength: s });
        if (out.length === limit) out.sort((a, b) => a.strength - b.strength);
      } else if (s > out[0].strength) {
        out[0] = { index: i, strength: s };
        out.sort((a, b) => a.strength - b.strength);
      }
    }
    return out;
  }
}
