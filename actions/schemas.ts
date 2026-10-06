import { createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

import * as t from "@/db/schema";
import { isIsoDay, noonOfIsoDay } from "@/lib/activity";

// Output shapes come straight from the tables; JSON columns get their real types.
export const companySchema = createSelectSchema(t.companies, {
  categories: z.array(z.string())
});
export const sourceSchema = createSelectSchema(t.sources);
export const grantSchema = createSelectSchema(t.grants).omit({ raw: true });
export const contactSchema = createSelectSchema(t.contacts, {
  sectors: z.array(z.string())
});
export const pairingSchema = createSelectSchema(t.pairings);
export const captureSchema = createSelectSchema(t.captures);
export const projectSchema = createSelectSchema(t.projects);
export const taskSchema = createSelectSchema(t.tasks);
export const approvalSchema = createSelectSchema(t.approvals);

export type Company = z.infer<typeof companySchema>;
export type Pairing = z.infer<typeof pairingSchema>;
export type Grant = z.infer<typeof grantSchema>;
export type Contact = z.infer<typeof contactSchema>;
export type Capture = z.infer<typeof captureSchema>;
export type Task = z.infer<typeof taskSchema>;
export type Approval = z.infer<typeof approvalSchema>;

export const id = z.string().min(1);
export const taskPriority = z.enum(["low", "medium", "high", "urgent"]);

// A task's due date is a calendar day. Callers send it as YYYY-MM-DD (the date picker and
// the assistant); a date-time's own day is taken as written, never shifted through the
// server's time zone (Vercel runs in UTC). It is stored as noon on that day in Simone's
// zone. Code inside the app may still pass an exact Date.
export const dueDate = z
  .union([
    z.date(),
    z
      .string()
      .transform((v) => v.slice(0, 10))
      .refine(isIsoDay, "Use a calendar date: YYYY-MM-DD")
      .transform((day) => noonOfIsoDay(day))
  ])
  .meta({ calendarDate: true });
export const note = z.string().trim().max(2000).optional();
export const limit = z.number().int().min(1).max(200).default(50);
export const offset = z.number().int().min(0).default(0);
