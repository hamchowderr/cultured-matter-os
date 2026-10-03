"use client";

import Link from "next/link";
import { Bar, BarChart, LabelList } from "recharts";

import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from "@/components/ui/chart";

// The kit's default-dashboard Subscriptions card, fed with real Radar finds per week.
const chartConfig = {
  finds: {
    label: "New finds",
    color: "var(--primary)"
  }
} satisfies ChartConfig;

type Week = { start: Date; count: number };

export function RadarFindsCard({ weeks, timeZone }: { weeks: Week[]; timeZone: string }) {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" });
  const chartData = weeks.map((w) => ({ week: `Week of ${fmt.format(w.start)}`, finds: w.count }));
  const total = weeks.reduce((s, w) => s + w.count, 0);
  const thisWeek = weeks.at(-1)?.count ?? 0;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Radar finds per week</CardTitle>
        <CardAction>
          <Link href="/radar" className="text-muted-foreground text-sm hover:underline">
            Open Radar
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="font-display text-3xl leading-6 tabular-nums">{total}</div>
        <p className="text-muted-foreground mt-1.5 text-xs">
          new companies in the last {weeks.length} weeks ·{" "}
          <span className="text-foreground">{thisWeek}</span> this week
        </p>
        <ChartContainer className="mt-6 h-[120px] w-full" config={chartConfig}>
          <BarChart margin={{ top: 22, right: 0, left: 0 }} accessibilityLayer data={chartData}>
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent labelFormatter={(_, payload) => payload[0]?.payload.week} />
              }
            />
            <Bar dataKey="finds" fill="var(--color-finds)" radius={5}>
              <LabelList position="top" offset={12} className="fill-foreground" fontSize={12} />
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
