'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';
import type { TrendDataPoint } from '@/lib/teacher-api';

interface TrendChartProps {
  data: TrendDataPoint[];
  comparisonData?: TrendDataPoint[];
}

function formatDateLabel(bucket: string): string {
  try {
    const date = new Date(bucket);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return bucket;
  }
}

export function TrendChart({ data, comparisonData }: TrendChartProps) {
  const chartData = data.map((point, index) => ({
    date: formatDateLabel(point.bucket),
    queryCount: point.queryCount,
    avgConfidence: Math.round(point.avgConfidence * 100),
    ...(comparisonData?.[index]
      ? { comparisonCount: comparisonData[index].queryCount }
      : {}),
  }));

  return (
    <ResponsiveContainer width="100%" height={350}>
      <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorQueries" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="colorComparison" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0.2} />
            <stop offset="95%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            return (
              <div className="rounded-lg border bg-background p-3 shadow-md">
                <p className="text-sm font-semibold mb-1">{label}</p>
                {payload.map((entry, i) => (
                  <p
                    key={`${String(entry.dataKey)}-${i}`}
                    className="text-xs text-muted-foreground"
                  >
                    {entry.dataKey === 'queryCount'
                      ? 'Queries'
                      : entry.dataKey === 'comparisonCount'
                        ? 'Comparison'
                        : String(entry.dataKey)}
                    : {entry.value}
                  </p>
                ))}
              </div>
            );
          }}
        />
        <Area
          type="monotone"
          dataKey="queryCount"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          fill="url(#colorQueries)"
        />
        {comparisonData && (
          <Area
            type="monotone"
            dataKey="comparisonCount"
            stroke="hsl(var(--muted-foreground))"
            strokeWidth={2}
            strokeDasharray="5 5"
            fill="url(#colorComparison)"
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}
