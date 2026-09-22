import { passCompany, searchCompanies, shortlistCompany } from "./radar";
import { searchGrants, setGrantStatus } from "./grants";
import { findWarmPath, searchContacts } from "./people";
import {
  classifyCapture,
  createCapture,
  createTask,
  requestApproval,
  setTaskStatus
} from "./work";

export {
  searchCompanies,
  shortlistCompany,
  passCompany,
  searchGrants,
  setGrantStatus,
  searchContacts,
  findWarmPath,
  createCapture,
  classifyCapture,
  createTask,
  setTaskStatus,
  requestApproval
};

// Every named action, for the phase-2 agent to wrap as tools.
export const allActions = [
  searchCompanies,
  shortlistCompany,
  passCompany,
  searchGrants,
  setGrantStatus,
  searchContacts,
  findWarmPath,
  createCapture,
  classifyCapture,
  createTask,
  setTaskStatus,
  requestApproval
] as const;

export { ActionError, type Action, type ActionResult } from "./define";
