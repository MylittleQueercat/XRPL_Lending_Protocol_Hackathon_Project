// Chart colours come from CSS variables so light and dark stay consistent with the rest of the UI.
export const chartColor = {
  up: "var(--up)",
  down: "var(--down)",
  c1: "var(--chart-1)",
  c2: "var(--chart-2)",
  c3: "var(--chart-3)",
  c4: "var(--chart-4)",
  c5: "var(--chart-5)",
  grid: "var(--chart-grid)",
  muted: "var(--muted-foreground)",
  fg: "var(--foreground)",
} as const;

export const XRP_PER_DROP = 1e-6;

export function dropsToXrpNumber(drops: string | number | bigint): number {
  return Number(drops) * XRP_PER_DROP;
}

export function formatXrpAxis(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toFixed(abs < 10 ? 2 : 0);
}

export function formatTimeAxis(ms: number, spanMs: number): string {
  const d = new Date(ms);
  if (spanMs > 2 * 86_400_000) return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function formatTimeFull(ms: number): string {
  return new Date(ms).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
