import { db } from "@/db";
import { runGrantIngestion } from "./run";

export { GRANT_SOURCES, runGrantIngestion, type GrantSourceResult } from "./run";

export function ingestGrants() {
  return runGrantIngestion({ db });
}
