"use client";

import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import { chartColor } from "./chart-theme";

// Inline trend, coloured by direction like a MetaTrader quote: blue when the last value is above the first.
export function Sparkline({ values, width = 96, height = 28, className }: { values: number[]; width?: number | string; height?: number; className?: string }) {
  if (values.length < 2) return <span className={className} style={{ display: "inline-block", width, height }} aria-hidden />;
  const data = values.map((v, i) => ({ i, v }));
  const color = values[values.length - 1] >= values[0] ? chartColor.up : chartColor.down;
  return (
    <span className={className} style={{ display: "inline-block", width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Line dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} type="monotone" />
        </LineChart>
      </ResponsiveContainer>
    </span>
  );
}
