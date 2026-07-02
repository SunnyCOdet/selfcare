"use client";

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine } from "recharts";

/** Trajectory of a numeric goal (e.g. monthly income) vs its target. */
export function IncomeChart({
  points,
  target,
  unit,
}: {
  points: { date: string; value: number }[];
  target: number;
  unit: string;
}) {
  if (points.length < 2) return null;

  return (
    <div className="h-40 mt-3">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
          <defs>
            <linearGradient id="goalfill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#fbbf24" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tick={{ fill: "#98989f", fontSize: 10 }}
            tickFormatter={(d: string) => d.slice(5)}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, Math.max(target, ...points.map((p) => p.value)) * 1.1]}
            tick={{ fill: "#98989f", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: "#16161c",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "12px",
              color: "#f5f5f7",
              fontSize: 12,
            }}
            formatter={(v) => [`${Number(v ?? 0).toLocaleString()} ${unit}`, "value"]}
          />
          <ReferenceLine
            y={target}
            stroke="#a3e635"
            strokeDasharray="6 6"
            label={{ value: "target", fill: "#a3e635", fontSize: 10, position: "right" }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#fbbf24"
            strokeWidth={2.5}
            fill="url(#goalfill)"
            dot={{ fill: "#fbbf24", r: 3 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
