"use client";

import type { Content } from "@radix-ui/react-popover";
import { XIcon } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { cardPosition } from "@/lib/tour-position";

const TourContext = React.createContext<{
  start: (tourId: string) => void;
  close: () => void;
} | null>(null);

function useTour() {
  const context = React.useContext(TourContext);
  if (!context) {
    throw new Error("useTour must be used within a TourProvider");
  }
  return context;
}

interface Step {
  id: string;
  title: React.ReactNode;
  content: React.ReactNode;
  nextRoute?: string;
  previousRoute?: string;
  nextLabel?: React.ReactNode;
  previousLabel?: React.ReactNode;
  side?: React.ComponentProps<typeof Content>["side"];
  sideOffset?: React.ComponentProps<typeof Content>["sideOffset"];
  align?: React.ComponentProps<typeof Content>["align"];
  alignOffset?: React.ComponentProps<typeof Content>["alignOffset"];
  className?: string;
}

interface Tour {
  id: string;
  steps: Step[];
}

function TourProvider({
  tours,
  onComplete,
  children
}: {
  tours: Tour[];
  // Called when a tour ends: finished on its last step, or closed early with the X.
  onComplete?: (tourId: string, finished: boolean) => void;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [activeTourId, setActiveTourId] = React.useState<string | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = React.useState(0);

  const activeTour = tours.find((tour) => tour.id === activeTourId);
  const steps = activeTour?.steps || [];

  function next() {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    } else {
      setIsOpen(false);
      setCurrentStepIndex(0);
      setActiveTourId(null);
      if (activeTourId) onComplete?.(activeTourId, true);
    }
  }

  function previous() {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  }

  function close() {
    setIsOpen(false);
    setCurrentStepIndex(0);
    setActiveTourId(null);
    if (activeTourId) onComplete?.(activeTourId, false);
  }

  function start(tourId: string) {
    const tour = tours.find((tour) => tour.id === tourId);
    if (tour) {
      if (tour.steps.length > 0) {
        setActiveTourId(tourId);
        setIsOpen(true);
        setCurrentStepIndex(0);
      } else {
        console.error(`Tour with id '${tourId}' has no steps.`);
      }
    } else {
      console.error(`Tour with id '${tourId}' not found.`);
    }
  }

  return (
    <TourContext.Provider
      value={{
        start,
        close
      }}
    >
      {children}
      {isOpen && activeTour && steps.length > 0 && (
        <TourOverlay
          step={steps[currentStepIndex]}
          currentStepIndex={currentStepIndex}
          totalSteps={steps.length}
          onNext={next}
          onPrevious={previous}
          onClose={close}
        />
      )}
    </TourContext.Provider>
  );
}

function TourOverlay({
  step,
  currentStepIndex,
  totalSteps,
  onNext,
  onPrevious,
  onClose
}: {
  step: Step;
  currentStepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onPrevious: () => void;
  onClose: () => void;
}) {
  const [targets, setTargets] = React.useState<{ rect: DOMRect; radius: number }[]>([]);

  React.useEffect(() => {
    let needsScroll = true;

    function updatePosition() {
      const elements = document.querySelectorAll(`[data-tour-step-id*='${step.id}']`);

      if (elements.length > 0) {
        const validElements: {
          rect: {
            width: number;
            height: number;
            x: number;
            y: number;
            left: number;
            top: number;
            right: number;
            bottom: number;
            toJSON: () => void;
          };
          radius: number;
          element: Element;
        }[] = [];

        Array.from(elements).forEach((element) => {
          const rect = element.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) return;

          const style = window.getComputedStyle(element);
          const radius = Number(style.borderRadius) || 4;

          validElements.push({
            rect: {
              width: rect.width,
              height: rect.height,
              x: rect.left,
              y: rect.top,
              left: rect.left,
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom,
              toJSON: () => {}
            },
            radius,
            element
          });
        });

        setTargets(validElements.map(({ rect, radius }) => ({ rect, radius })));

        if (validElements.length > 0 && needsScroll) {
          // A tall element scrolls to its top so its start is in view; others to the middle.
          const tall = validElements[0].rect.height > window.innerHeight * 0.6;
          validElements[0].element.scrollIntoView({
            behavior: "smooth",
            block: tall ? "start" : "center"
          });
          needsScroll = false;
        }
      } else {
        setTargets([]);
      }
    }

    updatePosition();
    const handleResizeOrScroll = () => updatePosition();

    window.addEventListener("resize", handleResizeOrScroll);
    window.addEventListener("scroll", handleResizeOrScroll, true);

    const observer = new MutationObserver(() => updatePosition());
    observer.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true
    });

    const resizeObserver = new ResizeObserver(() => updatePosition());
    resizeObserver.observe(document.body);

    return () => {
      window.removeEventListener("resize", handleResizeOrScroll);
      window.removeEventListener("scroll", handleResizeOrScroll, true);
      observer.disconnect();
      resizeObserver.disconnect();
    };
  }, [step]);

  // Measure the card, then place it next to its element without leaving the screen.
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [position, setPosition] = React.useState<{ top: number; left: number } | null>(null);
  React.useLayoutEffect(() => {
    setPosition(null);
  }, [step.id]);
  React.useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card || targets.length === 0) return;
    const { rect } = targets[0];
    const next = cardPosition(
      { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      { width: card.offsetWidth, height: card.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
      step.side
    );
    setPosition((prev) => (prev && prev.top === next.top && prev.left === next.left ? prev : next));
  }, [targets, step.side, step.id]);

  React.useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  if (!document) return null;
  if (targets.length === 0) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <svg className="absolute inset-0 size-full">
        <defs>
          <mask id="tour-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {targets.map((target, i) => (
              <rect
                key={i}
                x={target.rect.left}
                y={target.rect.top}
                width={target.rect.width}
                height={target.rect.height}
                rx={target.radius}
                fill="black"
              />
            ))}
          </mask>
        </defs>
        <rect width="100%" height="100%" mask="url(#tour-mask)" className="fill-black opacity-20" />
        {targets.map((target, i) => {
          return (
            <rect
              key={i}
              x={target.rect.left}
              y={target.rect.top}
              width={target.rect.width}
              height={target.rect.height}
              rx={target.radius}
              className="stroke-primary fill-none stroke-2"
            />
          );
        })}
      </svg>
      {targets.length > 0 && (
        // Positioned by cardPosition instead of a Radix popover, so the card stays fully on
        // screen when the element is taller than the space around it (see lib/tour-position.ts).
        <div
          key={step.id}
          ref={cardRef}
          data-slot="tour-card"
          className={cn(
            "absolute w-72 max-w-[calc(100vw-24px)] transition-opacity duration-150",
            !position && "opacity-0"
          )}
          style={position ?? { top: 0, left: 0 }}
        >
          <Card className={cn("shadow-lg", step.className)}>
            <CardHeader>
              <CardTitle>{step.title}</CardTitle>
              <CardDescription>
                Step {currentStepIndex + 1} of {totalSteps}
              </CardDescription>
              <CardAction>
                <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close the tour">
                  <XIcon />
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>{step.content}</CardContent>
            <CardFooter className="justify-between">
              {currentStepIndex > 0 &&
                (step.previousRoute ? (
                  <Button variant="outline" onClick={onPrevious} asChild>
                    <Link href={step.previousRoute}>{step.previousLabel ?? "Previous"}</Link>
                  </Button>
                ) : (
                  <Button variant="outline" onClick={onPrevious}>
                    {step.previousLabel ?? "Previous"}
                  </Button>
                ))}
              {step.nextRoute ? (
                <Button className="ml-auto" onClick={onNext} asChild>
                  <Link href={step.nextRoute}>
                    {step.nextLabel ?? (currentStepIndex === totalSteps - 1 ? "Finish" : "Next")}
                  </Link>
                </Button>
              ) : (
                <Button className="ml-auto" onClick={onNext}>
                  {step.nextLabel ?? (currentStepIndex === totalSteps - 1 ? "Finish" : "Next")}
                </Button>
              )}
            </CardFooter>
          </Card>
        </div>
      )}
    </div>,
    document.body
  );
}

export { TourProvider, useTour, type Step, type Tour };
