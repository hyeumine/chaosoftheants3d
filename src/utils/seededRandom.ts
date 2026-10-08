/**
 * Mulberry32 deterministic PRNG. The same seed always yields the same stream.
 * Simulation code must not call Math.random.
 */
export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    const s = seed >>> 0;
    this.state = s === 0 ? 1 : s;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  nextInt(n: number): number {
    if (n <= 1) return 0;
    return Math.floor(this.next() * n);
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  signed(): number {
    return this.next() * 2 - 1;
  }
}
