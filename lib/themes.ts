export const DEFAULT_THEME = {
  preset: "default",
  radius: "default",
  scale: "none",
  contentLayout: "full"
} as const;

export type ThemeType = typeof DEFAULT_THEME;
