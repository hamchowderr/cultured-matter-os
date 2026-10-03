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
  listApprovals,
  listCaptures,
  requestApproval,
  setTaskStatus
} from "./work";

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
  getProject,
  createProject,
  updateProject,
  updateTask,
  linkTaskToProject,
  unlinkTaskFromProject,
  requestApproval,
  listApprovals,
  dueTasks
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
  getProject,
  createProject,
  updateProject,
  updateTask,
  linkTaskToProject,
  unlinkTaskFromProject,
  requestApproval,
  listApprovals,
  dueTasks
] as const;

export { ActionError, type Action, type ActionResult } from "./define";
