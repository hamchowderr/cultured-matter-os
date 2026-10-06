// Starting points shown on an empty chat. Each one is a question the assistant can answer
// from the app's own data (its read actions). The docked panel picks the set for the page
// she is on, so the first question is usually about what is in front of her.

export type ChatSuggestion = { label: string; prompt: string };

export const CHAT_SUGGESTIONS: ChatSuggestion[] = [
  { label: "Grants closing soon", prompt: "Which grants close in the next month?" },
  { label: "What's due this week", prompt: "What tasks are due this week?" },
  { label: "New on Radar", prompt: "What did Radar find this week?" },
  {
    label: "Who can introduce me",
    prompt: "Who in my network works at a company on my Radar shortlist?"
  }
];

// Longest prefix wins, so "/grants" covers the board, the table and the calendar views.
const BY_PAGE: Record<string, ChatSuggestion[]> = {
  "/today": [
    { label: "Plan my day", prompt: "What should I focus on today?" },
    { label: "What's due this week", prompt: "What tasks are due this week?" },
    { label: "Open approvals", prompt: "Which approval requests are waiting on me?" }
  ],
  "/inbox": [
    { label: "Find a note", prompt: "Find my notes about packaging suppliers." },
    { label: "Notifications", prompt: "What are my unread notifications about?" },
    { label: "Recent activity", prompt: "What changed in the app this week?" }
  ],
  "/projects": [
    { label: "Project status", prompt: "Give me a status update on my active projects." },
    { label: "Overdue tasks", prompt: "Which tasks are overdue?" },
    { label: "What's due this week", prompt: "What tasks are due this week?" }
  ],
  "/people": [
    {
      label: "Who can introduce me",
      prompt: "Who in my network works at a company on my Radar shortlist?"
    },
    { label: "Find a contact", prompt: "Who do I know in food packaging?" },
    { label: "Newsletter list", prompt: "How many contacts are on my newsletter?" }
  ],
  "/radar": [
    { label: "New on Radar", prompt: "What did Radar find this week?" },
    { label: "Warm paths", prompt: "Which Radar companies can I reach through someone I know?" },
    { label: "Pairings", prompt: "Which target brands are paired with my Radar companies?" }
  ],
  "/grants": [
    { label: "Closing soon", prompt: "Which grants close in the next month?" },
    { label: "New grants", prompt: "Which grants were added this week?" },
    {
      label: "What I'm applying to",
      prompt: "Which grants am I applying to, and when are they due?"
    }
  ],
  "/archive": [
    { label: "Find a note", prompt: "Find my notes about packaging suppliers." },
    { label: "Recent activity", prompt: "What changed in the app this week?" }
  ],
  "/settings": [
    { label: "My business profile", prompt: "What does my business profile say?" },
    { label: "Google connection", prompt: "Is my Google account connected and syncing?" },
    { label: "Daily email", prompt: "Is the daily summary email on?" }
  ]
};

/** The suggestions for a page, or the general set on any other page. */
export function suggestionsFor(pathname: string | null): ChatSuggestion[] {
  if (!pathname) return CHAT_SUGGESTIONS;
  const match = Object.keys(BY_PAGE)
    .filter((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
    .sort((a, b) => b.length - a.length)[0];
  return match ? BY_PAGE[match] : CHAT_SUGGESTIONS;
}
