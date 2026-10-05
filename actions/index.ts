import {
  getCompany,
  passCompany,
  radarFacets,
  radarFindsByWeek,
  resetCompany,
  searchCompanies,
  shortlistCompany,
  starCompany
} from "./radar";
import { searchGrants, setGrantStatus } from "./grants";
import { tasksDueBetween } from "./grants";
import { listActivity } from "./activity";
import {
  createProject,
  deleteProject,
  dueTasks,
  getProject,
  linkTaskToProject,
  listProjects,
  listTasks,
  unlinkTaskFromProject,
  updateProject,
  updateTask
} from "./projects";
import {
  addPairing,
  contactWarmPaths,
  countWarmPaths,
  findWarmPath,
  importContacts,
  linkContact,
  listPairings,
  removePairing,
  searchContacts,
  setContactSectors,
  unlinkContact
} from "./people";
import {
  classifyCapture,
  createCapture,
  createTask,
  decideApproval,
  listApprovals,
  listCaptures,
  requestApproval,
  setTaskStatus
} from "./work";
import {
  newsletterQueue,
  newsletterSignup,
  newsletterStatus,
  newsletterUnsubscribe,
  recordNewsletterSync,
  setNewsletter
} from "./newsletter";
import {
  checkGmailReplies,
  draftFollowUp,
  listContactEmails,
  googleStatus,
  syncGoogle
} from "./gmail";
import { setupStatus } from "./setup";
import { listNotifications, markNotificationsRead } from "./notifications";
import {
  calendarFeed,
  dailySummary,
  getUserSettings,
  markTourSeen,
  newGrantsSince,
  recordDailySummary,
  resetCalendarLink,
  setDailyEmail,
  setWorkScope
} from "./preferences";
import {
  prunePushSubscriptions,
  pushStatus,
  removePushSubscription,
  savePushSubscription,
  setPushPreferences
} from "./push";
import { fileNoteToInbox, getNote, importNotes, searchNotes } from "./notes";
import {
  getBusinessProfile,
  getBusinessProfileForEditing,
  updateBusinessProfile
} from "./business";
import {
  buildVoiceGuide,
  gatherVoiceSamples,
  getVoiceGuide,
  updateVoiceGuide
} from "./voice";

export {
  searchCompanies,
  getCompany,
  radarFacets,
  radarFindsByWeek,
  starCompany,
  shortlistCompany,
  passCompany,
  resetCompany,
  searchGrants,
  setGrantStatus,
  tasksDueBetween,
  listActivity,
  searchContacts,
  findWarmPath,
  countWarmPaths,
  contactWarmPaths,
  listPairings,
  addPairing,
  removePairing,
  linkContact,
  unlinkContact,
  importContacts,
  setContactSectors,
  createCapture,
  listCaptures,
  classifyCapture,
  createTask,
  setTaskStatus,
  listProjects,
  listTasks,
  getProject,
  createProject,
  deleteProject,
  updateProject,
  updateTask,
  linkTaskToProject,
  unlinkTaskFromProject,
  requestApproval,
  listApprovals,
  decideApproval,
  dueTasks,
  setNewsletter,
  newsletterStatus,
  newsletterQueue,
  recordNewsletterSync,
  newsletterSignup,
  newsletterUnsubscribe,
  googleStatus,
  setupStatus,
  syncGoogle,
  listContactEmails,
  draftFollowUp,
  checkGmailReplies,
  listNotifications,
  markNotificationsRead,
  getUserSettings,
  resetCalendarLink,
  setDailyEmail,
  setWorkScope,
  markTourSeen,
  calendarFeed,
  newGrantsSince,
  dailySummary,
  recordDailySummary,
  pushStatus,
  setPushPreferences,
  savePushSubscription,
  removePushSubscription,
  prunePushSubscriptions,
  importNotes,
  searchNotes,
  getNote,
  fileNoteToInbox,
  getBusinessProfile,
  getBusinessProfileForEditing,
  updateBusinessProfile,
  getVoiceGuide,
  gatherVoiceSamples,
  buildVoiceGuide,
  updateVoiceGuide
};

// Every named action, for the phase-2 agent to wrap as tools.
export const allActions = [
  searchCompanies,
  getCompany,
  radarFacets,
  radarFindsByWeek,
  starCompany,
  shortlistCompany,
  passCompany,
  resetCompany,
  searchGrants,
  setGrantStatus,
  tasksDueBetween,
  listActivity,
  searchContacts,
  findWarmPath,
  countWarmPaths,
  contactWarmPaths,
  listPairings,
  addPairing,
  removePairing,
  linkContact,
  unlinkContact,
  importContacts,
  setContactSectors,
  createCapture,
  listCaptures,
  classifyCapture,
  createTask,
  setTaskStatus,
  listProjects,
  listTasks,
  getProject,
  createProject,
  deleteProject,
  updateProject,
  updateTask,
  linkTaskToProject,
  unlinkTaskFromProject,
  requestApproval,
  listApprovals,
  decideApproval,
  dueTasks,
  setNewsletter,
  newsletterStatus,
  googleStatus,
  setupStatus,
  syncGoogle,
  listContactEmails,
  draftFollowUp,
  checkGmailReplies,
  listNotifications,
  markNotificationsRead,
  getUserSettings,
  resetCalendarLink,
  setDailyEmail,
  setWorkScope,
  newGrantsSince,
  dailySummary,
  pushStatus,
  setPushPreferences,
  searchNotes,
  getNote,
  fileNoteToInbox,
  getBusinessProfile,
  updateBusinessProfile,
  getVoiceGuide
  // Not tools: calendarFeed (keyed by the feed's secret token), recordDailySummary (the cron's
  // bookkeeping), markTourSeen (the guided tours' bookkeeping), importNotes (the Apple Notes
  // Shortcut's endpoint), the push device actions (they need a browser's push subscription) and
  // getBusinessProfileForEditing (it returns the EIN and SAM UEI; getBusinessProfile leaves them out),
  // and the voice guide's Settings actions: gatherVoiceSamples (it reads her sent mail in full),
  // buildVoiceGuide (it spends AI budget) and updateVoiceGuide (she edits her own voice).
] as const;

export { ActionError, type Action, type ActionResult } from "./define";
