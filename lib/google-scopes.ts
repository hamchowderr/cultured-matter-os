// Google permissions for Gmail and Contacts in People, on top of Better Auth's openid, email and
// profile. Shared by the server (sign-in config, scope checks) and the "Sync Google" button.
// The narrowest set that covers the features: read mail metadata, create drafts (the only mail
// sent is the daily summary, from her account to herself; gmail.compose covers messages.send),
// read her contacts and the "Other contacts" Gmail collects from people she has emailed.
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/contacts.readonly",
  "https://www.googleapis.com/auth/contacts.other.readonly"
] as const;
