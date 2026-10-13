import { LinkedinIcon, MailIcon, SmartphoneIcon, type LucideIcon } from "lucide-react";

import type { SetupStatus } from "@/actions/setup";

export type StepId = "linkedin" | "google" | "iphone";

export type Step = {
  id: StepId;
  icon: LucideIcon;
  title: string;
  description: string;
  // Where it is done, and what the link says before and after.
  href: string;
  todoLabel: string;
  doneLabel: string;
  doneHref: string;
};

// The three things to set up, in the order she does them. Shared by Today and Settings.
export const STEPS: Step[] = [
  {
    id: "google",
    icon: MailIcon,
    title: "Sync Google",
    description: "See recent emails with each person and save follow-up drafts in Gmail.",
    href: "/people",
    todoLabel: "Sync Google",
    doneLabel: "Open People",
    doneHref: "/people"
  },
  {
    id: "iphone",
    icon: SmartphoneIcon,
    title: "Add the iPhone Shortcuts",
    description: "Send a thought, a voice note or a photo straight to your Inbox.",
    href: "/inbox",
    todoLabel: "Show me how",
    doneLabel: "Open Inbox",
    doneHref: "/inbox"
  },
  {
    id: "linkedin",
    icon: LinkedinIcon,
    title: "Bring in your LinkedIn contacts",
    description: "Download your connections from LinkedIn and add the file to People.",
    href: "/people",
    todoLabel: "Import contacts",
    doneLabel: "Open People",
    doneHref: "/people"
  }
];

const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

// Looked up by id, so reordering STEPS never pairs a step with another one's text.
const describe = (id: StepId) => STEPS.find((step) => step.id === id)!.description;

// One plain line about where each step stands.
export function stepSummary(id: StepId, status: SetupStatus): string {
  switch (id) {
    case "linkedin":
      return status.linkedin.done
        ? `${status.linkedin.contacts} ${status.linkedin.contacts === 1 ? "person" : "people"} from LinkedIn`
        : describe("linkedin");
    case "google":
      return status.google.done ? "Synced" : describe("google");
    case "iphone":
      return status.iphone.lastCaptureAt
        ? `Last capture from your iPhone on ${day.format(status.iphone.lastCaptureAt)}`
        : describe("iphone");
  }
}
