"use client";

import * as React from "react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chartColor, formatTimeAxis, formatTimeFull } from "./chart-theme";

export interface SeriesDef {
  key: string;
  label: string;
  color?: string;
  // Formats a raw value for the tooltip.
  format?: (value: number) => string;
  area?: boolean;
  dashed?: boolean;
}

export interface Marker { x: number; label: string; color?: string }

export interface TimeSeriesChartProps {
  // A null value is a gap (for example NAV per share while no shares are outstanding).
  data: Array<Record<string, number | string | null> & { time: number }>;
  series: SeriesDef[];
  height?: number;
  yFormat?: (value: number) => string;
  markers?: Marker[];
  // When set, the first series is coloured by its overall direction (up blue, down red), MetaTrader style.
  directional?: boolean;
  className?: string;
  emptyLabel?: string;
}

function ChartTooltip({ active, payload, label, series }: { active?: boolean; payload?: Array<{ dataKey: string; value: number; color: string }>; label?: number; series: SeriesDef[] }) {
  if (!active || !payload?.length || typeof label !== "number") return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 text-muted-foreground">{formatTimeFull(label)}</p>
      {payload.map((p) => {
        const def = series.find((s) => s.key === p.dataKey);
        return (
          <p key={p.dataKey} className="flex items-center justify-between gap-4 tabular-nums">
            <span className="flex items-center gap-1.5"><span className="inline-block size-2 rounded-full" style={{ background: p.color }} />{def?.label ?? p.dataKey}</span>
            <span className="font-medium">{def?.format ? def.format(p.value) : String(p.value)}</span>
          </p>
        );
      })}
    </div>
  );
}

// One chart for every time series on the product: NAV per share, assets, cash, cover.
export function TimeSeriesChart({ data, series, height = 220, yFormat, markers = [], directional = false, className, emptyLabel = "No history yet" }: TimeSeriesChartProps) {
  const span = data.length > 1 ? data[data.length - 1].time - data[0].time : 0;
  const firstKey = series[0]?.key;
  const defined = data.map((d) => d[firstKey]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const first = defined[0];
  const last = defined[defined.length - 1];
  const direction = directional && typeof first === "number" && typeof last === "number" ? (last >= first ? chartColor.up : chartColor.down) : null;
  const useArea = series.some((s) => s.area);
  const Chart = useArea ? AreaChart : LineChart;
  if (data.length < 2) {
    return <div className={className} style={{ height }}><div className="grid h-full place-items-center text-xs text-muted-foreground">{emptyLabel}</div></div>;
  }
  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <Chart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <defs>
            {series.map((s, i) => {
              const color = i === 0 && direction ? direction : s.color ?? chartColor.c1;
              return (
                <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
              );
            })}
          </defs>
          <CartesianGrid strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="time" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(v: number) => formatTimeAxis(v, span)} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} minTickGap={40} />
          <YAxis tickFormatter={yFormat} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={56} domain={["auto", "auto"]} />
          <Tooltip content={<ChartTooltip series={series} />} cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }} />
          {markers.map((m) => (
            <ReferenceLine key={`${m.x}-${m.label}`} x={m.x} stroke={m.color ?? chartColor.muted} strokeDasharray="3 3" label={{ value: m.label, position: "insideTopRight", fontSize: 10, fill: m.color ?? chartColor.muted }} />
          ))}
          {series.map((s, i) => {
            const color = i === 0 && direction ? direction : s.color ?? chartColor.c1;
            const common = { dataKey: s.key, stroke: color, strokeWidth: i === 0 ? 2 : 1.5, dot: false, isAnimationActive: true, animationDuration: 500, strokeDasharray: s.dashed ? "4 3" : undefined, type: "monotone" as const };
            return useArea ? <Area key={s.key} {...common} fill={s.area ? `url(#fill-${s.key})` : "transparent"} /> : <Line key={s.key} {...common} />;
          })}
        </Chart>
      </ResponsiveContainer>
    </div>
  );
}
