import type { Metadata } from "next";

// Shown by the service worker (public/sw.js) when a page is opened with no connection.
// It is stored at install, so it uses inline styles with the palette's fallbacks in case the
// stylesheet is not in the cache yet.
export const metadata: Metadata = {
  title: "Offline · Cultured Matter",
  robots: { index: false, follow: false }
};

export default function OfflinePage() {
  return (
    <main
      style={{
        minHeight: "100svh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding:
          "calc(env(safe-area-inset-top) + 3rem) 1rem calc(env(safe-area-inset-bottom) + 3rem)",
        background: "var(--background, #ffffff)",
        color: "var(--foreground, #37352f)",
        fontFamily: "var(--text-family, system-ui, sans-serif)"
      }}
    >
      <div style={{ maxWidth: "24rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: "0 0 0.5rem" }}>
          You&apos;re offline
        </h1>
        <p style={{ color: "var(--muted-foreground, #787774)", margin: "0 0 1.5rem" }}>
          Cultured Matter needs a connection to show your work. Reconnect and try again.
        </p>
        <a
          href="/today"
          style={{
            display: "inline-block",
            padding: "0.5rem 1rem",
            borderRadius: "0.375rem",
            background: "var(--primary, #2383e2)",
            color: "var(--primary-foreground, #ffffff)",
            textDecoration: "none",
            fontWeight: 500
          }}
        >
          Try again
        </a>
      </div>
    </main>
  );
}
