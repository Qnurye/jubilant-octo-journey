'use client';

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { TopicAggregate } from '@/lib/teacher-api';

interface BubbleChartProps {
  data: TopicAggregate[];
  onBubbleClick: (topic: TopicAggregate) => void;
}

function confidenceToColor(confidence: number): string {
  // Interpolate from red (low confidence) to green (high confidence)
  // HSL: 0 = red, 120 = green
  const hue = Math.round(confidence * 120);
  return `hsl(${hue}, 70%, 50%)`;
}

interface BubbleDataPoint {
  x: number;
  y: number;
  z: number;
  name: string;
  confidence: number;
  original: TopicAggregate;
}

export function BubbleChart({ data, onBubbleClick }: BubbleChartProps) {
  const chartData: BubbleDataPoint[] = data.map((topic, index) => ({
    x: index + 1,
    y: topic.avgConfidence * 100,
    z: topic.queryCount,
    name: topic.conceptName,
    confidence: topic.avgConfidence,
    original: topic,
  }));

  const maxQueryCount = Math.max(...data.map((t) => t.queryCount), 1);

  return (
    <ResponsiveContainer width="100%" height={400}>
      <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
        <XAxis
          type="number"
          dataKey="x"
          name="Topic"
          tick={false}
          axisLine={false}
          tickLine={false}
          label={{
            value: '主题',
            position: 'insideBottom',
            offset: -5,
            className: 'fill-muted-foreground text-xs',
          }}
        />
        <YAxis
          type="number"
          dataKey="y"
          name="Confidence"
          unit="%"
          domain={[0, 100]}
          tick={{ fontSize: 12 }}
          label={{
            value: '置信度 %',
            angle: -90,
            position: 'insideLeft',
            className: 'fill-muted-foreground text-xs',
          }}
        />
        <ZAxis
          type="number"
          dataKey="z"
          range={[100, 1000]}
          domain={[0, maxQueryCount]}
          name="查询次数"
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const point = payload[0].payload as BubbleDataPoint;
            return (
              <div className="rounded-lg border bg-background p-3 shadow-md">
                <p className="font-semibold text-sm">{point.name}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  查询次数：{point.z}
                </p>
                <p className="text-xs text-muted-foreground">
                  置信度：{point.y.toFixed(1)}%
                </p>
              </div>
            );
          }}
        />
        <Scatter
          data={chartData}
          cursor="pointer"
          onClick={(_entry, _index, _event) => {
            // Recharts scatter onClick provides the data point via the payload
            const point = _entry as unknown as BubbleDataPoint;
            if (point?.original) {
              onBubbleClick(point.original);
            }
          }}
        >
          {chartData.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={confidenceToColor(entry.confidence)}
              fillOpacity={0.7}
              stroke={confidenceToColor(entry.confidence)}
              strokeWidth={1}
            />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}
