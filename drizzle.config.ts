import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "turso",
  schema: "./db/schema.ts",
  out: "./db/migrations",
  // The chat's threads and messages live in mastra_* tables that Mastra creates and migrates
  // itself (lib/chat/agent.ts); drizzle-kit leaves them alone.
  tablesFilter: ["!mastra_*"],
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL ?? "file:local.db",
    authToken: process.env.TURSO_AUTH_TOKEN
  }
});
