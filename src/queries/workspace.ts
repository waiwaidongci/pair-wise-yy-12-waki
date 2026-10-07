import { useQuery } from "@tanstack/react-query";

export interface WorkspaceSummary {
  projectName: string;
  projectCode: string;
  reviewer: string;
  dueAt: string;
  completedToday: number;
  qualityScore: number;
}

async function fetchWorkspaceSummary(): Promise<WorkspaceSummary> {
  await new Promise((resolve) => window.setTimeout(resolve, 320));
  return {
    projectName: "城市道路目标复核 2026-10",
    projectCode: "CV-ROAD-1048",
    reviewer: "审核员 林澈",
    dueAt: "10 月 9 日 18:00",
    completedToday: 42,
    qualityScore: 96.8,
  };
}

export function useWorkspaceSummary() {
  return useQuery({
    queryKey: ["workspace-summary"],
    queryFn: fetchWorkspaceSummary,
  });
}
