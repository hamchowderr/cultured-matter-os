import { db } from "@/db";
import { runRadarIngestion } from "./run";

export { RADAR_SOURCES, runRadarIngestion, type SourceResult } from "./run";

// Runs every radar source against the app database.
export function ingestRadar() {
  return runRadarIngestion({ db });
}
