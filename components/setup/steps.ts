import {
  LinkedinIcon,
  MailIcon,
  NewspaperIcon,
  SmartphoneIcon,
  type LucideIcon
} from "lucide-react";

import type { SetupStatus } from "@/actions/setup";

export type StepId = "linkedin" | "outlook" | "iphone" | "newsletter";

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

// The four things to set up, in the order she does them. Shared by Today and Settings.
export const STEPS: Step[] = [
  {
    id: "linkedin",
    icon: LinkedinIcon,
    title: "Bring in your LinkedIn contacts",
    description: "Download your connections from LinkedIn and add the file to People.",
    href: "/people",
    todoLabel: "Import contacts",
    doneLabel: "Open People",
    doneHref: "/people"
  },
  {
    id: "outlook",
    icon: MailIcon,
    title: "Connect Google",
    description: "See recent emails with each person and save follow-up drafts in Gmail.",
    href: "/people",
    todoLabel: "Connect Google",
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
    id: "newsletter",
    icon: NewspaperIcon,
    title: "Connect your newsletter",
    description: "Send the people you pick to your newsletter list.",
    href: "/settings",
    todoLabel: "See details",
    doneLabel: "See who gets it",
    doneHref: "/people?newsletter=1"
  }
];

const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

// One plain line about where each step stands.
export function stepSummary(id: StepId, status: SetupStatus): string {
  switch (id) {
    case "linkedin":
      return status.linkedin.done
        ? `${status.linkedin.contacts} ${status.linkedin.contacts === 1 ? "person" : "people"} from LinkedIn`
        : STEPS[0].description;
    case "outlook":
      return status.outlook.done ? "Connected" : STEPS[1].description;
    case "iphone":
      return status.iphone.lastCaptureAt
        ? `Last capture from your iPhone on ${day.format(status.iphone.lastCaptureAt)}`
        : STEPS[2].description;
    case "newsletter":
      return status.newsletter.done ? "Connected" : "Waiting on your newsletter tool";
  }
}
