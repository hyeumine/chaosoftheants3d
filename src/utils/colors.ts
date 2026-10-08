import type { AgentState } from "../types/simulation";

export const STATE_COLORS: Record<AgentState, string> = {
  EXPLORING: "#fbbf24",
  FOOD_DISCOVERED: "#fb923c",
  RETURNING_HOME: "#22d3ee",
  DELIVERING: "#e879f9",
  FOLLOWING_TRAIL: "#a3e635",
  RECOVERING: "#f87171",
};

export const LAYER_SWATCHES: { label: string; color: string }[] = [
  { label: "Exploring", color: STATE_COLORS.EXPLORING },
  { label: "Food sensed", color: STATE_COLORS.FOOD_DISCOVERED },
  { label: "Following trail", color: STATE_COLORS.FOLLOWING_TRAIL },
  { label: "Returning", color: STATE_COLORS.RETURNING_HOME },
  { label: "Delivering", color: STATE_COLORS.DELIVERING },
  { label: "Recovering", color: STATE_COLORS.RECOVERING },
  { label: "Food pheromone", color: "#f97316" },
  { label: "Home pheromone", color: "#38bdf8" },
  { label: "Encounter", color: "#fde68a" },
  { label: "Best route", color: "#4ade80" },
  { label: "Reference route", color: "#e879f9" },
  { label: "Nest", color: "#38bdf8" },
  { label: "Food", color: "#4ade80" },
];
