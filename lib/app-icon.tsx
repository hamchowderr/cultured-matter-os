import { ImageResponse } from "next/og";

// The CM monogram used for the home-screen and install icons (app/icon.tsx, app/apple-icon.tsx).
// To use a real logo instead, replace those two files with icon.png / apple-icon.png images and
// update the icon paths in app/manifest.ts.
export const ICON_BACKGROUND = "#37352f";
export const ICON_FOREGROUND = "#ffffff";

// Full-bleed square: iOS and Android round the corners themselves. The letters sit well inside
// the central 80% so the same image also works as a maskable icon.
export function monogramIcon(size: number) {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: ICON_BACKGROUND,
        color: ICON_FOREGROUND,
        fontSize: Math.round(size * 0.36),
        fontWeight: 600,
        letterSpacing: "-0.02em"
      }}
    >
      CM
    </div>,
    { width: size, height: size }
  );
}
