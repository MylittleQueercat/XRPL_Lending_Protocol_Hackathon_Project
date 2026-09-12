"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { chartColor } from "./chart-theme";

export interface DonutSlice { name: string; value: number; color?: string }

const PALETTE = [chartColor.c1, chartColor.c3, chartColor.c4, chartColor.c5, chartColor.c2];

// Composition of a whole: cash vs deployed, cover vs debt, positions by vault.
export function DonutChart({ slices, size = 160, centerLabel, centerValue, format }: { slices: DonutSlice[]; size?: number; centerLabel?: string; centerValue?: string; format?: (value: number) => string }) {
  const data = slices.filter((s) => s.value > 0);
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data.length ? data : [{ name: "empty", value: 1 }]} dataKey="value" nameKey="name" innerRadius={size * 0.34} outerRadius={size * 0.48} paddingAngle={data.length > 1 ? 2 : 0} stroke="none" isAnimationActive animationDuration={500}>
            {(data.length ? data : [{ name: "empty", value: 1, color: "var(--muted)" }]).map((s, i) => <Cell key={s.name} fill={s.color ?? PALETTE[i % PALETTE.length]} />)}
          </Pie>
          {data.length > 0 && <Tooltip formatter={(value, name) => [format ? format(Number(value)) : String(value), String(name)]} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)", background: "var(--popover)", color: "var(--popover-foreground)" }} />}
        </PieChart>
      </ResponsiveContainer>
      {(centerLabel || centerValue) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {centerValue && <span className="text-base font-semibold tabular-nums">{centerValue}</span>}
          {centerLabel && <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{centerLabel}</span>}
        </div>
      )}
    </div>
  );
}
