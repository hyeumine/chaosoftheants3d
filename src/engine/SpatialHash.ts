/**
 * Uniform 3D grid hash for neighborhood queries.
 * Encounter detection is O(N) expected, not O(N²).
 */
export class SpatialHash {
  cellSize: number;
  private map = new Map<number, number[]>();
  private used: number[] = [];
  queryIds: Int32Array;
  queryCount = 0;

  constructor(capacity: number, cellSize = 4) {
    this.cellSize = cellSize;
    this.queryIds = new Int32Array(Math.max(8, capacity));
  }

  resize(capacity: number): void {
    if (capacity > this.queryIds.length) {
      this.queryIds = new Int32Array(capacity);
    }
  }

  clear(): void {
    for (let i = 0; i < this.used.length; i++) {
      const bucket = this.map.get(this.used[i]);
      if (bucket) bucket.length = 0;
    }
    this.used.length = 0;
    this.queryCount = 0;
  }

  private key(ix: number, iy: number, iz: number): number {
    return (Math.imul(ix + 4096, 73856093) ^ Math.imul(iy + 4096, 19349663) ^ Math.imul(iz + 4096, 83492791)) >>> 0;
  }

  private cellOf(v: number): number {
    return Math.floor(v / this.cellSize);
  }

  insert(id: number, x: number, y: number, z: number): void {
    const key = this.key(this.cellOf(x), this.cellOf(y), this.cellOf(z));
    let bucket = this.map.get(key);
    if (!bucket) {
      bucket = [];
      this.map.set(key, bucket);
    }
    if (bucket.length === 0) this.used.push(key);
    bucket.push(id);
  }

  /** Fills queryIds with neighbor indices inside radius. Returns the count. */
  query(x: number, y: number, z: number, radius: number, selfId: number): number {
    this.queryCount = 0;
    const cs = this.cellSize;
    const minX = Math.floor((x - radius) / cs);
    const maxX = Math.floor((x + radius) / cs);
    const minY = Math.floor((y - radius) / cs);
    const maxY = Math.floor((y + radius) / cs);
    const minZ = Math.floor((z - radius) / cs);
    const maxZ = Math.floor((z + radius) / cs);
    const r2 = radius * radius;
    for (let iz = minZ; iz <= maxZ; iz++) {
      for (let iy = minY; iy <= maxY; iy++) {
        for (let ix = minX; ix <= maxX; ix++) {
          const bucket = this.map.get(this.key(ix, iy, iz));
          if (!bucket) continue;
          for (let b = 0; b < bucket.length; b++) {
            const id = bucket[b];
            if (id === selfId) continue;
            if (this.queryCount >= this.queryIds.length) return this.queryCount;
            this.queryIds[this.queryCount++] = id;
          }
        }
      }
    }
    // Distance is filtered by the caller when it has positions; r2 kept for API clarity.
    void r2;
    return this.queryCount;
  }
}
