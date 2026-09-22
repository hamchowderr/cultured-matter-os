"use client";

import { ArrowUp, ChevronsRight, ExternalLink, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

function getChartColorClass(colorKey: string): string {
  switch (colorKey) {
    case "color1":
      return "bg-amber-500 dark:bg-amber-700";
    case "color2":
      return "bg-indigo-400 dark:bg-indigo-700";
    case "color3":
      return "bg-green-500 dark:bg-green-700";
    case "color4":
      return "bg-purple-400 dark:bg-purple-700";
    case "color5":
      return "bg-pink-400 dark:bg-pink-700";
    default:
      return "bg-amber-500 dark:bg-amber-700";
  }
}

const treatments = [
  { name: "Physical Therapy", patientCount: 500, percentage: 78, colorKey: "color1" },
  { name: "Cardiac Care", patientCount: 350, percentage: 48, colorKey: "color2" },
  { name: "Diabetes Management", patientCount: 450, percentage: 84, colorKey: "color3" },
  { name: "Orthopedic Surgery", patientCount: 280, percentage: 62, colorKey: "color4" },
  { name: "Mental Health", patientCount: 320, percentage: 71, colorKey: "color5" }
];

const totalPatients = 3278;
const change = 178;
const totalFromList = treatments.reduce((sum, t) => sum + t.patientCount, 0);

const segments = treatments.map((t) => ({
  width: (t.patientCount / totalFromList) * 100,
  color: getChartColorClass(t.colorKey)
}));

export default function TopTreatment() {
  return (
    <TooltipProvider>
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            Top Treatment{" "}
            <Tooltip>
              <TooltipTrigger>
                <Info className="text-muted-foreground hover:text-foreground size-4" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Treatment distribution by patient count</p>
              </TooltipContent>
            </Tooltip>
          </CardTitle>
          <CardAction className="-me-2 -mt-2">
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              See Details
              <ChevronsRight />
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-baseline gap-2">
              <span className="font-display text-3xl">{totalPatients}</span>
              <Badge className="flex items-center gap-0.5 border-green-600 bg-transparent font-medium text-green-600">
                <ArrowUp className="size-4" />
                {change}
              </Badge>
            </div>

            <div className="flex h-2 w-full overflow-hidden rounded-full">
              {segments.map((seg, i) => (
                <div key={i} className={seg.color} style={{ width: `${seg.width}%` }} />
              ))}
            </div>
          </div>

          <div className="space-y-5">
            {treatments.map((treatment, i) => (
              <div key={treatment.name} className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 gap-3">
                  <div
                    className={`mt-1.5 size-3 shrink-0 rounded-full ${getChartColorClass(treatment.colorKey)}`}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{treatment.name}</p>
                    <p className="text-muted-foreground text-sm">
                      {treatment.patientCount} Patient
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1 text-sm">
                  <span className="font-medium">{treatment.percentage}%</span>
                  <ExternalLink className="text-muted-foreground size-3" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
