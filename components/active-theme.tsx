"use client";

import { ReactNode, createContext, useContext, useEffect, useState } from "react";
import { DEFAULT_THEME, ThemeType } from "@/lib/themes";

function setThemeCookie(key: string, value: string | null) {
  if (typeof window === "undefined") return;

  if (!value) {
    document.cookie = `${key}=; path=/; max-age=0; SameSite=Lax; ${window.location.protocol === "https:" ? "Secure;" : ""}`;
  } else {
    document.cookie = `${key}=${value}; path=/; max-age=31536000; SameSite=Lax; ${window.location.protocol === "https:" ? "Secure;" : ""}`;
  }
}

type ThemeContextType = {
  theme: ThemeType;
  setTheme: (theme: ThemeType) => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ActiveThemeProvider({
  children,
  initialTheme
}: {
  children: ReactNode;
  initialTheme?: ThemeType;
}) {
  const [theme, setTheme] = useState<ThemeType>(() =>
    initialTheme ? initialTheme : DEFAULT_THEME
  );

  useEffect(() => {
    const body = document.body;

    if (theme.radius != "default") {
      setThemeCookie("theme_radius", theme.radius);
      body.setAttribute("data-theme-radius", theme.radius);
    } else {
      setThemeCookie("theme_radius", null);
      body.removeAttribute("data-theme-radius");
    }

    if (theme.preset != "default") {
      setThemeCookie("theme_preset", theme.preset);
      body.setAttribute("data-theme-preset", theme.preset);
    } else {
      setThemeCookie("theme_preset", null);
      body.removeAttribute("data-theme-preset");
    }

    if (theme.color != "default") {
      setThemeCookie("theme_color", theme.color);
      body.setAttribute("data-theme-color", theme.color);
    } else {
      setThemeCookie("theme_color", null);
      body.removeAttribute("data-theme-color");
    }

    if (theme.font != "default") {
      setThemeCookie("theme_font", theme.font);
      body.setAttribute("data-theme-font", theme.font);
    } else {
      setThemeCookie("theme_font", null);
      body.removeAttribute("data-theme-font");
    }

    if (theme.displayFont != "default") {
      setThemeCookie("theme_display_font", theme.displayFont);
      body.setAttribute("data-theme-display-font", theme.displayFont);
    } else {
      setThemeCookie("theme_display_font", null);
      body.removeAttribute("data-theme-display-font");
    }

    if (theme.sidebarCollapsible != "icon") {
      setThemeCookie("theme_sidebar_collapsible", theme.sidebarCollapsible);
      body.setAttribute("data-theme-sidebar-collapsible", theme.sidebarCollapsible);
    } else {
      setThemeCookie("theme_sidebar_collapsible", null);
      body.removeAttribute("data-theme-sidebar-collapsible");
    }

    if (theme.sidebarVariant != "inset") {
      setThemeCookie("theme_sidebar_variant", theme.sidebarVariant);
      body.setAttribute("data-theme-sidebar-variant", theme.sidebarVariant);
    } else {
      setThemeCookie("theme_sidebar_variant", null);
      body.removeAttribute("data-theme-sidebar-variant");
    }

    if (theme.chartPreset != "default") {
      setThemeCookie("theme_chart_preset", theme.chartPreset);
      body.setAttribute("data-theme-chart-preset", theme.chartPreset);
    } else {
      setThemeCookie("theme_chart_preset", null);
      body.removeAttribute("data-theme-chart-preset");
    }

    setThemeCookie("theme_content_layout", theme.contentLayout);
    body.setAttribute("data-theme-content-layout", theme.contentLayout);

    if (theme.scale != "none") {
      setThemeCookie("theme_scale", theme.scale);
      body.setAttribute("data-theme-scale", theme.scale);
    } else {
      setThemeCookie("theme_scale", null);
      body.removeAttribute("data-theme-scale");
    }
  }, [
    theme.preset,
    theme.color,
    theme.chartPreset,
    theme.radius,
    theme.scale,
    theme.contentLayout,
    theme.sidebarVariant,
    theme.sidebarCollapsible,
    theme.font,
    theme.displayFont
  ]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useThemeConfig() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useThemeConfig must be used within an ActiveThemeProvider");
  }
  return context;
}
