import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useSimulationStore } from "../store/simulationStore";

const TABS = [
  { id: "food", label: "Food delivered" },
  { id: "efficiency", label: "Route efficiency" },
  { id: "knowledge", label: "Knowledge" },
  { id: "pheromone", label: "Pheromone" },
  { id: "explored", label: "Explored volume" },
  { id: "states", label: "Agent states" },
  { id: "recovery", label: "Recovery" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function ChartsPanel() {
  const history = useSimulationStore((state) => state.history);
  const [tab, setTab] = useState<TabId>("food");
  const data = history.map((sample) => ({
    ...sample,
    t: Number(sample.t.toFixed(1)),
    efficiencyPct: sample.routeEfficiency === null ? null : sample.routeEfficiency * 100,
  }));
  return (
    <section className="h-[210px] shrink-0 border-t border-slate-800 bg-slate-950">
      <div className="flex gap-1 overflow-x-auto border-b border-slate-800 px-2 py-1">
        {TABS.map((item) => (
          <button
            key={item.id}
            className={`whitespace-nowrap rounded px-2 py-1 text-[11px] ${tab === item.id ? "bg-slate-800 text-amber-200" : "text-slate-400"}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="h-[168px] px-1">
        {data.length < 2 ? (
          <div className="flex h-full items-center justify-center text-xs text-slate-500">Charts fill as simulation time advances.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#1e293b" />
              <XAxis dataKey="t" stroke="#64748b" tick={{ fontSize: 10 }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 10 }} width={36} />
              <Tooltip contentStyle={{ background: "#020617", border: "1px solid #334155", fontSize: 12 }} />
              {tab === "food" && <Line type="monotone" dataKey="foodDelivered" name="Delivered" stroke="#34d399" dot={false} isAnimationActive={false} />}
              {tab === "efficiency" && <Line type="monotone" dataKey="efficiencyPct" name="Efficiency %" stroke="#fbbf24" dot={false} isAnimationActive={false} connectNulls={false} />}
              {tab === "knowledge" && (
                <>
                  <Line type="monotone" dataKey="knowingFoodPct" name="Knowing food %" stroke="#22d3ee" dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="knowledgeExchanges" name="Exchanges" stroke="#fde68a" dot={false} isAnimationActive={false} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </>
              )}
              {tab === "pheromone" && <Line type="monotone" dataKey="meanPheromone" name="Mean pheromone" stroke="#fb923c" dot={false} isAnimationActive={false} />}
              {tab === "explored" && <Line type="monotone" dataKey="exploredVolume" name="Explored %" stroke="#a3e635" dot={false} isAnimationActive={false} />}
              {tab === "states" && (
                <>
                  <Line type="monotone" dataKey="exploring" name="Exploring" stroke="#fbbf24" dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="following" name="Following" stroke="#a3e635" dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="returning" name="Returning" stroke="#22d3ee" dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="carrying" name="Carrying" stroke="#4ade80" dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="recovering" name="Recovering" stroke="#f87171" dot={false} isAnimationActive={false} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </>
              )}
              {tab === "recovery" && (
                <>
                  <Line type="monotone" dataKey="foodDelivered" name="Delivered" stroke="#34d399" dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="sinceDisruption" name="Since disruption" stroke="#fb7185" dot={false} isAnimationActive={false} connectNulls={false} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </>
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
