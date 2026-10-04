"use server";

// The only door from UI code to the database. Each function validates its input,
// runs the named action, and returns { ok, data } or { ok: false, error }.

import type { z } from "zod/v4";

import * as A from "./index";
import { toResult } from "./define";
import { runNewsletterSync } from "@/lib/newsletter-sync";

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
export async function radarFindsByWeek(input: In<typeof A.radarFindsByWeek>) {
  return toResult(() => A.radarFindsByWeek.run(input));
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
export async function tasksDueBetween(input: In<typeof A.tasksDueBetween>) {
  return toResult(() => A.tasksDueBetween.run(input));
}
export async function listActivity(input: In<typeof A.listActivity>) {
  return toResult(() => A.listActivity.run(input));
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
export async function countWarmPaths(input: In<typeof A.countWarmPaths>) {
  return toResult(() => A.countWarmPaths.run(input));
}
export async function contactWarmPaths(input: In<typeof A.contactWarmPaths>) {
  return toResult(() => A.contactWarmPaths.run(input));
}
export async function listPairings(input: In<typeof A.listPairings>) {
  return toResult(() => A.listPairings.run(input));
}
export async function addPairing(input: In<typeof A.addPairing>) {
  return toResult(() => A.addPairing.run(input));
}
export async function removePairing(input: In<typeof A.removePairing>) {
  return toResult(() => A.removePairing.run(input));
}
export async function linkContact(input: In<typeof A.linkContact>) {
  return toResult(() => A.linkContact.run(input));
}
export async function unlinkContact(input: In<typeof A.unlinkContact>) {
  return toResult(() => A.unlinkContact.run(input));
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
export async function deleteProject(input: In<typeof A.deleteProject>) {
  return toResult(() => A.deleteProject.run(input));
}
export async function listTasks(input: In<typeof A.listTasks>) {
  return toResult(() => A.listTasks.run(input));
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
export async function decideApproval(input: In<typeof A.decideApproval>) {
  return toResult(() => A.decideApproval.run(input));
}
export async function setNewsletter(input: In<typeof A.setNewsletter>) {
  return toResult(() => A.setNewsletter.run(input));
}
export async function newsletterStatus(input: In<typeof A.newsletterStatus>) {
  return toResult(() => A.newsletterStatus.run(input));
}
export async function syncNewsletter() {
  return toResult(() => runNewsletterSync());
}
export async function googleStatus(input: In<typeof A.googleStatus>) {
  return toResult(() => A.googleStatus.run(input));
}
export async function syncGoogle(input: In<typeof A.syncGoogle>) {
  return toResult(() => A.syncGoogle.run(input));
}
export async function listContactEmails(input: In<typeof A.listContactEmails>) {
  return toResult(() => A.listContactEmails.run(input));
}
export async function draftFollowUp(input: In<typeof A.draftFollowUp>) {
  return toResult(() => A.draftFollowUp.run(input));
}
// The Inbox camera button: a photo (fields "photo" and "caption") from the signed-in session,
// stored the same way as iPhone Shortcut photos.
export async function captureInboxPhoto(form: FormData) {
  return toResult(async () => {
    const capture = await import("@/lib/capture");
    return capture.captureInboxPhoto(form);
  });
}
export async function setupStatus(input: In<typeof A.setupStatus>) {
  return toResult(() => A.setupStatus.run(input));
}

// The header bell. Who is asking and the Radar baseline come from the request, not the client.
async function notificationContext() {
  const [{ cookies }, { getSession }, { RADAR_BASELINE_COOKIE }] = await Promise.all([
    import("next/headers"),
    import("@/lib/session"),
    import("@/app/(app)/radar/constants")
  ]);
  const session = await getSession();
  const baselineRaw = (await cookies()).get(RADAR_BASELINE_COOKIE)?.value;
  const baseline = Number(baselineRaw);
  return {
    userId: session?.user.id ?? "",
    radarSince: baselineRaw && Number.isFinite(baseline) ? new Date(baseline) : undefined
  };
}
export async function listNotifications() {
  return toResult(async () => A.listNotifications.run(await notificationContext()));
}
export async function markNotificationsRead(input: { itemIds: string[] }) {
  return toResult(async () => {
    const { userId } = await notificationContext();
    return A.markNotificationsRead.run({ userId, itemIds: input.itemIds });
  });
}

// Settings: the calendar feed link and the daily email. The user comes from the session.
async function sessionUserId() {
  const { getSession } = await import("@/lib/session");
  return (await getSession())?.user.id ?? "";
}
export async function getUserSettings() {
  return toResult(async () => A.getUserSettings.run({ userId: await sessionUserId() }));
}
export async function resetCalendarLink() {
  return toResult(async () => A.resetCalendarLink.run({ userId: await sessionUserId() }));
}
export async function setDailyEmail(input: { enabled: boolean }) {
  return toResult(async () =>
    A.setDailyEmail.run({ userId: await sessionUserId(), enabled: input.enabled })
  );
}
// The Business / Personal / All switch on Today and Projects, remembered per user.
export async function setWorkScope(input: Omit<In<typeof A.setWorkScope>, "userId">) {
  return toResult(async () => A.setWorkScope.run({ ...input, userId: await sessionUserId() }));
}
export async function markTourSeen(input: Omit<In<typeof A.markTourSeen>, "userId">) {
  return toResult(async () => A.markTourSeen.run({ ...input, userId: await sessionUserId() }));
}

// Push notifications. The device's subscription comes from the browser; the user from the session.
type BrowserSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };
export async function pushStatus(input: { endpoint?: string } = {}) {
  return toResult(async () =>
    A.pushStatus.run({ userId: await sessionUserId(), endpoint: input.endpoint })
  );
}
export async function savePushSubscription(input: BrowserSubscription) {
  return toResult(async () => {
    const { headers } = await import("next/headers");
    const userAgent = (await headers()).get("user-agent") ?? undefined;
    return A.savePushSubscription.run({
      userId: await sessionUserId(),
      endpoint: input.endpoint,
      keys: input.keys,
      userAgent
    });
  });
}
export async function removePushSubscription(input: { endpoint: string }) {
  return toResult(async () =>
    A.removePushSubscription.run({ userId: await sessionUserId(), endpoint: input.endpoint })
  );
}
export async function setPushPreferences(input: {
  daily?: boolean;
  replies?: boolean;
  approvals?: boolean;
}) {
  return toResult(async () =>
    A.setPushPreferences.run({ ...input, userId: await sessionUserId() })
  );
}
// Settings' "Send a test": one notification to this device only.
export async function sendTestPush(input: { endpoint: string }) {
  return toResult(async () => {
    const [{ sendPush }, { db }] = await Promise.all([import("@/lib/push"), import("@/db")]);
    const result = await sendPush(
      db,
      "test",
      {
        title: "Notifications are on",
        body: "This is how Cultured Matter will reach you.",
        url: "/settings",
        tag: "test"
      },
      { userId: await sessionUserId(), endpoint: input.endpoint }
    );
    if (result.skipped === "Push is not configured") {
      throw new A.ActionError("unavailable", "Notifications are not set up on the server yet.");
    }
    if (result.sent === 0) {
      throw new A.ActionError(
        "unavailable",
        result.removed
          ? "This device no longer accepts notifications. Allow them again."
          : "The test notification could not be sent."
      );
    }
    return result;
  });
}

export async function searchNotes(input: In<typeof A.searchNotes>) {
  return toResult(() => A.searchNotes.run(input));
}
export async function getNote(input: In<typeof A.getNote>) {
  return toResult(() => A.getNote.run(input));
}
export async function fileNoteToInbox(input: In<typeof A.fileNoteToInbox>) {
  return toResult(() => A.fileNoteToInbox.run(input));
}
