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
export async function getCompany(input: In<typeof A.getCompany>) {
  return toResult(() => A.getCompany.run(input));
}
export async function radarFacets(input: In<typeof A.radarFacets>) {
  return toResult(() => A.radarFacets.run(input));
}
export async function starCompany(input: In<typeof A.starCompany>) {
  return toResult(() => A.starCompany.run(input));
}
export async function resetCompany(input: In<typeof A.resetCompany>) {
  return toResult(() => A.resetCompany.run(input));
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
export async function importContacts(input: In<typeof A.importContacts>) {
  return toResult(() => A.importContacts.run(input));
}
export async function setContactSectors(input: In<typeof A.setContactSectors>) {
  return toResult(() => A.setContactSectors.run(input));
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
export async function listProjects(input: In<typeof A.listProjects>) {
  return toResult(() => A.listProjects.run(input));
}
export async function getProject(input: In<typeof A.getProject>) {
  return toResult(() => A.getProject.run(input));
}
export async function createProject(input: In<typeof A.createProject>) {
  return toResult(() => A.createProject.run(input));
}
export async function updateProject(input: In<typeof A.updateProject>) {
  return toResult(() => A.updateProject.run(input));
}
export async function updateTask(input: In<typeof A.updateTask>) {
  return toResult(() => A.updateTask.run(input));
}
export async function linkTaskToProject(input: In<typeof A.linkTaskToProject>) {
  return toResult(() => A.linkTaskToProject.run(input));
}
export async function unlinkTaskFromProject(input: In<typeof A.unlinkTaskFromProject>) {
  return toResult(() => A.unlinkTaskFromProject.run(input));
}
export async function listCaptures(input: In<typeof A.listCaptures>) {
  return toResult(() => A.listCaptures.run(input));
}
export async function dueTasks(input: In<typeof A.dueTasks>) {
  return toResult(() => A.dueTasks.run(input));
}
export async function listApprovals(input: In<typeof A.listApprovals>) {
  return toResult(() => A.listApprovals.run(input));
}
