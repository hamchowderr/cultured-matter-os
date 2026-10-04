import type { MetadataRoute } from "next";

// Served at /manifest.webmanifest; Next adds the <link rel="manifest"> tag itself.
// Colours are the calm palette's paper (globals.css :root) so the splash matches the light theme.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/today",
    name: "Cultured Matter",
    // Home-screen label; the full name is cut off under an iPhone icon.
    short_name: "Cultured",
    description: "Cultured Matter's workspace: today, inbox, projects, people, grants and radar.",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png", purpose: "any" }
    ]
  };
}
