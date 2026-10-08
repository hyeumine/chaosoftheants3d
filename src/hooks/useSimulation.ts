import { useEffect } from "react";
import { SimulationEngine } from "../engine/SimulationEngine";
import { getEngine, replaceEngine } from "../store/engineInstance";
import { useSimulationStore } from "../store/simulationStore";

function publish(): void {
  const engine = getEngine();
  const store = useSimulationStore.getState();
  if (engine.runId !== store.runId) {
    store.resetSeries(engine.runId, engine.copyMetrics());
  } else {
    store.setMetrics(engine.copyMetrics());
  }
  if (engine.sceneVersion !== store.sceneVersion) store.setSceneVersion(engine.sceneVersion);
  const fresh = useSimulationStore.getState();
  if (fresh.history.length === 0 || engine.time - fresh.lastSample >= 0.5) {
    fresh.pushSample(engine.historySample(), engine.time);
  }
  store.setStatus(engine.statusMessage, engine.warning);
  const ny = engine.world.ny;
  if (store.view.sliceLayer > ny - 1) store.patchView({ sliceLayer: Math.max(1, ny - 2) });
}

export function useSimulationLoop(): void {
  useEffect(() => {
    const engine = getEngine();
    publish();
    const unsubscribe = useSimulationStore.subscribe((state, previous) => {
      if (state.config === previous.config) return;
      const structural =
        state.config.worldWidth !== previous.config.worldWidth ||
        state.config.worldHeight !== previous.config.worldHeight ||
        state.config.worldDepth !== previous.config.worldDepth ||
        state.config.cellSize !== previous.config.cellSize;
      if (structural) {
        const next = new SimulationEngine(state.config);
        next.generateMaze(state.config.mazeType);
        replaceEngine(next);
        const current = useSimulationStore.getState();
        current.resetSeries(next.runId, next.copyMetrics());
        current.setSceneVersion(next.sceneVersion);
        current.setStatus(next.statusMessage, next.warning);
      } else {
        getEngine().updateConfig(state.config);
      }
    });

    let frame = 0;
    let last = performance.now();
    let accumulator = 0;
    let ui = 0;
    const tick = (now: number) => {
      const realDt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const state = useSimulationStore.getState();
      if (state.running && !state.experimentRunning) {
        const speed = Math.max(0.05, state.config.simulationSpeed);
        accumulator += realDt * speed;
        const fixed = 1 / 20;
        let steps = 0;
        const sim = getEngine();
        while (accumulator >= fixed && steps < 12) {
          sim.step(fixed);
          accumulator -= fixed;
          steps++;
        }
        if (steps === 12) accumulator = 0;
      } else {
        accumulator = 0;
      }
      ui += realDt;
      if (ui >= 0.2) {
        ui = 0;
        publish();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      if (event.code === "Space") {
        event.preventDefault();
        useSimulationStore.getState().toggleRunning();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      unsubscribe();
      window.removeEventListener("keydown", onKey);
    };
  }, []);
}
