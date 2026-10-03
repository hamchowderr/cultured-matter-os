import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { accounts, sessions, users, verifications } from "@/db/schema";
import { ACCOUNT_NOT_ALLOWED, isAllowedEmail } from "@/lib/allowed-emails";
import { GRAPH_SCOPES } from "@/lib/graph-scopes";

function refuse(): never {
  // The OAuth callback turns this into a redirect to /sign-in?error=ACCOUNT_NOT_ALLOWED.
  throw new APIError("FORBIDDEN", {
    code: ACCOUNT_NOT_ALLOWED,
    message: "This account isn't allowed to sign in."
  });
}

// Microsoft sign-in for one person. No email/password, no sign-up page, no organizations.
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    usePlural: true,
    schema: { users, sessions, accounts, verifications }
  }),
  socialProviders: {
    microsoft: {
      clientId: process.env.MICROSOFT_CLIENT_ID as string,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET as string,
      tenantId: "common",
      prompt: "select_account",
      // Outlook contacts and mail for People (on top of Better Auth's openid, profile, email,
      // User.Read and offline_access). Accounts that signed in before this ask again through
      // "Connect Outlook" (authClient.linkSocial), which records the new scopes.
      scope: [...GRAPH_SCOPES]
    }
  },
  account: {
    accountLinking: {
      // "Connect Outlook" re-links the same Microsoft account to add scopes. Microsoft often
      // omits email_verified, which Better Auth otherwise requires to link.
      trustedProviders: ["microsoft"]
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
  // Errors with no stored callback (e.g. Microsoft replaying an already-used callback) land on
  // /sign-in instead of Better Auth's default error page; a signed-in visitor goes on to /today.
  onAPIError: { errorURL: "/sign-in" },
  plugins: [nextCookies()]
});

export type Session = typeof auth.$Infer.Session;
