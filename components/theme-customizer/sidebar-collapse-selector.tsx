"use client";

import { useThemeConfig } from "@/components/active-theme";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useSidebar } from "@/components/ui/sidebar";

export function SidebarCollapseSelector() {
  const { state, setOpen } = useSidebar();
  const { theme, setTheme } = useThemeConfig();

  const handleValueChange = (value: string) => {
    if (!value) return;
    if (value === "expanded") {
      setOpen(true);
      return;
    }
    setTheme({ ...theme, sidebarCollapsible: value });
    setOpen(false);
  };

  return (
    <div className="hidden flex-col gap-3 lg:flex">
      <Label>Sidebar collapse:</Label>
      <ToggleGroup
        className="w-full"
        type="single"
        value={state === "collapsed" ? theme.sidebarCollapsible : "expanded"}
        onValueChange={handleValueChange}>
        <ToggleGroupItem variant="outline" className="grow" value="expanded">
          Expanded
        </ToggleGroupItem>
        <ToggleGroupItem variant="outline" className="grow" value="icon">
          Icon
        </ToggleGroupItem>
        <ToggleGroupItem variant="outline" className="grow" value="offcanvas">
          Offcanvas
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
