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
  checkOutlookReplies,
  draftFollowUp,
  listContactEmails,
  outlookStatus,
  syncOutlook
} from "./outlook";
import { setupStatus } from "./setup";
import { listNotifications, markNotificationsRead } from "./notifications";
import {
  calendarFeed,
  dailySummary,
  getUserSettings,
  newGrantsSince,
  recordDailySummary,
  resetCalendarLink,
  setDailyEmail
} from "./preferences";

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
  outlookStatus,
  setupStatus,
  syncOutlook,
  listContactEmails,
  draftFollowUp,
  checkOutlookReplies,
  listNotifications,
  markNotificationsRead,
  getUserSettings,
  resetCalendarLink,
  setDailyEmail,
  calendarFeed,
  newGrantsSince,
  dailySummary,
  recordDailySummary
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
  outlookStatus,
  setupStatus,
  syncOutlook,
  listContactEmails,
  draftFollowUp,
  checkOutlookReplies,
  listNotifications,
  markNotificationsRead,
  getUserSettings,
  resetCalendarLink,
  setDailyEmail,
  newGrantsSince,
  dailySummary
  // Not tools: calendarFeed (keyed by the feed's secret token) and recordDailySummary (the cron's
  // bookkeeping).
] as const;

export { ActionError, type Action, type ActionResult } from "./define";
