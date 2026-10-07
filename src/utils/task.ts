import type { AnnotationTask, TaskKind } from "../types/annotation";

export const taskKindLabels: Record<TaskKind, string> = {
  image: "图像",
  audio: "音频",
  text: "文本",
};

export function formatRelativeTime(value: string): string {
  const elapsed = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.floor(elapsed / 60_000));
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

export function taskProgress(taskId: string, annotations: { taskId: string }[]): number {
  const count = annotations.filter((item) => item.taskId === taskId).length;
  return Math.min(100, Math.round((count / 8) * 100));
}

export function taskSummary(task: AnnotationTask): string {
  if (task.kind === "image") return `${task.width} × ${task.height} · ${task.batch}`;
  if (task.kind === "audio") return `${Math.floor(task.duration / 60)}:${String(Math.floor(task.duration % 60)).padStart(2, "0")} · ${task.speaker}`;
  return `${task.content.length.toLocaleString("zh-CN")} 字 · ${task.source}`;
}

export function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remainder = Math.floor(safe % 60);
  const tenths = Math.floor((safe % 1) * 10);
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}.${tenths}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
