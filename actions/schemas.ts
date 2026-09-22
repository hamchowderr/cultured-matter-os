import { createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

import * as t from "@/db/schema";

// Output shapes come straight from the tables; JSON columns get their real types.
export const companySchema = createSelectSchema(t.companies, {
  categories: z.array(z.string())
});
export const sourceSchema = createSelectSchema(t.sources);
export const grantSchema = createSelectSchema(t.grants).omit({ raw: true });
export const contactSchema = createSelectSchema(t.contacts, {
  sectors: z.array(z.string())
});
export const captureSchema = createSelectSchema(t.captures);
export const projectSchema = createSelectSchema(t.projects);
export const taskSchema = createSelectSchema(t.tasks);
export const approvalSchema = createSelectSchema(t.approvals);

export type Company = z.infer<typeof companySchema>;
export type Grant = z.infer<typeof grantSchema>;
export type Contact = z.infer<typeof contactSchema>;
export type Capture = z.infer<typeof captureSchema>;
export type Task = z.infer<typeof taskSchema>;
export type Approval = z.infer<typeof approvalSchema>;

export const id = z.string().min(1);
export const note = z.string().trim().max(2000).optional();
export const limit = z.number().int().min(1).max(200).default(50);
export const offset = z.number().int().min(0).default(0);
