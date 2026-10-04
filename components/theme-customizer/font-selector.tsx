"use client";

import { THEME_FONTS } from "@/lib/themes";
import { useThemeConfig } from "@/components/active-theme";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export function FontSelector() {
  const { theme, setTheme } = useThemeConfig();

  const handleFont = (value: string) => {
    setTheme({ ...theme, font: value });
  };

  return (
    <div className="flex flex-col gap-3">
      <Label>Font:</Label>
      <Select value={theme.font} onValueChange={(value) => handleFont(value)}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select a font" />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectItem value="default">Default</SelectItem>
          {THEME_FONTS.map((font) => (
            <SelectItem
              key={font.value}
              value={font.value}
              style={{ fontFamily: `var(--font-${font.value})` }}>
              {font.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
