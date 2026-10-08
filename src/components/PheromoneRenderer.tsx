import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getEngine } from "../store/engineInstance";
import { useSimulationStore } from "../store/simulationStore";

const CAP = 2200;

export function PheromoneRenderer() {
  const foodMesh = useRef<THREE.InstancedMesh>(null);
  const homeMesh = useRef<THREE.InstancedMesh>(null);
  const heatMesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const box = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const foodMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: "#f97316", transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false }),
    [],
  );
  const homeMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: "#38bdf8", transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false }),
    [],
  );
  const heatMat = useMemo(
    () => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false }),
    [],
  );
  const frame = useRef(0);

  useFrame(() => {
    frame.current++;
    const engine = getEngine();
    const layers = useSimulationStore.getState().layers;
    const world = engine.world;
    const heavy = world.voxelCount > 60000 || engine.agents.length >= 800;
    if (heavy && frame.current % 3 !== 0) return;
    paintField(foodMesh.current, engine, "food", layers.foodPheromone, dummy, color, heavy ? 900 : CAP);
    paintField(homeMesh.current, engine, "home", layers.homePheromone, dummy, color, heavy ? 900 : CAP);
    paintHeat(heatMesh.current, engine, layers.heatmap, dummy, color, heavy ? 700 : 1800);
  });

  return (
    <>
      <instancedMesh
        ref={(node) => {
          foodMesh.current = node;
          if (node) node.count = 0;
        }}
        args={[box, foodMat, CAP]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={(node) => {
          homeMesh.current = node;
          if (node) node.count = 0;
        }}
        args={[box, homeMat, CAP]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={(node) => {
          heatMesh.current = node;
          if (node) node.count = 0;
        }}
        args={[box, heatMat, 1800]}
        frustumCulled={false}
      />
    </>
  );
}

function paintField(
  mesh: THREE.InstancedMesh | null,
  engine: ReturnType<typeof getEngine>,
  kind: "food" | "home",
  visible: boolean,
  dummy: THREE.Object3D,
  color: THREE.Color,
  cap: number,
): void {
  if (!mesh) return;
  mesh.visible = visible;
  if (!visible) return;
  const world = engine.world;
  const samples = engine.pheromones.sampleStrongest(kind, cap, world.solids, 0.08);
  const max = engine.config.maxPheromone;
  mesh.count = samples.length;
  for (let i = 0; i < samples.length; i++) {
    const cell = world.decode(samples[i].index);
    const center = world.cellCenter(cell.ix, cell.iy, cell.iz);
    const strength = samples[i].strength / max;
    dummy.position.set(center.x, center.y, center.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(world.cellSize * (0.25 + 0.7 * Math.min(1, strength)));
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    color.set(kind === "food" ? "#fb923c" : "#7dd3fc");
    color.multiplyScalar(0.45 + 0.7 * Math.min(1, strength));
    mesh.setColorAt(i, color);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

function paintHeat(
  mesh: THREE.InstancedMesh | null,
  engine: ReturnType<typeof getEngine>,
  visible: boolean,
  dummy: THREE.Object3D,
  color: THREE.Color,
  cap: number,
): void {
  if (!mesh) return;
  mesh.visible = visible;
  if (!visible) return;
  const world = engine.world;
  const hits: { index: number; value: number }[] = [];
  for (let i = 0; i < world.visits.length; i++) {
    const value = world.visits[i];
    if (value === 0 || world.solids[i] === 1) continue;
    if (hits.length < cap) {
      hits.push({ index: i, value });
      if (hits.length === cap) hits.sort((a, b) => a.value - b.value);
    } else if (value > hits[0].value) {
      hits[0] = { index: i, value };
      hits.sort((a, b) => a.value - b.value);
    }
  }
  mesh.count = hits.length;
  let peak = 1;
  for (const hit of hits) peak = Math.max(peak, hit.value);
  for (let i = 0; i < hits.length; i++) {
    const cell = world.decode(hits[i].index);
    const center = world.cellCenter(cell.ix, cell.iy, cell.iz);
    const t = hits[i].value / peak;
    dummy.position.set(center.x, center.y, center.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(world.cellSize * 0.92);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    color.setRGB(0.15, 0.25 + 0.55 * t, 0.2 + 0.3 * (1 - t));
    mesh.setColorAt(i, color);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}
