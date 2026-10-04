import type { AnyAction } from "./define";
import { searchGrants, setGrantStatus } from "./grants";
import { listNotifications } from "./notifications";
import { getNote, searchNotes } from "./notes";
import { contactWarmPaths, findWarmPath, searchContacts } from "./people";
import {
  createProject,
  dueTasks,
  getProject,
  listProjects,
  listTasks,
  updateTask
} from "./projects";
import { getCompany, passCompany, searchCompanies, shortlistCompany, starCompany } from "./radar";
import { createCapture, createTask, listApprovals, setTaskStatus } from "./work";

// The named actions the chat assistant may call. Reads run straight away. Writes never run from
// the chat: the assistant queues them with requestApproval, and they run only when Simone taps
// Approve (decideApproval carries them out). Nothing here sends anything outside the app.

export const CHAT_READ_ACTIONS: AnyAction[] = [
  searchCompanies,
  getCompany,
  searchGrants,
  searchContacts,
  findWarmPath,
  contactWarmPaths,
  listNotifications,
  searchNotes,
  getNote,
  listTasks,
  dueTasks,
  listProjects,
  getProject,
  listApprovals
];

export const CHAT_APPROVAL_ACTIONS: AnyAction[] = [
  starCompany,
  shortlistCompany,
  passCompany,
  setGrantStatus,
  createTask,
  setTaskStatus,
  updateTask,
  createProject,
  createCapture
];

// The writes an approval may carry out, by action name.
export function approvableAction(name: string): AnyAction | undefined {
  return CHAT_APPROVAL_ACTIONS.find((a) => a.name === name);
}
