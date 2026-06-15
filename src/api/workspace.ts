import type { WorkspaceData } from "../types";
import { apiFetch } from "./core";

export async function getWorkspace() {
  return apiFetch<WorkspaceData>("/auth/workspace");
}

