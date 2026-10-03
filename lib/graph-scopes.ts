// Delegated Microsoft Graph permissions for Outlook in People. Shared by the server (sign-in
// config, scope checks) and the "Connect Outlook" button.
export const GRAPH_SCOPES = ["Contacts.Read", "Mail.ReadWrite"] as const;
