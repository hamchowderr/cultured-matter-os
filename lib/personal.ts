// Personal life admin lives in the same business → project → task hierarchy: "Personal" is a
// business like any other, and its projects hold her personal tasks. A task is personal when its
// home project is under Personal; a task with no project counts as business. The SQL versions of
// these tests are in lib/personal-sql.ts.

export const PERSONAL_BUSINESS = "Personal";

export const WORK_SCOPES = ["business", "personal", "all"] as const;
export type WorkScope = (typeof WORK_SCOPES)[number];

export const SCOPE_LABELS: Record<WorkScope, string> = {
  business: "Business",
  personal: "Personal",
  all: "All"
};

// Added the first time she switches to Personal, only if she has no personal projects yet. Each
// one is empty and can be deleted from its project page.
export const SUGGESTED_PERSONAL_PROJECTS: { name: string; description: string }[] = [
  { name: "Home & meals", description: "Meals, prep, shopping, cooking and cleaning." },
  { name: "Errands & admin", description: "Errands, bills, appointments and paperwork." },
  { name: "Schedule & travel", description: "Planning the week, drive time, events and trips." },
  { name: "Health & meditation", description: "Meditation, exercise and rest." },
  { name: "River", description: "River's activities, classes and plans." }
];

export const isPersonal = (business: string | null | undefined) =>
  business?.trim().toLowerCase() === PERSONAL_BUSINESS.toLowerCase();
