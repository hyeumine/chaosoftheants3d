import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getEngine } from "../store/engineInstance";
import { useSimulationStore } from "../store/simulationStore";

const MAX_OBSTACLES = 30000;

export function ObstacleRenderer() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#e7d3a1",
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );

  useFrame(() => {
    const inst = mesh.current;
    if (!inst) return;
    const engine = getEngine();
    const state = useSimulationStore.getState();
    const show = state.layers.obstacles;
    inst.visible = show;
    if (!show) return;
    material.opacity = state.view.obstacleOpacity;
    const world = engine.world;
    const stamp = `${world.revision}:${state.view.sliceEnabled}:${state.view.sliceLayer}:${state.view.obstacleOpacity}`;
    if (inst.userData.stamp === stamp) return;
    inst.userData.stamp = stamp;
    const solids = world.solids;
    let total = 0;
    for (let i = 0; i < solids.length; i++) if (solids[i] === 1) total++;
    const stride = Math.max(1, Math.ceil(total / MAX_OBSTACLES));
    const limit = state.view.sliceEnabled ? Math.min(world.ny - 1, Math.max(0, state.view.sliceLayer)) : world.ny;
    let count = 0;
    const scale = world.cellSize * 0.96;
    for (let i = 0; i < solids.length && count < MAX_OBSTACLES; i += stride) {
      if (solids[i] !== 1) continue;
      const cell = world.decode(i);
      if (world.isShell(cell.ix, cell.iy, cell.iz)) continue;
      if (state.view.sliceEnabled && cell.iy > limit) continue;
      const center = world.cellCenter(cell.ix, cell.iy, cell.iz);
      dummy.position.set(center.x, center.y, center.z);
      dummy.scale.setScalar(scale);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      inst.setMatrixAt(count, dummy.matrix);
      count++;
    }
    inst.count = count;
    inst.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={(node) => {
        mesh.current = node;
        if (node) node.count = 0;
      }}
      args={[geometry, material, MAX_OBSTACLES]}
      frustumCulled={false}
    />
  );
}
