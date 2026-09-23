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
import {
  createProject,
  getProject,
  linkTaskToProject,
  listProjects,
  unlinkTaskFromProject,
  updateProject,
  updateTask
} from "./projects";
import { findWarmPath, importContacts, searchContacts, setContactSectors } from "./people";
import {
  classifyCapture,
  createCapture,
  createTask,
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
  searchContacts,
  findWarmPath,
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
  requestApproval
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
  searchContacts,
  findWarmPath,
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
  requestApproval
] as const;

export { ActionError, type Action, type ActionResult } from "./define";
