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
import { findWarmPath, importContacts, searchContacts, setContactSectors } from "./people";
import {
  classifyCapture,
  createCapture,
  createTask,
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
  classifyCapture,
  createTask,
  setTaskStatus,
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
  classifyCapture,
  createTask,
  setTaskStatus,
  requestApproval
] as const;

export { ActionError, type Action, type ActionResult } from "./define";
