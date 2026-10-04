// Guided tours: one per screen plus a short welcome tour that starts once. Each step names the
// elements it can point at (their data-tour-step-id), best first. The first one that is visible
// at the current width wins, so on a phone the "your pages" step points at the menu button
// instead of the sidebar. A step with nothing visible is left out.

export const PAGE_TOUR_IDS = [
  "today",
  "inbox",
  "projects",
  "people",
  "radar",
  "grants",
  "archive"
] as const;
export type PageTourId = (typeof PAGE_TOUR_IDS)[number];
export type TourId = "welcome" | PageTourId;

export type StepVariant = {
  // The data-tour-step-id of the element to point at.
  target: string;
  title: string;
  content: string;
};

export type TourStepDef = {
  // Tried in order; the first one whose element is visible is used.
  variants: StepVariant[];
  side?: "top" | "bottom" | "left" | "right";
};

export type TourDef = {
  id: TourId;
  // Used in the Archive entry ("Finished the Radar tour").
  label: string;
  // The screen the tour belongs to; the welcome tour runs on any screen.
  path?: string;
  steps: TourStepDef[];
};

// One step that points at one element.
const at = (
  target: string,
  title: string,
  content: string,
  side?: TourStepDef["side"]
): TourStepDef => ({ variants: [{ target, title, content }], side });

export const TOURS: TourDef[] = [
  {
    id: "welcome",
    label: "welcome",
    steps: [
      {
        variants: [
          {
            target: "tour-nav",
            title: "Your pages",
            content:
              "This menu has all your pages: Today, Inbox, Projects, People, Radar, Grants and Archive."
          },
          {
            target: "tour-menu-button",
            title: "Your pages",
            content:
              "Tap here to open the menu. It has all your pages, and your account at the bottom."
          }
        ]
      },
      at("tour-search", "Find a page", "Use search to jump straight to any page."),
      at(
        "tour-bell",
        "What's new",
        "The bell shows news: replies to your emails, decisions waiting for you, grants closing soon, new Radar finds and notes to sort."
      ),
      at("tour-start", "Help on every page", "Tap here on any page for a short tour of that page."),
      at(
        "tour-account",
        "Your account",
        "Open this for Settings, to replay a tour, or to sign out.",
        "top"
      )
    ]
  },
  {
    id: "today",
    label: "Today",
    path: "/today",
    steps: [
      at("today-heading", "Today", "Start here each day. This page shows what needs you today."),
      at(
        "today-scope",
        "Business or personal",
        "Show business, personal, or both. The app remembers your choice."
      ),
      at(
        "today-stats",
        "At a glance",
        "Tasks due this week, grants closing soon, new Radar finds and decisions waiting for you. Tap a box to go there."
      ),
      at(
        "today-setup",
        "Getting set up",
        "A short checklist to connect everything. It goes away once every step is done."
      ),
      at(
        "today-approvals",
        "Waiting for you",
        "Things that need your yes or no. Decide here and they leave the list."
      ),
      at("today-tasks", "Tasks", "Tasks that are late or due in the next 7 days."),
      at(
        "today-radar",
        "New on Radar",
        "New startups Radar found since you last looked. Tap one to read about it."
      )
    ]
  },
  {
    id: "inbox",
    label: "Inbox",
    path: "/inbox",
    steps: [
      at(
        "inbox-capture",
        "Jot it down",
        "Type anything here: an idea, a lead, a link or a to-do. Tap Capture to save it."
      ),
      at(
        "inbox-camera",
        "Snap a photo",
        "Tap Photo to take a picture of a page or a whiteboard. Add a caption if you like."
      ),
      at(
        "inbox-tabs",
        "To sort and Filed",
        "New things wait in To sort. Once you decide what they are, they move to Filed."
      ),
      at("inbox-list", "Your notes", "Everything you saved, newest first. Tap one to open it."),
      at(
        "inbox-detail",
        "Sort it",
        "The note you pick opens here. Choose whether it's a task, an idea or something to keep, and which project it belongs to."
      ),
      at(
        "inbox-iphone",
        "From your iPhone",
        "Save a thought, a voice note or a photo from your iPhone. Tap here to see how.",
        "top"
      )
    ]
  },
  {
    id: "projects",
    label: "Projects",
    path: "/projects",
    steps: [
      at(
        "projects-heading",
        "Projects",
        "Everything you're working on, and the tasks for each one."
      ),
      at("projects-add", "Add something", "Start a new project, or add a task to one."),
      at(
        "projects-tabs",
        "Three views",
        "Overview shows the big picture. Projects lists each project. Tasks lists every task."
      ),
      at(
        "projects-scope",
        "Business or personal",
        "Show business projects, personal ones, or both. Personal is for meals, errands, travel and River."
      ),
      at("projects-reminders", "Coming up", "Tasks due soon. Tick one off when it's done.")
    ]
  },
  {
    id: "people",
    label: "People",
    path: "/people",
    steps: [
      at("people-heading", "People", "Your LinkedIn and Google contacts, all in one place."),
      at("people-search", "Find someone", "Search by name, company or job title."),
      at(
        "people-import",
        "Add LinkedIn contacts",
        "Bring in your LinkedIn connections from the file LinkedIn sends you."
      ),
      at(
        "people-google",
        "Google contacts",
        "Connect Google to bring in your Google contacts and your recent emails with them."
      ),
      at(
        "people-filters",
        "Narrow the list",
        "Show only people on your newsletter, or only one sector."
      ),
      at(
        "people-table",
        "Your contacts",
        "Tap a person to see their details, tag their sector or add them to your newsletter.",
        "top"
      )
    ]
  },
  {
    id: "radar",
    label: "Radar",
    path: "/radar",
    steps: [
      at(
        "radar-heading",
        "Radar",
        "Radar finds new climate and materials startups for you, from free websites it checks on its own."
      ),
      at("radar-summary", "What's out there", "The kinds of startups Radar finds most often."),
      at(
        "radar-tabs",
        "Sort your finds",
        "New finds wait in To review. Star, shortlist or pass on each one and it moves to that tab."
      ),
      at("radar-search", "Search", "Find a company by its name or what it does."),
      {
        variants: [
          {
            target: "radar-controls",
            title: "Filters",
            content: "Narrow the list by category, stage or where Radar found it."
          },
          {
            target: "radar-filter-button",
            title: "Filters",
            content: "Tap here to narrow the list by category, stage or where Radar found it."
          }
        ]
      },
      at(
        "radar-list",
        "The companies",
        "Tap a company to read more and decide what to do with it.",
        "top"
      )
    ]
  },
  {
    id: "grants",
    label: "Grants",
    path: "/grants",
    steps: [
      at("grants-heading", "Grants", "Grants you can apply for, with the soonest deadline first."),
      at(
        "grants-views",
        "Four ways to look",
        "See your grants as a board, a list, a table or a calendar of deadlines."
      ),
      at("grants-search", "Search", "Find a grant by its name."),
      at(
        "grants-filters",
        "Filters",
        "Show only grants closing soon, add grants for nonprofits only, or show closed ones."
      ),
      {
        variants: [
          {
            target: "grants-board",
            title: "Your board",
            content:
              "Drag a grant from column to column as you work on it, or open it and change its column there."
          },
          {
            target: "grants-column",
            title: "Your board",
            content:
              "Pick a column above to see its grants. Tap a grant to see the details and move it to another column."
          }
        ]
      }
    ]
  },
  {
    id: "archive",
    label: "Archive",
    path: "/archive",
    steps: [
      at("archive-heading", "Archive", "A record of everything done in the app, newest first."),
      at(
        "archive-tabs",
        "Activity and Notes",
        "Activity is the record. Notes holds the notes brought over from Apple Notes."
      ),
      at(
        "archive-filters",
        "Search and filter",
        "Search for something, or narrow it down by kind of change or by date."
      ),
      at(
        "archive-timeline",
        "Day by day",
        "Each day lists what changed. Tap Open to go to that item.",
        "top"
      )
    ]
  }
];

export function getTour(id: string): TourDef | undefined {
  return TOURS.find((t) => t.id === id);
}

// The tour for the screen at this path, if it has one (Settings has none).
export function tourForPath(pathname: string): TourDef | undefined {
  const first = "/" + (pathname.split("/").filter(Boolean)[0] ?? "");
  return TOURS.find((t) => t.path === first);
}

// The shape the registry TourProvider takes (components/ui/tour.tsx).
export type ResolvedStep = {
  id: string;
  title: string;
  content: string;
  side?: TourStepDef["side"];
};

// Pick, for each step, the first variant whose element is visible; leave out steps with none.
// A step whose element an earlier step already points at is left out too, so a phone never
// shows the menu button twice.
export function resolveSteps(
  tour: TourDef,
  isVisible: (target: string) => boolean
): ResolvedStep[] {
  const used = new Set<string>();
  const steps: ResolvedStep[] = [];
  for (const step of tour.steps) {
    const variant = step.variants.find((v) => isVisible(v.target));
    if (!variant || used.has(variant.target)) continue;
    used.add(variant.target);
    steps.push({
      id: variant.target,
      title: variant.title,
      content: variant.content,
      side: step.side
    });
  }
  return steps;
}

// Stored list from the database, cleaned: known ids only, no repeats.
export function parseSeen(raw: unknown): TourId[] {
  if (!Array.isArray(raw)) return [];
  const known = new Set<string>(TOURS.map((t) => t.id));
  return [...new Set(raw.filter((v): v is TourId => typeof v === "string" && known.has(v)))];
}

export function addSeen(seen: readonly string[], id: TourId): TourId[] {
  return parseSeen([...seen, id]);
}

// The welcome tour starts on its own the first time, and never again once finished or skipped.
export function shouldAutoStartWelcome(seen: readonly string[]): boolean {
  return !seen.includes("welcome");
}
