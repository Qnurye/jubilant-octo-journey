'use client';

import { Button } from '@/components/ui/button';
import type { TimeRange } from '@/lib/teacher-api';

const presets: Array<{ label: string; value: '7d' | '30d' | '90d' }> = [
  { label: '7天', value: '7d' },
  { label: '30天', value: '30d' },
  { label: '90天', value: '90d' },
];

interface TimeRangeFilterProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
}

export function TimeRangeFilter({ value, onChange }: TimeRangeFilterProps) {
  return (
    <div className="flex items-center gap-1">
      {presets.map((preset) => (
        <Button
          key={preset.value}
          variant={value.preset === preset.value ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => onChange({ preset: preset.value })}
        >
          {preset.label}
        </Button>
      ))}
    </div>
  );
}
