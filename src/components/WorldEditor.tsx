import { useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { raycastVoxels, rayPlaneY } from "../engine/VoxelRay";
import { getEngine } from "../store/engineInstance";
import { useSimulationStore } from "../store/simulationStore";
import type { EditorTool } from "../types/simulation";

export function WorldEditor() {
  const catcher = useRef<THREE.Mesh>(null);
  const hover = useRef<THREE.Mesh>(null);
  const hoverMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: "#f8fafc", transparent: true, opacity: 0.28, depthWrite: false }),
    [],
  );

  useFrame(() => {
    const mesh = catcher.current;
    const world = getEngine().world;
    if (!mesh) return;
    mesh.position.set(world.width / 2, world.height / 2, world.depth / 2);
    mesh.scale.set(world.width, world.height, world.depth);
  });

  const edit = (event: ThreeEvent<PointerEvent>, drag: boolean) => {
    const tool = useSimulationStore.getState().tool;
    if (tool === "navigate") return;
    if (drag && (event.nativeEvent.buttons & 1) === 0) return;
    if (drag && (tool === "nest" || tool === "food")) return;
    const world = getEngine().world;
    const view = useSimulationStore.getState().view;
    const ray = event.ray;
    let ix = -1;
    let iy = -1;
    let iz = -1;
    if (view.sliceEnabled) {
      const y = (Math.min(world.ny - 1, view.sliceLayer) + 0.5) * world.cellSize;
      const point = rayPlaneY(ray.origin.x, ray.origin.y, ray.origin.z, ray.direction.x, ray.direction.y, ray.direction.z, y);
      if (!point || !world.contains(point.x, point.y, point.z)) return;
      const voxel = world.voxelOf(point.x, point.y, point.z);
      if (!voxel) return;
      ix = voxel.ix;
      iy = voxel.iy;
      iz = voxel.iz;
    } else {
      const hit = raycastVoxels(
        world,
        ray.origin.x,
        ray.origin.y,
        ray.origin.z,
        ray.direction.x,
        ray.direction.y,
        ray.direction.z,
        Math.max(world.width, world.height, world.depth) * 3,
      );
      const cell = cellForTool(tool, hit.hit, hit.before);
      if (!cell) return;
      ix = cell.ix;
      iy = cell.iy;
      iz = cell.iz;
    }
    const engine = getEngine();
    if (tool === "add" || tool === "paint") engine.setObstacle(ix, iy, iz, true);
    else if (tool === "remove" || tool === "erase") engine.setObstacle(ix, iy, iz, false);
    else if (tool === "nest") engine.placeNest(ix, iy, iz);
    else if (tool === "food") engine.placeFood(ix, iy, iz);
    const marker = hover.current;
    if (marker) {
      const center = world.cellCenter(ix, iy, iz);
      marker.position.set(center.x, center.y, center.z);
      marker.scale.setScalar(world.cellSize * 1.02);
      marker.visible = true;
    }
    useSimulationStore.getState().setStatus(engine.statusMessage, engine.warning);
    useSimulationStore.getState().setMetrics(engine.copyMetrics());
    useSimulationStore.getState().setSceneVersion(engine.sceneVersion);
    event.stopPropagation();
  };

  return (
    <>
      <mesh
        ref={catcher}
        onPointerDown={(event) => edit(event, false)}
        onPointerMove={(event) => edit(event, true)}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={hover} visible={false} material={hoverMaterial}>
        <boxGeometry args={[1, 1, 1]} />
      </mesh>
    </>
  );
}

function cellForTool(
  tool: EditorTool,
  hit: { ix: number; iy: number; iz: number } | null,
  before: { ix: number; iy: number; iz: number } | null,
): { ix: number; iy: number; iz: number } | null {
  if (tool === "remove" || tool === "erase") return hit;
  return before ?? hit;
}
