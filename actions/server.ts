"use server";

// The only door from UI code to the database. Each function validates its input,
// runs the named action, and returns { ok, data } or { ok: false, error }.

import type { z } from "zod/v4";

import * as A from "./index";
import { toResult } from "./define";

type In<T extends { input: z.ZodType }> = z.input<T["input"]>;

export async function searchCompanies(input: In<typeof A.searchCompanies>) {
  return toResult(() => A.searchCompanies.run(input));
}
export async function shortlistCompany(input: In<typeof A.shortlistCompany>) {
  return toResult(() => A.shortlistCompany.run(input));
}
export async function passCompany(input: In<typeof A.passCompany>) {
  return toResult(() => A.passCompany.run(input));
}
export async function searchGrants(input: In<typeof A.searchGrants>) {
  return toResult(() => A.searchGrants.run(input));
}
export async function setGrantStatus(input: In<typeof A.setGrantStatus>) {
  return toResult(() => A.setGrantStatus.run(input));
}
export async function searchContacts(input: In<typeof A.searchContacts>) {
  return toResult(() => A.searchContacts.run(input));
}
export async function findWarmPath(input: In<typeof A.findWarmPath>) {
  return toResult(() => A.findWarmPath.run(input));
}
export async function createCapture(input: In<typeof A.createCapture>) {
  return toResult(() => A.createCapture.run(input));
}
export async function classifyCapture(input: In<typeof A.classifyCapture>) {
  return toResult(() => A.classifyCapture.run(input));
}
export async function createTask(input: In<typeof A.createTask>) {
  return toResult(() => A.createTask.run(input));
}
export async function setTaskStatus(input: In<typeof A.setTaskStatus>) {
  return toResult(() => A.setTaskStatus.run(input));
}
export async function requestApproval(input: In<typeof A.requestApproval>) {
  return toResult(() => A.requestApproval.run(input));
}
