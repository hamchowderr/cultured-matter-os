"use client";

import { THEME_DISPLAY_FONTS } from "@/lib/themes";
import { useThemeConfig } from "@/components/active-theme";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export function DisplayFontSelector() {
  const { theme, setTheme } = useThemeConfig();

  const handleDisplayFont = (value: string) => {
    setTheme({ ...theme, displayFont: value });
  };

  return (
    <div className="flex flex-col gap-3">
      <Label>Display font:</Label>
      <Select value={theme.displayFont} onValueChange={(value) => handleDisplayFont(value)}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select a display font" />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectItem value="default">Default</SelectItem>
          {THEME_DISPLAY_FONTS.map((font) => (
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
