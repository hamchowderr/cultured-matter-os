"use client";

import { CompassIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import * as React from "react";

import { markTourSeen } from "@/actions/server";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { TourProvider, useTour, type Tour } from "@/components/ui/tour";
import {
  addSeen,
  getTour,
  resolveSteps,
  shouldAutoStartWelcome,
  tourForPath,
  type TourDef,
  type TourId
} from "@/lib/tours";

type AppToursValue = {
  // Start a tour. delayMs lets a menu finish closing before the page is measured.
  startTour: (id: TourId, delayMs?: number) => void;
  // The tour for the screen she is on, if it has one.
  pageTour: TourDef | undefined;
  seen: TourId[];
};

const AppToursContext = React.createContext<AppToursValue | null>(null);

export function useAppTours() {
  const value = React.useContext(AppToursContext);
  if (!value) throw new Error("useAppTours must be used within AppTours");
  return value;
}

// On the page and taking up space at the current width. Matches elements the same way the
// registry tour does ([data-tour-step-id*=...]), so a step is kept only if the tour can show it.
function isTargetVisible(target: string) {
  return Array.from(document.querySelectorAll(`[data-tour-step-id*='${target}']`)).some((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    return getComputedStyle(el).visibility !== "hidden";
  });
}

// How long the phone menu takes to slide away before the page underneath can be measured.
const SHEET_CLOSE_MS = 350;
// The welcome tour waits for the first screen to settle.
const WELCOME_DELAY_MS = 800;

export function AppTours({
  initialSeen,
  children
}: {
  initialSeen: TourId[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { isMobile, openMobile, setOpenMobile } = useSidebar();
  const [seen, setSeen] = React.useState(initialSeen);
  const [tours, setTours] = React.useState<Tour[]>([]);
  const [pending, setPending] = React.useState<TourId | null>(null);
  const welcomeStarted = React.useRef(false);

  const startTour = React.useCallback(
    (id: TourId, delayMs = 0) => {
      const tour = getTour(id);
      if (!tour) return;
      let wait = delayMs;
      // The phone menu covers the page; close it first.
      if (isMobile && openMobile) {
        setOpenMobile(false);
        wait = Math.max(wait, SHEET_CLOSE_MS);
      }
      window.setTimeout(() => {
        const steps = resolveSteps(tour, isTargetVisible);
        if (steps.length === 0) return;
        setTours([{ id, steps }]);
        setPending(id);
      }, wait);
    },
    [isMobile, openMobile, setOpenMobile]
  );

  // The welcome tour starts once, the first time she signs in, and stops for good when she
  // finishes or skips it.
  React.useEffect(() => {
    if (welcomeStarted.current || !shouldAutoStartWelcome(seen)) return;
    const t = window.setTimeout(() => {
      welcomeStarted.current = true;
      startTour("welcome");
    }, WELCOME_DELAY_MS);
    return () => window.clearTimeout(t);
  }, []);

  function onComplete(tourId: string, finished: boolean) {
    const id = tourId as TourId;
    if (seen.includes(id)) return;
    setSeen((s) => addSeen(s, id));
    void markTourSeen({ tourId: id, finished }).then((result) => {
      if (!result.ok) console.error("Couldn't save the tour:", result.error.message);
    });
  }

  const value = React.useMemo<AppToursValue>(
    () => ({ startTour, pageTour: tourForPath(pathname), seen }),
    [startTour, pathname, seen]
  );

  return (
    <AppToursContext.Provider value={value}>
      <TourProvider tours={tours} onComplete={onComplete}>
        <PendingStart id={pending} onStarted={() => setPending(null)} />
        {children}
      </TourProvider>
    </AppToursContext.Provider>
  );
}

// Starts a tour once its steps have reached the TourProvider.
function PendingStart({ id, onStarted }: { id: TourId | null; onStarted: () => void }) {
  const { start } = useTour();
  React.useEffect(() => {
    if (!id) return;
    start(id);
    onStarted();
  }, [id]);
  return null;
}

// "Take a tour" in the header: the tour of the screen she is on. A dot marks a tour she
// hasn't taken yet.
export function TourButton() {
  const { pageTour, startTour, seen } = useAppTours();
  if (!pageTour) return null;
  const fresh = !seen.includes(pageTour.id);
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => startTour(pageTour.id)}
      aria-label={`Take a tour of ${pageTour.label}`}
      data-tour-step-id="tour-start"
    >
      {/* The dot sits on the compass icon, so it never covers the label. */}
      <span className="relative inline-flex">
        <CompassIcon />
        {fresh && (
          <span
            className="bg-primary ring-background absolute -top-0.5 -right-0.5 size-2 rounded-full ring-2"
            aria-hidden
          />
        )}
      </span>
      <span className="hidden min-[400px]:inline">Take a tour</span>
    </Button>
  );
}
