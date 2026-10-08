import type { ExperimentResult } from "../types/simulation";

const COLUMNS: (keyof ExperimentResult)[] = [
  "experimentId",
  "algorithm",
  "seed",
  "population",
  "mazeType",
  "discoveryTime",
  "firstDeliveryTime",
  "foodDelivered",
  "averagePathLength",
  "bestPathLength",
  "optimalPathLength",
  "routeEfficiency",
  "knowledgeExchanges",
  "exploredVolume",
  "disruptionRecoveryTime",
  "routeDisconnected",
];

function csvCell(value: string | number | boolean | null): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function resultsToCsv(results: ExperimentResult[]): string {
  const lines = [COLUMNS.join(",")];
  for (const row of results) {
    lines.push(COLUMNS.map((key) => csvCell(row[key] as string | number | boolean | null)).join(","));
  }
  return lines.join("\n");
}

export function resultsToJson(results: ExperimentResult[]): string {
  return JSON.stringify(results, null, 2);
}

export function downloadText(filename: string, contents: string, mime: string): void {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
