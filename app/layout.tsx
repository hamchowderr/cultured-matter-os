import React from "react";
import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "next-themes";
import { fontVariables } from "@/lib/fonts";
import NextTopLoader from "nextjs-toploader";

import "./globals.css";

import { ActiveThemeProvider } from "@/components/active-theme";
import { DEFAULT_THEME, STATUS_BAR_COLORS, type ThemeType } from "@/lib/themes";
import { PwaSetup } from "@/components/pwa-setup";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

// Install-to-home-screen metadata. The manifest (app/manifest.ts) and the icons (app/icon.tsx,
// app/apple-icon.tsx) are linked by Next itself.
export const metadata: Metadata = {
  title: "Cultured Matter",
  applicationName: "Cultured Matter",
  appleWebApp: {
    capable: true,
    title: "Cultured",
    // "default" lets iOS draw an opaque status bar above the page in the theme colour below,
    // so its text stays readable in both the light and dark theme.
    statusBarStyle: "default"
  },
  formatDetection: { telephone: false }
};

// viewport-fit=cover hands the full screen to the page; the header, the content area, sheets and
// drawers pad themselves with env(safe-area-inset-*) to clear the Dynamic Island and home bar.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: STATUS_BAR_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: STATUS_BAR_COLORS.dark }
  ]
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const themeSettings: ThemeType = {
    preset: cookieStore.get("theme_preset")?.value ?? DEFAULT_THEME.preset,
    color: cookieStore.get("theme_color")?.value ?? DEFAULT_THEME.color,
    chartPreset: cookieStore.get("theme_chart_preset")?.value ?? DEFAULT_THEME.chartPreset,
    scale: cookieStore.get("theme_scale")?.value ?? DEFAULT_THEME.scale,
    radius: cookieStore.get("theme_radius")?.value ?? DEFAULT_THEME.radius,
    contentLayout: cookieStore.get("theme_content_layout")?.value ?? DEFAULT_THEME.contentLayout,
    sidebarVariant: cookieStore.get("theme_sidebar_variant")?.value ?? DEFAULT_THEME.sidebarVariant,
    sidebarCollapsible:
      cookieStore.get("theme_sidebar_collapsible")?.value ?? DEFAULT_THEME.sidebarCollapsible,
    font: cookieStore.get("theme_font")?.value ?? DEFAULT_THEME.font,
    displayFont: cookieStore.get("theme_display_font")?.value ?? DEFAULT_THEME.displayFont
  };

  const bodyAttributes = Object.fromEntries(
    Object.entries(themeSettings)
      .filter(([_, value]) => value)
      .map(([key, value]) => [`data-theme-${key.replace(/([A-Z])/g, "-$1").toLowerCase()}`, value])
  );

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={cn("bg-background group/layout font-sans", fontVariables)}
        {...bodyAttributes}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <ActiveThemeProvider initialTheme={themeSettings}>
            {/* Kit v2 tooltips no longer wrap their own provider, so one sits at the root. */}
            <TooltipProvider>
              {children}
              <Toaster
                position="top-center"
                richColors
                mobileOffset={{ top: "calc(env(safe-area-inset-top) + 16px)" }}
              />
              <PwaSetup />
              <NextTopLoader
                color="var(--primary)"
                showSpinner={false}
                height={2}
                shadow-sm="none"
              />
            </TooltipProvider>
          </ActiveThemeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
