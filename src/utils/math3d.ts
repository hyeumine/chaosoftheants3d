import type { Vector3D } from "../types/simulation";

export function setV(out: Vector3D, x: number, y: number, z: number): Vector3D {
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

export function copyV(out: Vector3D, a: Vector3D): Vector3D {
  out.x = a.x;
  out.y = a.y;
  out.z = a.z;
  return out;
}

export function cloneV(a: Vector3D): Vector3D {
  return { x: a.x, y: a.y, z: a.z };
}

export function subV(out: Vector3D, a: Vector3D, b: Vector3D): Vector3D {
  out.x = a.x - b.x;
  out.y = a.y - b.y;
  out.z = a.z - b.z;
  return out;
}

export function lengthV(a: Vector3D): number {
  return Math.hypot(a.x, a.y, a.z);
}

export function distV(a: Vector3D, b: Vector3D): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function distSq(a: Vector3D, b: Vector3D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

export function normalizeV(out: Vector3D, a: Vector3D): boolean {
  const len = Math.hypot(a.x, a.y, a.z);
  if (len < 1e-8) {
    out.x = 0;
    out.y = 0;
    out.z = 0;
    return false;
  }
  out.x = a.x / len;
  out.y = a.y / len;
  out.z = a.z / len;
  return true;
}

export function scaleV(out: Vector3D, a: Vector3D, s: number): Vector3D {
  out.x = a.x * s;
  out.y = a.y * s;
  out.z = a.z * s;
  return out;
}

export function addScaled(out: Vector3D, a: Vector3D, b: Vector3D, s: number): Vector3D {
  out.x = a.x + b.x * s;
  out.y = a.y + b.y * s;
  out.z = a.z + b.z * s;
  return out;
}

export function lerpV(out: Vector3D, a: Vector3D, b: Vector3D, t: number): Vector3D {
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  out.z = a.z + (b.z - a.z) * t;
  return out;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
