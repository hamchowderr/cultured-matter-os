import { headers } from "next/headers";
import { cache } from "react";

import { auth } from "@/lib/auth";

// The signed-in session for the current request, or null. Cached per request so the layout,
// pages and server actions share one lookup.
export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));
