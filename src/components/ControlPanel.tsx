import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, SkipForward, Trash2 } from "lucide-react";
import { activePreset } from "../utils/config";
import { selectMode, useSimulationStore } from "../store/simulationStore";
import type { EditorTool, LayerSettings, MazeType } from "../types/simulation";

export function ControlPanel() {
  const config = useSimulationStore((state) => state.config);
  const running = useSimulationStore((state) => state.running);
  const tool = useSimulationStore((state) => state.tool);
  const layers = useSimulationStore((state) => state.layers);
  const view = useSimulationStore((state) => state.view);
  const patch = useSimulationStore((state) => state.patchConfig);
  const preset = activePreset(config);

  return (
    <aside className="flex w-[320px] shrink-0 flex-col border-r border-slate-800 bg-slate-950/95">
      <div className="flex gap-2 border-b border-slate-800 p-3">
        <button className="flex flex-1 items-center justify-center gap-1 rounded bg-amber-500 px-2 py-1.5 text-sm font-semibold text-slate-950" onClick={() => useSimulationStore.getState().setRunning(!running)}>
          {running ? <Pause size={14} /> : <Play size={14} />}
          {running ? "Pause" : "Run"}
        </button>
        <button className="rounded border border-slate-700 px-2 py-1.5 text-slate-200" onClick={() => useSimulationStore.getState().stepOnce()} title="Advance one simulation step">
          <SkipForward size={14} />
        </button>
        <button className="rounded border border-slate-700 px-2 py-1.5 text-slate-200" onClick={() => useSimulationStore.getState().restart()} title="Restart agents on this maze">
          <RotateCcw size={14} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Algorithm">
          <div className="grid gap-1.5">
            <ModeButton active={preset === "random"} label="Random exploration" detail="No pheromone, no relay" onClick={() => selectMode("random")} />
            <ModeButton active={preset === "aco"} label="ACO-inspired baseline" detail="Pheromone only. Not a verbatim published ACO." onClick={() => selectMode("aco")} />
            <ModeButton active={preset === "coa"} label="Chaos of the Ants" detail="Pheromone plus encounter relay" onClick={() => selectMode("coa")} />
          </div>
          <label className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-300">
            <span>Encounter-based knowledge relay</span>
            <input
              type="checkbox"
              checked={config.relayEnabled}
              onChange={(event) => {
                if (event.target.checked) patch({ relayEnabled: true, pheromoneEnabled: true, mode: "coa" });
                else patch({ relayEnabled: false, pheromoneEnabled: true, mode: "aco" });
              }}
            />
          </label>
        </Section>
        <Section title="Agents and movement">
          <Slider label="Population" min={1} max={2000} step={1} value={config.population} onChange={(population) => patch({ population })} />
          <Slider label="Movement speed" min={0.5} max={18} step={0.1} value={config.moveSpeed} onChange={(moveSpeed) => patch({ moveSpeed })} />
          <Slider label="Exploration probability" min={0} max={1} step={0.01} value={config.explorationProbability} onChange={(explorationProbability) => patch({ explorationProbability })} />
          <Slider label="Sensing radius" min={1} max={20} step={0.1} value={config.sensingRadius} onChange={(sensingRadius) => patch({ sensingRadius })} />
          <Slider label="Simulation speed" min={0.1} max={8} step={0.1} value={config.simulationSpeed} onChange={(simulationSpeed) => patch({ simulationSpeed })} />
        </Section>
        <Section title="Pheromone and knowledge">
          <Slider label="Pheromone strength" min={0} max={3} step={0.01} value={config.pheromoneStrength} onChange={(pheromoneStrength) => patch({ pheromoneStrength })} />
          <Slider label="Evaporation rate" min={0} max={0.8} step={0.01} value={config.evaporationRate} onChange={(evaporationRate) => patch({ evaporationRate })} />
          <Slider label="Knowledge decay" min={0} max={0.4} step={0.005} value={config.knowledgeDecay} onChange={(knowledgeDecay) => patch({ knowledgeDecay })} />
          <Slider label="Communication radius" min={0.5} max={16} step={0.1} value={config.communicationRadius} onChange={(communicationRadius) => patch({ communicationRadius })} />
          <Slider label="Relay retention" min={0.1} max={1} step={0.01} value={config.relayRetention} onChange={(relayRetention) => patch({ relayRetention })} />
          <label className="mt-1 flex items-center justify-between text-xs text-slate-300">
            <span>Pheromone diffusion</span>
            <input type="checkbox" checked={config.diffusionEnabled} onChange={(event) => patch({ diffusionEnabled: event.target.checked })} />
          </label>
        </Section>
        <Section title="World and maze">
          <Slider label="Width" min={18} max={90} step={3} value={config.worldWidth} commit onChange={(worldWidth) => patch({ worldWidth })} />
          <Slider label="Height" min={12} max={48} step={3} value={config.worldHeight} commit onChange={(worldHeight) => patch({ worldHeight })} />
          <Slider label="Depth" min={18} max={90} step={3} value={config.worldDepth} commit onChange={(worldDepth) => patch({ worldDepth })} />
          <Slider label="Voxel size" min={1.5} max={6} step={0.5} value={config.cellSize} commit onChange={(cellSize) => patch({ cellSize })} />
          <Slider label="Maze complexity" min={1} max={12} step={1} value={config.mazeComplexity} onChange={(mazeComplexity) => patch({ mazeComplexity })} />
          <Slider label="Obstacle density" min={0.02} max={0.55} step={0.01} value={config.obstacleDensity} onChange={(obstacleDensity) => patch({ obstacleDensity })} />
          <Slider label="Passage width" min={1} max={3} step={1} value={config.passageWidth} onChange={(passageWidth) => patch({ passageWidth })} />
          <Slider label="Vertical connectivity" min={0} max={1} step={0.01} value={config.verticalConnectivity} onChange={(verticalConnectivity) => patch({ verticalConnectivity })} />
          <Slider label="Alternative routes" min={0} max={16} step={1} value={config.alternativeRoutes} onChange={(alternativeRoutes) => patch({ alternativeRoutes })} />
          <label className="mb-2 block text-xs text-slate-300">
            <span className="mb-1 block">Maze generator</span>
            <select
              className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1"
              value={config.mazeType === "empty" ? "backtracking" : config.mazeType}
              onChange={(event) => patch({ mazeType: event.target.value as MazeType })}
            >
              <option value="backtracking">3D recursive backtracking</option>
              <option value="division">3D recursive division</option>
              <option value="obstacles">Random 3D obstacle field</option>
            </select>
          </label>
          <label className="mb-2 block text-xs text-slate-300">
            <span className="mb-1 flex justify-between"><span>Random seed</span><span className="font-mono text-amber-200">{config.seed}</span></span>
            <input
              className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono"
              type="number"
              value={config.seed}
              onChange={(event) => patch({ seed: Number(event.target.value) || 1 })}
            />
          </label>
          <button className="mb-2 w-full rounded bg-amber-500 px-3 py-2 text-sm font-bold tracking-wide text-slate-950" onClick={() => useSimulationStore.getState().generateMaze()}>
            GENERATE 3D MAZE
          </button>
          <button className="w-full rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-200" onClick={() => useSimulationStore.getState().rebuildSeed()}>
            Rebuild current seed
          </button>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">Generate advances the seed so each click is a new connected maze. Rebuild repeats the seed shown above. Dimension changes regenerate immediately.</p>
        </Section>
        <Section title="Editor">
          <div className="grid grid-cols-2 gap-1.5">
            {EDITOR_TOOLS.map((item) => (
              <button
                key={item.id}
                className={`rounded border px-2 py-1.5 text-left text-[11px] ${tool === item.id ? "border-cyan-400 bg-cyan-400/10 text-cyan-100" : "border-slate-700 text-slate-300"}`}
                onClick={() => useSimulationStore.getState().setTool(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="mt-2 grid gap-1.5">
            <button className="rounded border border-rose-800 bg-rose-950/50 px-2 py-1.5 text-xs font-semibold text-rose-200" onClick={() => useSimulationStore.getState().destroyRoute()}>
              DESTROY ROUTE
            </button>
            <button className="flex items-center justify-center gap-1 rounded border border-slate-700 px-2 py-1.5 text-xs text-slate-200" onClick={() => useSimulationStore.getState().clearObstacles()}>
              <Trash2 size={12} /> Clear obstacles
            </button>
            <button className="rounded border border-slate-700 px-2 py-1.5 text-xs text-slate-200" onClick={() => useSimulationStore.getState().resetWorld()}>
              Reset world
            </button>
          </div>
          <label className="mt-3 flex items-center justify-between text-xs text-slate-300">
            <span>Slice view</span>
            <input type="checkbox" checked={view.sliceEnabled} onChange={(event) => useSimulationStore.getState().patchView({ sliceEnabled: event.target.checked })} />
          </label>
          {view.sliceEnabled && (
            <Slider label="Slice layer" min={1} max={16} step={1} value={view.sliceLayer} onChange={(sliceLayer) => useSimulationStore.getState().patchView({ sliceLayer })} />
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">Choose a tool, then click the volume. Orbit with the right mouse button while a tool is active. Slice view edits one horizontal layer.</p>
        </Section>
        <Section title="Camera and layers">
          <Slider label="Camera speed" min={0.2} max={3} step={0.05} value={view.cameraSpeed} onChange={(cameraSpeed) => useSimulationStore.getState().patchView({ cameraSpeed })} />
          <Slider label="Obstacle opacity" min={0.15} max={1} step={0.01} value={view.obstacleOpacity} onChange={(obstacleOpacity) => useSimulationStore.getState().patchView({ obstacleOpacity })} format={(value) => `${Math.round(value * 100)}%`} />
          <div className="mt-2 grid grid-cols-1 gap-1">
            {LAYER_TOGGLES.map((item) => (
              <label key={item.key} className="flex items-center justify-between text-xs text-slate-300">
                <span>{item.label}</span>
                <input type="checkbox" checked={layers[item.key]} onChange={() => useSimulationStore.getState().toggleLayer(item.key)} />
              </label>
            ))}
          </div>
        </Section>
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-slate-800 px-3 py-3">
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</h2>
      {children}
    </section>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  format,
  commit = false,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
  commit?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(value);
  useEffect(() => {
    draftRef.current = value;
    setDraft(value);
  }, [value]);
  const shown = commit ? draft : value;
  return (
    <label className="mb-2 block">
      <span className="mb-1 flex justify-between text-xs text-slate-300">
        <span>{label}</span>
        <span className="font-mono text-amber-200">{format ? format(shown) : Number(shown.toFixed(2))}</span>
      </span>
      <input
        className="w-full accent-amber-500"
        type="range"
        min={min}
        max={max}
        step={step}
        value={shown}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (commit) {
            draftRef.current = next;
            setDraft(next);
          } else onChange(next);
        }}
        onPointerUp={() => {
          if (commit) onChange(draftRef.current);
        }}
        onBlur={() => {
          if (commit) onChange(draftRef.current);
        }}
        onKeyUp={() => {
          if (commit) onChange(draftRef.current);
        }}
      />
    </label>
  );
}

function ModeButton({ active, label, detail, onClick }: { active: boolean; label: string; detail: string; onClick: () => void }) {
  return (
    <button className={`rounded border px-2 py-1.5 text-left ${active ? "border-amber-400 bg-amber-400/10" : "border-slate-700"}`} onClick={onClick}>
      <div className="text-xs font-semibold text-slate-100">{label}</div>
      <div className="text-[10px] text-slate-400">{detail}</div>
    </button>
  );
}

const EDITOR_TOOLS: { id: EditorTool; label: string }[] = [
  { id: "navigate", label: "Navigate" },
  { id: "nest", label: "Place nest" },
  { id: "food", label: "Place food" },
  { id: "add", label: "Add obstacle" },
  { id: "remove", label: "Remove obstacle" },
  { id: "paint", label: "Paint voxels" },
  { id: "erase", label: "Erase voxels" },
];

const LAYER_TOGGLES: { key: keyof LayerSettings; label: string }[] = [
  { key: "agents", label: "Show agents" },
  { key: "obstacles", label: "Show obstacles" },
  { key: "foodPheromone", label: "Show food pheromones" },
  { key: "homePheromone", label: "Show home pheromones" },
  { key: "encounters", label: "Show knowledge encounters" },
  { key: "communication", label: "Show communication radius" },
  { key: "heatmap", label: "Show exploration heatmap" },
  { key: "bestRoute", label: "Show best discovered route" },
  { key: "shortestRoute", label: "Show shortest reference route" },
  { key: "grid", label: "Show world grid" },
  { key: "axes", label: "Show axes" },
  { key: "labels", label: "Show nest and food labels" },
  { key: "boundary", label: "Show world boundary" },
];
