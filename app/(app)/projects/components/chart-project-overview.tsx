"use client";

import * as React from "react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";

import { useIsMobile } from "@/hooks/use-mobile";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ActivityPoint } from "@/lib/project-stats";

// Ported from the kit's project-management/components/chart-project-overview.tsx: tasks added
// and finished per day (days in Simone's time zone, worked out on the server).

const chartConfig = {
  created: {
    label: "Added",
    color: "var(--secondary)"
  },
  completed: {
    label: "Finished",
    color: "var(--primary)"
  }
} satisfies ChartConfig;

const RANGE_DAYS: Record<string, number> = { "90d": 90, "30d": 30, "7d": 7 };
const RANGE_LABEL: Record<string, string> = {
  "90d": "the last 3 months",
  "30d": "the last 30 days",
  "7d": "the last 7 days"
};

// "2026-10-03" → a Date at local noon, so labels never slip a day.
const fromKey = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
};

export function ChartProjectOverview({ data: chartData }: { data: ActivityPoint[] }) {
  const isMobile = useIsMobile();
  const [timeRange, setTimeRange] = React.useState("90d");

  React.useEffect(() => {
    if (isMobile) {
      setTimeRange("7d");
    }
  }, [isMobile]);

  const filteredData = chartData.slice(-RANGE_DAYS[timeRange]);
  const added = filteredData.reduce((n, p) => n + p.created, 0);
  const finished = filteredData.reduce((n, p) => n + p.completed, 0);

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Tasks overview</CardTitle>
        <CardDescription>
          {added} added and {finished} finished in {RANGE_LABEL[timeRange]}
        </CardDescription>
        <CardAction>
          <ToggleGroup
            type="single"
            value={timeRange}
            onValueChange={(value) => value && setTimeRange(value)}
            variant="outline"
            className="hidden *:data-[slot=toggle-group-item]:!px-4 @[767px]/card:flex"
          >
            <ToggleGroupItem value="90d">Last 3 months</ToggleGroupItem>
            <ToggleGroupItem value="30d">Last 30 days</ToggleGroupItem>
            <ToggleGroupItem value="7d">Last 7 days</ToggleGroupItem>
          </ToggleGroup>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger
              className="flex w-40 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate @[767px]/card:hidden"
              size="sm"
              aria-label="Time range"
            >
              <SelectValue placeholder="Last 3 months" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="90d" className="rounded-lg">
                Last 3 months
              </SelectItem>
              <SelectItem value="30d" className="rounded-lg">
                Last 30 days
              </SelectItem>
              <SelectItem value="7d" className="rounded-lg">
                Last 7 days
              </SelectItem>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer config={chartConfig} className="aspect-auto h-[200px] w-full lg:h-[250px]">
          <AreaChart data={filteredData}>
            <defs>
              <linearGradient id="fillCreated" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-created)" stopOpacity={1.0} />
                <stop offset="95%" stopColor="var(--color-created)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="fillCompleted" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-completed)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--color-completed)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value) => {
                return fromKey(value).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric"
                });
              }}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(value) => {
                    // Recharts 3 passes the label as a ReactNode; here it is the date key.
                    return fromKey(String(value)).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric"
                    });
                  }}
                  indicator="dot"
                />
              }
            />
            {/* Not stacked: added and finished are separate counts, not parts of one total. */}
            <Area
              dataKey="created"
              type="monotone"
              fill="url(#fillCreated)"
              stroke="var(--color-created)"
            />
            <Area
              dataKey="completed"
              type="monotone"
              fill="url(#fillCompleted)"
              stroke="var(--color-completed)"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
