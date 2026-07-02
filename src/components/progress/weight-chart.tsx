"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { Scale } from "lucide-react";

export function WeightChart({
  data,
  startWeight,
  targetWeight,
}: {
  data: { date: string; weight: number }[];
  startWeight: number | null;
  targetWeight: number | null;
}) {
  const latest = data.length > 0 ? data[data.length - 1].weight : startWeight;
  const delta =
    latest != null && startWeight != null ? Math.round((latest - startWeight) * 10) / 10 : null;

  return (
    <div className="glass p-6 fade-up" style={{ animationDelay: "0.05s" }}>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="font-semibold flex items-center gap-2">
          <Scale className="w-5 h-5 text-accent" /> Weight journey
        </h2>
        <div className="flex gap-4 text-sm">
          {latest != null && (
            <span>
              <span className="text-muted">Now:</span> <b>{latest} kg</b>
            </span>
          )}
          {delta != null && delta !== 0 && (
            <span className={delta < 0 ? "text-success" : "text-warning"}>
              {delta > 0 ? "+" : ""}
              {delta} kg
            </span>
          )}
          {targetWeight != null && (
            <span>
              <span className="text-muted">Target:</span> <b>{targetWeight} kg</b>
            </span>
          )}
        </div>
      </div>

      {data.length < 2 ? (
        <p className="text-sm text-muted py-8 text-center">
          Log your weight in the daily check-in — the chart appears after 2+ entries.
        </p>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="wfill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tick={{ fill: "#9b9ba8", fontSize: 11 }}
                tickFormatter={(d: string) => d.slice(5)}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={["dataMin - 2", "dataMax + 2"]}
                tick={{ fill: "#9b9ba8", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "#14141f",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "12px",
                  color: "#f4f4f6",
                }}
              />
              {targetWeight != null && (
                <ReferenceLine
                  y={targetWeight}
                  stroke="#34d399"
                  strokeDasharray="6 6"
                  label={{ value: "target", fill: "#34d399", fontSize: 11, position: "right" }}
                />
              )}
              <Area
                type="monotone"
                dataKey="weight"
                stroke="#8b5cf6"
                strokeWidth={2.5}
                fill="url(#wfill)"
                dot={{ fill: "#8b5cf6", r: 3 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
