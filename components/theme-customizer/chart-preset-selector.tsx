"use client";

import { CHART_COLOR_SHADES, THEME_COLORS } from "@/lib/themes";
import { useThemeConfig } from "@/components/active-theme";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export function ChartPresetSelector() {
  const { theme, setTheme } = useThemeConfig();

  const handleChartPreset = (value: string) => {
    setTheme({ ...theme, chartPreset: value });
  };

  return (
    <div className="flex flex-col gap-3">
      <Label>Chart colors:</Label>
      <Select value={theme.chartPreset} onValueChange={(value) => handleChartPreset(value)}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select chart colors" />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectItem value="default">
            <div className="flex shrink-0 gap-1">
              {["0.87", "0.556", "0.439", "0.371", "0.269"].map((l) => (
                <span
                  key={l}
                  className="size-2 rounded-full"
                  style={{ backgroundColor: `oklch(${l} 0 0)` }}></span>
              ))}
            </div>
            Default
          </SelectItem>
          {THEME_COLORS.map((color) => (
            <SelectItem key={color.value} value={color.value}>
              <div className="flex shrink-0 gap-1">
                {CHART_COLOR_SHADES.map((shade) => (
                  <span
                    key={shade}
                    className="size-2 rounded-full"
                    style={{ backgroundColor: `var(--color-${color.value}-${shade})` }}></span>
                ))}
              </div>
              {color.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
