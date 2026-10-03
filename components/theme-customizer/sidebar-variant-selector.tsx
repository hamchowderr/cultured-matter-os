"use client";

import { useThemeConfig } from "@/components/active-theme";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export function SidebarVariantSelector() {
  const { theme, setTheme } = useThemeConfig();

  const handleValueChange = (value: string) => {
    if (!value) return;
    setTheme({ ...theme, sidebarVariant: value });
  };

  return (
    <div className="hidden flex-col gap-3 lg:flex">
      <Label>Sidebar variant:</Label>
      <ToggleGroup
        className="w-full"
        type="single"
        value={theme.sidebarVariant}
        onValueChange={handleValueChange}>
        <ToggleGroupItem variant="outline" className="grow" value="inset">
          Inset
        </ToggleGroupItem>
        <ToggleGroupItem variant="outline" className="grow" value="sidebar">
          Sidebar
        </ToggleGroupItem>
        <ToggleGroupItem variant="outline" className="grow" value="floating">
          Floating
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
