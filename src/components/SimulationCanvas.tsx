import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { FlyControls, Grid, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { AgentRenderer } from "./AgentRenderer";
import { ObstacleRenderer } from "./ObstacleRenderer";
import { PheromoneRenderer } from "./PheromoneRenderer";
import { WorldEditor } from "./WorldEditor";
import { getEngine } from "../store/engineInstance";
import { useSimulationStore } from "../store/simulationStore";
import { LAYER_SWATCHES } from "../utils/colors";
import type { CameraPreset, Vector3D } from "../types/simulation";

export function SimulationCanvas() {
  const projection = useSimulationStore((state) => state.view.projection);
  return (
    <div className="absolute inset-0 bg-slate-950">
      <Canvas
        key={projection}
        orthographic={projection === "orthographic"}
        dpr={[1, 1.5]}
        camera={{ position: [78, 52, 78], fov: 42, near: 0.1, far: 2500, zoom: projection === "orthographic" ? 8 : 1 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
        <color attach="background" args={["#020617"]} />
        <ambientLight intensity={0.62} />
        <hemisphereLight args={["#94a3b8", "#020617", 0.35]} />
        <directionalLight position={[40, 90, 24]} intensity={1.15} />
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
      <CanvasOverlay />
    </div>
  );
}

function Scene() {
  return (
    <>
      <CameraRig />
      <Dressing />
      <ObstacleRenderer />
      <PheromoneRenderer />
      <AgentRenderer />
      <RouteLines />
      <Encounters />
      <Markers />
      <WorldEditor />
    </>
  );
}

function presetPosition(preset: CameraPreset, width: number, height: number, depth: number): [number, number, number] {
  const span = Math.max(width, depth);
  if (preset === "top") return [width / 2, span * 1.15, depth / 2 + 0.01];
  if (preset === "front") return [width / 2, height * 0.55, depth * 1.7];
  if (preset === "side") return [width * 1.7, height * 0.55, depth / 2];
  return [width * 0.95, Math.max(height, 18) * 1.35, depth * 0.95];
}

function CameraRig() {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls);
  const preset = useSimulationStore((state) => state.view.preset);
  const nonce = useSimulationStore((state) => state.view.presetNonce);
  const sceneVersion = useSimulationStore((state) => state.sceneVersion);
  const speed = useSimulationStore((state) => state.view.cameraSpeed);
  const firstPerson = useSimulationStore((state) => state.view.firstPerson);
  const projection = useSimulationStore((state) => state.view.projection);
  const tool = useSimulationStore((state) => state.tool);

  useEffect(() => {
    const world = getEngine().world;
    const look = new THREE.Vector3(world.width / 2, world.height * 0.35, world.depth / 2);
    const pos = presetPosition(preset, world.width, world.height, world.depth);
    camera.position.set(pos[0], pos[1], pos[2]);
    camera.lookAt(look);
    if ((camera as THREE.OrthographicCamera).isOrthographicCamera) {
      const ortho = camera as THREE.OrthographicCamera;
      ortho.zoom = 640 / Math.max(world.width, world.depth, 1);
      ortho.updateProjectionMatrix();
    } else {
      camera.updateProjectionMatrix();
    }
    const orbit = controls as { target?: THREE.Vector3; update?: () => void } | null;
    orbit?.target?.copy(look);
    orbit?.update?.();
  }, [preset, nonce, sceneVersion, camera, controls, projection]);

  useFrame(() => {
    const orbit = controls as {
      enabled?: boolean;
      rotateSpeed?: number;
      panSpeed?: number;
      zoomSpeed?: number;
      mouseButtons?: { LEFT: number | null };
    } | null;
    if (!orbit) return;
    orbit.enabled = !firstPerson;
    orbit.rotateSpeed = speed;
    orbit.panSpeed = speed;
    orbit.zoomSpeed = speed;
    if (orbit.mouseButtons) orbit.mouseButtons.LEFT = tool === "navigate" ? THREE.MOUSE.ROTATE : null;
  });

  return firstPerson ? (
    <FlyControls movementSpeed={10 * speed} rollSpeed={0.2} dragToLook />
  ) : (
    <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
  );
}

function Dressing() {
  const grid = useSimulationStore((state) => state.layers.grid);
  const axes = useSimulationStore((state) => state.layers.axes);
  const boundary = useSimulationStore((state) => state.layers.boundary);
  const sceneVersion = useSimulationStore((state) => state.sceneVersion);
  const world = getEngine().world;
  void sceneVersion;
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), []);
  return (
    <>
      {grid && (
        <Grid
          args={[world.width, world.depth]}
          position={[world.width / 2, 0.02, world.depth / 2]}
          cellSize={world.cellSize}
          cellColor="#1e293b"
          sectionColor="#334155"
          fadeDistance={Math.max(world.width, world.depth) * 2}
          infiniteGrid={false}
        />
      )}
      {axes && <axesHelper args={[Math.min(12, world.cellSize * 3)]} />}
      {boundary && (
        <lineSegments geometry={edges} position={[world.width / 2, world.height / 2, world.depth / 2]} scale={[world.width, world.height, world.depth]}>
          <lineBasicMaterial color="#64748b" />
        </lineSegments>
      )}
    </>
  );
}

function Markers() {
  const labels = useSimulationStore((state) => state.layers.labels);
  const nest = useRef<THREE.Group>(null);
  const food = useRef<THREE.Group>(null);
  useFrame(() => {
    const world = getEngine().world;
    const scale = Math.max(0.65, world.cellSize * 0.36);
    nest.current?.position.set(world.nest.x, world.nest.y, world.nest.z);
    food.current?.position.set(world.food.x, world.food.y, world.food.z);
    nest.current?.scale.setScalar(scale);
    food.current?.scale.setScalar(scale);
  });
  return (
    <>
      <group ref={nest}>
        <mesh>
          <sphereGeometry args={[1, 24, 24]} />
          <meshStandardMaterial color="#38bdf8" emissive="#0369a1" emissiveIntensity={0.85} />
        </mesh>
        {labels && <MarkerLabel text="NEST" color="#7dd3fc" />}
      </group>
      <group ref={food}>
        <mesh>
          <octahedronGeometry args={[1.05, 0]} />
          <meshStandardMaterial color="#4ade80" emissive="#15803d" emissiveIntensity={0.8} />
        </mesh>
        {labels && <MarkerLabel text="FOOD" color="#86efac" />}
      </group>
    </>
  );
}

function MarkerLabel({ text, color }: { text: string; color: string }) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(2, 6, 23, 0.82)";
      ctx.beginPath();
      ctx.roundRect(8, 8, 240, 48, 10);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.font = "600 28px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 128, 32);
    }
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.needsUpdate = true;
    return map;
  }, [text, color]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <sprite position={[0, 2.5, 0]} scale={[4.6, 1.15, 1]}>
      <spriteMaterial map={texture} transparent depthTest={false} />
    </sprite>
  );
}

function RouteLines() {
  const best = usePathBuffer(() => (useSimulationStore.getState().layers.bestRoute ? getEngine().bestPath : []), "#4ade80");
  const reference = usePathBuffer(
    () => (useSimulationStore.getState().layers.shortestRoute ? getEngine().referencePath : []),
    "#e879f9",
  );
  return (
    <>
      <threeLine ref={best.ref} geometry={best.geometry}>
        <lineBasicMaterial color="#4ade80" />
      </threeLine>
      <threeLine ref={reference.ref} geometry={reference.geometry}>
        <lineBasicMaterial color="#e879f9" />
      </threeLine>
    </>
  );
}

function usePathBuffer(read: () => Vector3D[], color: string) {
  void color;
  const geometry = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(4000 * 3), 3));
    geom.setDrawRange(0, 0);
    return geom;
  }, []);
  const ref = useRef<THREE.Line>(null);
  useFrame(() => {
    const points = read();
    const attr = geometry.getAttribute("position") as THREE.BufferAttribute;
    const count = Math.min(points.length, 4000);
    for (let i = 0; i < count; i++) attr.setXYZ(i, points[i].x, points[i].y, points[i].z);
    attr.needsUpdate = true;
    geometry.setDrawRange(0, count);
    if (ref.current) ref.current.visible = count > 1;
  });
  return { geometry, ref };
}

function Encounters() {
  const geometry = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(240 * 6), 3));
    geom.setDrawRange(0, 0);
    return geom;
  }, []);
  useFrame(() => {
    const show = useSimulationStore.getState().layers.encounters;
    const lines = show ? getEngine().exchange.visuals : [];
    const attr = geometry.getAttribute("position") as THREE.BufferAttribute;
    const count = Math.min(lines.length, 240);
    for (let i = 0; i < count; i++) {
      const line = lines[i];
      attr.setXYZ(i * 2, line.x1, line.y1, line.z1);
      attr.setXYZ(i * 2 + 1, line.x2, line.y2, line.z2);
    }
    attr.needsUpdate = true;
    geometry.setDrawRange(0, count * 2);
  });
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#fde68a" transparent opacity={0.85} />
    </lineSegments>
  );
}

function CanvasOverlay() {
  const status = useSimulationStore((state) => state.status);
  const warning = useSimulationStore((state) => state.warning);
  const preset = useSimulationStore((state) => state.view.preset);
  const projection = useSimulationStore((state) => state.view.projection);
  const firstPerson = useSimulationStore((state) => state.view.firstPerson);
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="pointer-events-auto absolute left-3 top-3 flex flex-wrap gap-1.5">
        {(["iso", "top", "front", "side"] as CameraPreset[]).map((name) => (
          <button
            key={name}
            className={`rounded border px-2 py-1 text-[11px] uppercase tracking-wide ${preset === name ? "border-amber-400 bg-amber-400/15 text-amber-200" : "border-slate-700 bg-slate-950/80 text-slate-300"}`}
            onClick={() => useSimulationStore.getState().setPreset(name)}
          >
            {name}
          </button>
        ))}
        <button
          className="rounded border border-slate-700 bg-slate-950/80 px-2 py-1 text-[11px] text-slate-300"
          onClick={() =>
            useSimulationStore.getState().patchView({
              projection: projection === "perspective" ? "orthographic" : "perspective",
            })
          }
        >
          {projection === "perspective" ? "Ortho" : "Perspective"}
        </button>
        <button
          className={`rounded border px-2 py-1 text-[11px] ${firstPerson ? "border-cyan-400 bg-cyan-400/15 text-cyan-200" : "border-slate-700 bg-slate-950/80 text-slate-300"}`}
          onClick={() => useSimulationStore.getState().patchView({ firstPerson: !firstPerson })}
        >
          Inspect
        </button>
        <button
          className="rounded border border-slate-700 bg-slate-950/80 px-2 py-1 text-[11px] text-slate-300"
          onClick={() => useSimulationStore.getState().setPreset(preset)}
        >
          Reset camera
        </button>
      </div>
      <div className="absolute bottom-3 left-3 max-w-[280px] rounded-lg border border-slate-800 bg-slate-950/80 p-2">
        <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-slate-500">Legend</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {LAYER_SWATCHES.map((item) => (
            <div key={item.label} className="flex items-center gap-1.5 text-[10px] text-slate-300">
              <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
              {item.label}
            </div>
          ))}
        </div>
      </div>
      <div className="absolute bottom-3 right-3 max-w-sm space-y-1 text-right">
        {warning && <div className="rounded border border-amber-700/60 bg-amber-950/80 px-2 py-1 text-[11px] text-amber-100">{warning}</div>}
        <div className="rounded border border-slate-800 bg-slate-950/80 px-2 py-1 text-[11px] text-slate-300">{status}</div>
      </div>
    </div>
  );
}
