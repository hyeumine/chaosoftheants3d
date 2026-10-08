import { useSimulationStore } from "../store/simulationStore";

export function StatisticsPanel() {
  const metrics = useSimulationStore((state) => state.metrics);
  const efficiency = metrics.routeEfficiency === null ? null : metrics.routeEfficiency * 100;
  return (
    <aside className="flex w-[300px] shrink-0 flex-col border-l border-slate-800 bg-slate-950/95">
      <div className="border-b border-slate-800 px-3 py-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Live statistics</h2>
        <div className="mt-1 font-mono text-lg text-amber-200">{metrics.time.toFixed(1)}s</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <Group title="Population">
          <Stat label="Total agents" value={metrics.totalAgents} />
          <Stat label="Exploring" value={metrics.exploring} />
          <Stat label="Returning" value={metrics.returning} />
          <Stat label="Carrying food" value={metrics.carrying} />
          <Stat label="Knowing food" value={metrics.knowingFood} />
          <Stat label="Knowing home" value={metrics.knowingHome} />
        </Group>
        <Group title="Foraging">
          <Stat label="Food delivered" value={metrics.foodDelivered} />
          <Stat label="Successful trips" value={metrics.successfulTrips} />
          <Stat label="Failed trips" value={metrics.failedTrips} />
          <Stat label="Knowledge exchanges" value={metrics.knowledgeExchanges} />
          <Stat label="Average path length" value={num(metrics.averagePathLength)} />
          <Stat label="Best discovered path" value={num(metrics.bestPathLength)} />
          <Stat label="Shortest reference path" value={num(metrics.optimalPathLength)} />
          <Stat label="Route efficiency" value={efficiency === null ? "—" : `${efficiency.toFixed(1)}%`} />
        </Group>
        <Group title="Coverage and recovery">
          <Stat label="Explored volume" value={`${metrics.exploredVolume.toFixed(1)}%`} />
          <Stat label="First food discovery" value={seconds(metrics.timeToFirstDiscovery)} />
          <Stat label="First delivery" value={seconds(metrics.timeToFirstDelivery)} />
          <Stat label="Recovery after disruption" value={seconds(metrics.recoveryTime)} />
          <Stat label="Disruptions" value={metrics.disruptionCount} />
          <Stat label="Route connected" value={metrics.reachable ? "yes" : "disconnected"} />
          <Stat label="Mean pheromone" value={metrics.meanPheromone.toFixed(3)} />
        </Group>
        <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
          The shortest path is a 6-connected voxel benchmark. Agents cannot read it. Efficiency is that length divided by the best measured outbound trip, and it is blank until both exist. Explored volume is the percent of open voxels visited.
        </p>
      </div>
    </aside>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-3">
      <h3 className="mb-1 text-[10px] uppercase tracking-[0.16em] text-slate-500">{title}</h3>
      <dl>{children}</dl>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-900 py-1 text-xs">
      <dt className="text-slate-400">{label}</dt>
      <dd className="font-mono text-slate-100">{value}</dd>
    </div>
  );
}

function num(value: number | null): string {
  return value === null ? "—" : value.toFixed(1);
}

function seconds(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}s`;
}
