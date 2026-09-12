"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chartColor } from "./chart-theme";

export interface BarSeries { key: string; label: string; color?: string; stack?: string }

// Stacked or grouped bars: a loan's payment schedule (principal vs interest per period), debt by broker.
export function BarsChart({ data, series, xKey, height = 200, yFormat, format, className }: { data: Array<Record<string, number | string>>; series: BarSeries[]; xKey: string; height?: number; yFormat?: (v: number) => string; format?: (v: number) => string; className?: string }) {
  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="25%">
          <CartesianGrid strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={yFormat} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={56} />
          <Tooltip formatter={(value, name) => [format ? format(Number(value)) : String(value), series.find((s) => s.key === String(name))?.label ?? String(name)]} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)", background: "var(--popover)", color: "var(--popover-foreground)" }} cursor={{ fill: "var(--accent)", opacity: 0.4 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} formatter={(value) => series.find((s) => s.key === String(value))?.label ?? String(value)} />
          {series.map((s, i) => <Bar key={s.key} dataKey={s.key} stackId={s.stack} fill={s.color ?? [chartColor.c1, chartColor.c4, chartColor.c3, chartColor.c5][i % 4]} radius={[3, 3, 0, 0]} isAnimationActive animationDuration={500} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
