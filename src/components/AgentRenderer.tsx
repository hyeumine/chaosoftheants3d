import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getEngine } from "../store/engineInstance";
import { useSimulationStore } from "../store/simulationStore";
import { STATE_COLORS } from "../utils/colors";

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const DIR = new THREE.Vector3();

export function AgentRenderer() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const radii = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const geometry = useMemo(() => new THREE.ConeGeometry(0.34, 0.86, 5), []);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), []);
  const halo = useMemo(() => new THREE.SphereGeometry(1, 10, 8), []);
  const haloMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: "#fde68a", transparent: true, opacity: 0.08, depthWrite: false }),
    [],
  );

  useFrame(() => {
    const engine = getEngine();
    const show = useSimulationStore.getState().layers.agents;
    const showRadius = useSimulationStore.getState().layers.communication;
    const body = mesh.current;
    const rings = radii.current;
    if (!body || !rings) return;
    body.visible = show;
    rings.visible = show && showRadius;
    const agents = engine.agents;
    body.count = agents.length;
    if (!show) return;
    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i];
      DIR.set(agent.direction.x, agent.direction.y, agent.direction.z);
      if (DIR.lengthSq() < 1e-8) DIR.set(0, 1, 0);
      else DIR.normalize();
      const bodyScale = Math.max(2.2, engine.world.cellSize * 1.05) * (agent.carryingFood ? 1.35 : 1);
      dummy.position.set(agent.position.x, agent.position.y, agent.position.z);
      dummy.quaternion.setFromUnitVectors(Y_AXIS, DIR);
      dummy.scale.setScalar(bodyScale);
      dummy.updateMatrix();
      body.setMatrixAt(i, dummy.matrix);
      color.set(STATE_COLORS[agent.state]);
      body.setColorAt(i, color);
    }
    body.instanceMatrix.needsUpdate = true;
    if (body.instanceColor) body.instanceColor.needsUpdate = true;

    if (!showRadius) return;
    const stride = Math.max(1, Math.ceil(agents.length / 12));
    let n = 0;
    const reach = Math.max(0.4, engine.config.communicationRadius);
    for (let i = 0; i < agents.length && n < 12; i += stride) {
      const agent = agents[i];
      dummy.position.set(agent.position.x, agent.position.y, agent.position.z);
      dummy.quaternion.identity();
      dummy.scale.setScalar(reach);
      dummy.updateMatrix();
      rings.setMatrixAt(n, dummy.matrix);
      n++;
    }
    rings.count = n;
    rings.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh
        ref={(node) => {
          mesh.current = node;
          if (node) node.count = 0;
        }}
        args={[geometry, material, 2500]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={(node) => {
          radii.current = node;
          if (node) node.count = 0;
        }}
        args={[halo, haloMaterial, 12]}
        frustumCulled={false}
      />
    </>
  );
}
