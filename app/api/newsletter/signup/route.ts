import { handleSignup, signupPreflight } from "@/lib/newsletter-http";

// Public: the website's signup form (via Zapier, or a custom form) posts here. No session.
export async function POST(request: Request) {
  return handleSignup(request);
}

export async function OPTIONS() {
  return signupPreflight();
}
