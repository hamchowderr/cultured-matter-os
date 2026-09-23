"use client";

import { useEffect } from "react";

import { RADAR_BASELINE_COOKIE, RADAR_LAST_SEEN_COOKIE, RADAR_SESSION_GAP_MS } from "./constants";

const YEAR = 60 * 60 * 24 * 365;

function readCookie(name: string) {
  return document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${name}=`))
    ?.split("=")[1];
}

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=${YEAR}; SameSite=Lax`;
}

// Records this Radar visit so the next one can show what arrived in between.
export function VisitMarker() {
  useEffect(() => {
    const now = Date.now();
    const lastSeen = Number(readCookie(RADAR_LAST_SEEN_COOKIE) ?? 0);
    if (!lastSeen || now - lastSeen > RADAR_SESSION_GAP_MS) {
      writeCookie(RADAR_BASELINE_COOKIE, String(lastSeen || now));
    }
    writeCookie(RADAR_LAST_SEEN_COOKIE, String(now));
  }, []);
  return null;
}
