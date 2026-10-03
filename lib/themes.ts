export const DEFAULT_THEME = {
  preset: "default",
  color: "default",
  chartPreset: "default",
  radius: "default",
  scale: "none",
  contentLayout: "full",
  sidebarVariant: "inset",
  sidebarCollapsible: "icon",
  font: "default",
  displayFont: "default"
} as const;

export const SIDEBAR_VARIANTS = ["inset", "sidebar", "floating"] as const;

export type SidebarVariant = (typeof SIDEBAR_VARIANTS)[number];

export type SidebarCollapsible = "icon" | "offcanvas";

// Values map to the [data-theme-font] blocks in themes.css and the
// --font-* variables loaded in lib/fonts.ts.
export const THEME_FONTS = [
  { name: "Inter", value: "inter" },
  { name: "Roboto", value: "roboto" },
  { name: "Poppins", value: "poppins" },
  { name: "Montserrat", value: "montserrat" },
  { name: "PT Sans", value: "pt-sans" },
  { name: "Overpass Mono", value: "overpass-mono" }
];

// Values map to the [data-theme-display-font] blocks in themes.css.
// Applied to headings and stats via the .font-display utility.
export const THEME_DISPLAY_FONTS = [
  { name: "Geist", value: "geist" },
  { name: "Montserrat", value: "montserrat" },
  { name: "Poppins", value: "poppins" },
  { name: "Plus Jakarta Sans", value: "plus-jakarta-sans" },
  { name: "Outfit", value: "outfit" },
  { name: "Kumbh Sans", value: "kumbh-sans" },
  { name: "Hedvig Letters Serif", value: "hedvig-letters-serif" }
];

export type ThemeType = {
  [K in keyof typeof DEFAULT_THEME]: string;
};

// Predefined colors based on the standard Tailwind palette.
// The 600 shade is used as the accent color.
export const THEME_COLORS = [
  { name: "Red", value: "red" },
  { name: "Orange", value: "orange" },
  { name: "Amber", value: "amber" },
  { name: "Yellow", value: "yellow" },
  { name: "Lime", value: "lime" },
  { name: "Green", value: "green" },
  { name: "Emerald", value: "emerald" },
  { name: "Teal", value: "teal" },
  { name: "Cyan", value: "cyan" },
  { name: "Sky", value: "sky" },
  { name: "Blue", value: "blue" },
  { name: "Indigo", value: "indigo" },
  { name: "Violet", value: "violet" },
  { name: "Purple", value: "purple" },
  { name: "Fuchsia", value: "fuchsia" },
  { name: "Pink", value: "pink" },
  { name: "Rose", value: "rose" }
];

// Shades used to build the 5 chart colors from the selected color.
// Example: indigo -> indigo-600, indigo-500, indigo-400, indigo-300, indigo-200
export const CHART_COLOR_SHADES = [600, 500, 400, 300, 200];

export const THEMES = [
  {
    name: "Default",
    value: "default",
    colors: ["oklch(0.33 0 0)"]
  },
  {
    name: "Underground",
    value: "underground",
    colors: ["oklch(0.5315 0.0694 156.19)"]
  },
  {
    name: "Rose Garden",
    value: "rose-garden",
    colors: ["oklch(0.5827 0.2418 12.23)"]
  },
  {
    name: "Lake View",
    value: "lake-view",
    colors: ["oklch(0.765 0.177 163.22)"]
  },
  {
    name: "Sunset Glow",
    value: "sunset-glow",
    colors: ["oklch(0.5827 0.2187 36.98)"]
  },
  {
    name: "Forest Whisper",
    value: "forest-whisper",
    colors: ["oklch(0.5276 0.1072 182.22)"]
  },
  {
    name: "Ocean Breeze",
    value: "ocean-breeze",
    colors: ["oklch(0.59 0.20 277.12)"]
  },
  {
    name: "Lavender Dream",
    value: "lavender-dream",
    colors: ["oklch(0.71 0.16 293.54)"]
  }
];
