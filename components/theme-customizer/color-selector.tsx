"use client";

import { THEME_COLORS } from "@/lib/themes";
import { useThemeConfig } from "@/components/active-theme";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export function ThemeColorSelector() {
  const { theme, setTheme } = useThemeConfig();

  const handleColor = (value: string) => {
    setTheme({ ...theme, color: value });
  };

  return (
    <div className="flex flex-col gap-3">
      <Label>Theme color:</Label>
      <Select value={theme.color} onValueChange={(value) => handleColor(value)}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select a color" />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectItem value="default">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: "var(--accent-blue)" }}></span>
            Default
          </SelectItem>
          {THEME_COLORS.map((color) => (
            <SelectItem key={color.value} value={color.value}>
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: `var(--color-${color.value}-600)` }}></span>
              {color.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
