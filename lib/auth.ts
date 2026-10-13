import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { accounts, sessions, users, verifications } from "@/db/schema";
import { ACCOUNT_NOT_ALLOWED, isAllowedEmail } from "@/lib/allowed-emails";
import { GOOGLE_SCOPES } from "@/lib/google-scopes";

function refuse(): never {
  // The OAuth callback turns this into a redirect to /sign-in?error=ACCOUNT_NOT_ALLOWED.
  throw new APIError("FORBIDDEN", {
    code: ACCOUNT_NOT_ALLOWED,
    message: "This account isn't allowed to sign in."
  });
}

// Google sign-in for one person. No email/password, no sign-up page, no organizations.
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    usePlural: true,
    schema: { users, sessions, accounts, verifications }
  }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      // A refresh token, so the daily reply check works while she is away. Google only issues
      // one on a consent screen, hence "consent" on every sign-in.
      accessType: "offline",
      prompt: "select_account consent",
      // Gmail and Contacts for People (on top of Better Auth's openid, email and profile).
      // Accounts that signed in before this ask again through "Sync Google"
      // (authClient.linkSocial), which records the new scopes.
      scope: [...GOOGLE_SCOPES]
    }
  },
  account: {
    accountLinking: {
      // "Sync Google" re-links the same Google account to add scopes.
      trustedProviders: ["google"]
    }
  },
  databaseHooks: {
    user: {
      create: {
        // Runs before the user row is written, so a refused account leaves nothing behind.
        before: async (user) => {
          if (!isAllowedEmail(user.email)) refuse();
        }
      }
    },
    session: {
      create: {
        // Also covers an existing user whose address was later removed from ALLOWED_EMAILS.
        before: async (session) => {
          const [user] = await db
            .select({ email: users.email })
            .from(users)
            .where(eq(users.id, session.userId));
          if (!isAllowedEmail(user?.email)) refuse();
        }
      }
    }
  },
  // Errors with no stored callback (e.g. Google replaying an already-used callback) land on
  // /sign-in instead of Better Auth's default error page; a signed-in visitor goes on to /today.
  onAPIError: { errorURL: "/sign-in" },
  plugins: [nextCookies()]
});

export type Session = typeof auth.$Infer.Session;
