import { handleUnsubscribeWebhook } from "@/lib/newsletter-http";

// Public: FluentCRM's outgoing webhook reports unsubscribes here, with a shared secret header.
export async function POST(request: Request) {
  return handleUnsubscribeWebhook(request);
}
