import { useState } from "react";
import { ChartsPanel } from "./components/ChartsPanel";
import { ControlPanel } from "./components/ControlPanel";
import { ExperimentPanel } from "./components/ExperimentPanel";
import { SimulationCanvas } from "./components/SimulationCanvas";
import { StatisticsPanel } from "./components/StatisticsPanel";
import { useSimulationLoop } from "./hooks/useSimulation";

export default function App() {
  const [tab, setTab] = useState<"simulation" | "experiment">("simulation");
  useSimulationLoop();
  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-200">
      <header className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-2">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-amber-400/90">Chaos of the Ants</div>
          <h1 className="text-sm font-semibold text-slate-100">Emergent routing through decentralized swarm intelligence</h1>
        </div>
        <p className="hidden text-xs text-slate-400 lg:block">Local chaos + simple rules = emergent global order</p>
        <div className="flex rounded-lg border border-slate-800 p-0.5">
          <TabButton active={tab === "simulation"} onClick={() => setTab("simulation")}>Simulation</TabButton>
          <TabButton active={tab === "experiment"} onClick={() => setTab("experiment")}>Experiment</TabButton>
        </div>
      </header>
      {tab === "simulation" ? (
        <div className="flex min-h-0 flex-1">
          <ControlPanel />
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="relative min-h-0 flex-1">
              <SimulationCanvas />
            </div>
            <ChartsPanel />
          </div>
          <StatisticsPanel />
        </div>
      ) : (
        <ExperimentPanel />
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className={`rounded-md px-3 py-1 text-sm ${active ? "bg-slate-800 text-amber-200" : "text-slate-400"}`} onClick={onClick}>
      {children}
    </button>
  );
}
