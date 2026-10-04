// VAPID settings for web push, from the environment. Generated once with
// `npx web-push generate-vapid-keys` and stored in Infisical; see .env.example.

export type VapidConfig = { subject: string | null; publicKey: string; privateKey: string };

const real = (v: string | undefined) => (v && !v.startsWith("YOUR_") ? v : null);

// The contact the push services see: VAPID_SUBJECT, else the app's own https address. Apple
// rejects an https://localhost subject, so a local run without VAPID_SUBJECT gets null and the
// sender falls back to the owner's mailto: address.
function subject() {
  const explicit = real(process.env.VAPID_SUBJECT);
  if (explicit) return explicit;
  const app = real(process.env.BETTER_AUTH_URL);
  if (!app) return null;
  try {
    const url = new URL(app);
    return url.protocol === "https:" && url.hostname !== "localhost" ? url.origin : null;
  } catch {
    return null;
  }
}

// Null when the keys are not set: push is then off and every send is a no-op.
export function vapidConfig(): VapidConfig | null {
  const publicKey =
    real(process.env.VAPID_PUBLIC_KEY) ?? real(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
  const privateKey = real(process.env.VAPID_PRIVATE_KEY);
  if (!publicKey || !privateKey) return null;
  return { subject: subject(), publicKey, privateKey };
}
