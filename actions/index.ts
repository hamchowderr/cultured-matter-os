import {
  getCompany,
  passCompany,
  radarFacets,
  resetCompany,
  searchCompanies,
  shortlistCompany,
  starCompany
} from "./radar";
import { searchGrants, setGrantStatus } from "./grants";
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

export {
  searchCompanies,
  getCompany,
  radarFacets,
  starCompany,
  shortlistCompany,
  passCompany,
  resetCompany,
  searchGrants,
  setGrantStatus,
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
  checkOutlookReplies
};

// Every named action, for the phase-2 agent to wrap as tools.
export const allActions = [
  searchCompanies,
  getCompany,
  radarFacets,
  starCompany,
  shortlistCompany,
  passCompany,
  resetCompany,
  searchGrants,
  setGrantStatus,
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
  checkOutlookReplies
] as const;

export { ActionError, type Action, type ActionResult } from "./define";
