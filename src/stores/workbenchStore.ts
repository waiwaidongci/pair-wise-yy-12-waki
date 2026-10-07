import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  Annotation,
  AnnotationTask,
  AnnotationTool,
  LabelDefinition,
  LabelTemplate,
  Point,
  ReviewConflict,
  TaskKind,
  TextTask,
} from "../types/annotation";
import { labelsByKind, mockAnnotations, mockConflicts, mockTasks, mockTemplates } from "../data/mockData";
import {
  migrateSpanAnnotations,
  recomputeReviewConflicts,
  type RevisionReport,
} from "../utils/textRevision";
import { recomputeTextCandidates } from "../utils/textCandidates";
import { revisionArchive } from "../utils/revisionArchive";

type SaveState = "已保存" | "保存中" | "待保存";

export interface ApplyTextRevisionResult {
  ok: boolean;
  reason?: "unchanged" | "write-failed" | "not-text-task";
  revisionId?: string;
  report?: RevisionReport;
  duplicated?: boolean;
  error?: string;
}

interface WorkbenchState {
  tasks: AnnotationTask[];
  annotations: Annotation[];
  reviewConflicts: ReviewConflict[];
  templates: LabelTemplate[];
  customLabels: Record<TaskKind, LabelDefinition[]>;
  activeTaskId: string;
  activeTool: AnnotationTool;
  activeLabelId: string;
  activeTemplateId: string;
  selectedAnnotationId: string | null;
  batchSelection: string[];
  autosave: SaveState;
  lastSavedAt: string;
  zoom: number;
  pan: Point;
  history: Record<string, Annotation[][]>;
  future: Record<string, Annotation[][]>;
  reviewerVisibility: Record<string, boolean>;
  resolvedConflicts: Record<string, string>;
  reviewNotes: Record<string, string>;
  setActiveTask: (taskId: string) => void;
  nextTask: () => void;
  previousTask: () => void;
  setActiveTool: (tool: AnnotationTool) => void;
  setActiveLabel: (labelId: string) => void;
  selectAnnotation: (id: string | null) => void;
  addAnnotation: (annotation: Annotation) => void;
  updateAnnotation: (id: string, patch: Partial<Annotation>) => void;
  removeAnnotation: (id: string) => void;
  undo: () => void;
  redo: () => void;
  saveNow: () => void;
  setViewport: (zoom: number, pan: Point) => void;
  resetViewport: () => void;
  toggleBatchTask: (taskId: string) => void;
  clearBatchSelection: () => void;
  applyTemplate: (templateId: string) => void;
  createTemplate: (name: string) => void;
  addCustomLabel: (label: Omit<LabelDefinition, "id">) => void;
  toggleReviewer: (author: string) => void;
  resolveConflict: (conflictId: string, candidateId: string) => void;
  setReviewNote: (conflictId: string, note: string) => void;
  /** 接收数据组改好的稿件：区间随原文挪位/悬空留档，候选失效并重算，确认失据退回待处理 */
  applyTextRevision: (taskId: string, newContent: string) => ApplyTextRevisionResult;
}

let saveTimer: number | undefined;

function scheduleSaved(set: (state: Partial<WorkbenchState>) => void) {
  if (saveTimer) window.clearTimeout(saveTimer);
  set({ autosave: "保存中" });
  saveTimer = window.setTimeout(() => {
    set({ autosave: "已保存", lastSavedAt: new Date().toISOString() });
  }, 420);
}

function taskAnnotations(annotations: Annotation[], taskId: string): Annotation[] {
  return annotations.filter((annotation) => annotation.taskId === taskId);
}

function getTaskContent(tasks: AnnotationTask[], taskId: string): string {
  const task = tasks.find((item) => item.id === taskId);
  return task?.kind === "text" ? task.content : "";
}

/** 启动时把已落盘的修订稿合进任务，使内存从“上一版”起步 */
function tasksWithPersistedRevisions(tasks: AnnotationTask[]): AnnotationTask[] {
  const snapshot = revisionArchive.snapshot();
  if (!Object.keys(snapshot).length) return tasks;
  return tasks.map((task) => {
    const persisted = snapshot[task.id];
    if (task.kind !== "text" || !persisted) return task;
    return {
      ...task,
      content: persisted.content,
      contentVersion: persisted.version,
      lastRevisionId: persisted.lastRevisionId,
    };
  });
}

const initialTasks = tasksWithPersistedRevisions(mockTasks);

/**
 * 兼容旧持久化数据：没有锚文本的文本区间，用当前稿件对应位置的原文补锚；
 * 已落在内容范围外的（多半经历过无迁移的旧改稿）不强行补。
 */
export function backfillSpanAnchors(annotations: Annotation[], tasks: AnnotationTask[]): Annotation[] {
  return annotations.map((annotation) => {
    if (annotation.kind !== "text-span" || annotation.scope !== "span" || annotation.anchorText) return annotation;
    const task = tasks.find((item) => item.id === annotation.taskId);
    if (task?.kind !== "text") return annotation;
    if (annotation.start < 0 || annotation.end > task.content.length || annotation.start >= annotation.end) {
      return { ...annotation, anchorStatus: "dangling", anchorText: annotation.note ?? "" };
    }
    return { ...annotation, anchorText: task.content.slice(annotation.start, annotation.end), anchorStatus: "anchored" };
  });
}

const initialAnnotations = backfillSpanAnchors(mockAnnotations, initialTasks);

export const useWorkbenchStore = create<WorkbenchState>()(
  persist(
    (set, get) => ({
      tasks: initialTasks,
      annotations: initialAnnotations,
      reviewConflicts: mockConflicts,
      templates: mockTemplates,
      customLabels: { image: [], audio: [], text: [] },
      activeTaskId: mockTasks[0].id,
      activeTool: "select",
      activeLabelId: labelsByKind.image[0].id,
      activeTemplateId: mockTemplates[0].id,
      selectedAnnotationId: null,
      batchSelection: [],
      autosave: "已保存",
      lastSavedAt: new Date().toISOString(),
      zoom: 0.68,
      pan: { x: 0, y: 0 },
      history: {},
      future: {},
      reviewerVisibility: { 周岚: true, 何序: true, 陆鸣: true, 当前标注员: true },
      resolvedConflicts: {},
      reviewNotes: {},

      setActiveTask: (taskId) => {
        const task = get().tasks.find((item) => item.id === taskId);
        if (!task) return;
        const allLabels = [...labelsByKind[task.kind], ...get().customLabels[task.kind]];
        set({
          activeTaskId: taskId,
          selectedAnnotationId: null,
          activeTool: task.kind === "audio" ? "segment" : "select",
          activeLabelId: allLabels[0]?.id ?? "",
          zoom: task.kind === "image" ? 0.68 : 1,
          pan: { x: 0, y: 0 },
        });
      },

      nextTask: () => {
        const { activeTaskId, tasks, batchSelection } = get();
        const pool = batchSelection.length ? tasks.filter((task) => batchSelection.includes(task.id)) : tasks;
        const index = pool.findIndex((task) => task.id === activeTaskId);
        get().setActiveTask(pool[(index + 1 + pool.length) % pool.length]?.id ?? tasks[0].id);
      },

      previousTask: () => {
        const { activeTaskId, tasks, batchSelection } = get();
        const pool = batchSelection.length ? tasks.filter((task) => batchSelection.includes(task.id)) : tasks;
        const index = pool.findIndex((task) => task.id === activeTaskId);
        const nextIndex = index <= 0 ? pool.length - 1 : index - 1;
        get().setActiveTask(pool[nextIndex]?.id ?? tasks[0].id);
      },

      setActiveTool: (activeTool) => set({ activeTool, selectedAnnotationId: null }),
      setActiveLabel: (activeLabelId) => set({ activeLabelId }),
      selectAnnotation: (selectedAnnotationId) => set({ selectedAnnotationId }),

      addAnnotation: (annotation) => {
        const taskId = annotation.taskId;
        const current = taskAnnotations(get().annotations, taskId);
        // 文本区间记下最初对应的原文，改稿时据此挪位
        const withAnchor =
          annotation.kind === "text-span" && annotation.scope === "span"
            ? {
                ...annotation,
                anchorText: getTaskContent(get().tasks, taskId).slice(annotation.start, annotation.end),
                anchorStatus: "anchored" as const,
              }
            : annotation;
        set((state) => ({
          annotations: [...state.annotations, withAnchor],
          selectedAnnotationId: withAnchor.id,
          history: { ...state.history, [taskId]: [...(state.history[taskId] ?? []), structuredClone(current)].slice(-30) },
          future: { ...state.future, [taskId]: [] },
        }));
        scheduleSaved(set);
      },

      updateAnnotation: (id, patch) => {
        const target = get().annotations.find((annotation) => annotation.id === id);
        if (!target) return;
        const current = taskAnnotations(get().annotations, target.taskId);
        set((state) => ({
          annotations: state.annotations.map((annotation) => (annotation.id === id ? ({ ...annotation, ...patch } as Annotation) : annotation)),
          history: { ...state.history, [target.taskId]: [...(state.history[target.taskId] ?? []), structuredClone(current)].slice(-30) },
          future: { ...state.future, [target.taskId]: [] },
        }));
        scheduleSaved(set);
      },

      removeAnnotation: (id) => {
        const target = get().annotations.find((annotation) => annotation.id === id);
        if (!target) return;
        const current = taskAnnotations(get().annotations, target.taskId);
        set((state) => ({
          annotations: state.annotations.filter((annotation) => annotation.id !== id),
          selectedAnnotationId: state.selectedAnnotationId === id ? null : state.selectedAnnotationId,
          history: { ...state.history, [target.taskId]: [...(state.history[target.taskId] ?? []), structuredClone(current)].slice(-30) },
          future: { ...state.future, [target.taskId]: [] },
        }));
        scheduleSaved(set);
      },

      undo: () => {
        const taskId = get().activeTaskId;
        const stack = get().history[taskId] ?? [];
        if (!stack.length) return;
        const previous = stack[stack.length - 1];
        const current = taskAnnotations(get().annotations, taskId);
        set((state) => ({
          annotations: [...state.annotations.filter((annotation) => annotation.taskId !== taskId), ...structuredClone(previous)],
          history: { ...state.history, [taskId]: stack.slice(0, -1) },
          future: { ...state.future, [taskId]: [structuredClone(current), ...(state.future[taskId] ?? [])].slice(0, 30) },
          selectedAnnotationId: null,
        }));
        scheduleSaved(set);
      },

      redo: () => {
        const taskId = get().activeTaskId;
        const stack = get().future[taskId] ?? [];
        if (!stack.length) return;
        const next = stack[0];
        const current = taskAnnotations(get().annotations, taskId);
        set((state) => ({
          annotations: [...state.annotations.filter((annotation) => annotation.taskId !== taskId), ...structuredClone(next)],
          future: { ...state.future, [taskId]: stack.slice(1) },
          history: { ...state.history, [taskId]: [...(state.history[taskId] ?? []), structuredClone(current)].slice(-30) },
          selectedAnnotationId: null,
        }));
        scheduleSaved(set);
      },

      saveNow: () => {
        if (saveTimer) window.clearTimeout(saveTimer);
        set({ autosave: "已保存", lastSavedAt: new Date().toISOString() });
      },

      setViewport: (zoom, pan) => set({ zoom, pan }),
      resetViewport: () => set({ zoom: 0.68, pan: { x: 0, y: 0 } }),
      toggleBatchTask: (taskId) =>
        set((state) => ({
          batchSelection: state.batchSelection.includes(taskId)
            ? state.batchSelection.filter((id) => id !== taskId)
            : [...state.batchSelection, taskId],
        })),
      clearBatchSelection: () => set({ batchSelection: [] }),

      applyTemplate: (templateId) => {
        const template = get().templates.find((item) => item.id === templateId);
        if (!template) return;
        set({ activeTemplateId: template.id, activeLabelId: template.labelIds[0] ?? get().activeLabelId });
      },

      createTemplate: (name) => {
        const task = get().tasks.find((item) => item.id === get().activeTaskId);
        if (!task) return;
        const allLabels = [...labelsByKind[task.kind], ...get().customLabels[task.kind]];
        const template: LabelTemplate = {
          id: `template-${Date.now()}`,
          name,
          kind: task.kind,
          labelIds: allLabels.map((label) => label.id),
        };
        set((state) => ({ templates: [...state.templates, template], activeTemplateId: template.id }));
      },

      addCustomLabel: (label) => {
        const task = get().tasks.find((item) => item.id === get().activeTaskId);
        if (!task) return;
        const definition: LabelDefinition = { ...label, id: `${task.kind}-custom-${Date.now()}` };
        set((state) => ({
          customLabels: { ...state.customLabels, [task.kind]: [...state.customLabels[task.kind], definition] },
          activeLabelId: definition.id,
        }));
      },

      toggleReviewer: (author) =>
        set((state) => ({
          reviewerVisibility: { ...state.reviewerVisibility, [author]: !state.reviewerVisibility[author] },
        })),

      resolveConflict: (conflictId, candidateId) =>
        set((state) => {
          const conflict = state.reviewConflicts.find((item) => item.id === conflictId);
          const candidate = conflict?.candidates.find((item) => item.id === candidateId);
          // 已失效的候选不能再被确认
          if (!conflict || candidate?.status === "invalidated") return state;
          return {
            resolvedConflicts: { ...state.resolvedConflicts, [conflictId]: candidateId },
            reviewConflicts: state.reviewConflicts.map((item) =>
              item.id === conflictId ? { ...item, status: "已确认" as const } : item,
            ),
          };
        }),
      setReviewNote: (conflictId, note) =>
        set((state) => ({ reviewNotes: { ...state.reviewNotes, [conflictId]: note } })),

      applyTextRevision: (taskId, newContent) => {
        const task = get().tasks.find((item) => item.id === taskId);
        if (!task || task.kind !== "text") return { ok: false, reason: "not-text-task" };
        const oldContent = task.content;
        const fromVersion = task.contentVersion ?? 0;

        // 与当前稿件相同：只有当这是此前已落档修订的重复送达时才按幂等成功返回，
        // 否则就是没有新内容，不产生新版本
        const latest = revisionArchive.latestForTask(taskId);
        if (newContent === oldContent) {
          if (latest?.newContent === newContent) {
            return { ok: true, duplicated: true, revisionId: latest.revisionId, report: latest.report };
          }
          return { ok: false, reason: "unchanged" };
        }
        const revisionId = `rev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

        // 先在内存里算好迁移结果（尚未生效）
        const spanMigration = migrateSpanAnnotations(get().annotations, taskId, oldContent, newContent, revisionId);
        const conflictMigration = recomputeReviewConflicts(
          get().reviewConflicts,
          taskId,
          newContent,
          revisionId,
          recomputeTextCandidates,
        );

        const report: RevisionReport = {
          revisionId,
          taskId,
          oldVersion: fromVersion,
          newVersion: fromVersion + 1,
          moved: spanMigration.moved,
          dangled: spanMigration.dangled,
          invalidatedCandidates: conflictMigration.invalidatedCandidates,
          recomputedCandidates: conflictMigration.recomputedCandidates,
          reopenedConflicts: conflictMigration.reopenedConflicts,
        };

        // 先落盘：失败则上一版原样保留，内存一个字段都不动
        const committed = revisionArchive.commit({
          revisionId,
          taskId,
          fromVersion,
          oldContent,
          newContent,
          report,
        });
        if (!committed.ok) {
          return { ok: false, reason: "write-failed", error: committed.error };
        }
        // 同一修订重试：落盘侧已幂等，内存也不重复追加/迁移
        if (committed.duplicated) {
          return { ok: true, duplicated: true, revisionId: committed.entry.revisionId, report: committed.entry.report };
        }

        // 已确认但依据消失的冲突退回待处理
        const resolvedConflicts = { ...get().resolvedConflicts };
        for (const reopened of conflictMigration.reopenedConflicts) delete resolvedConflicts[reopened];

        set((state) => ({
          tasks: state.tasks.map((item) =>
            item.id === taskId && item.kind === "text"
              ? ({
                  ...item,
                  content: newContent,
                  contentVersion: fromVersion + 1,
                  lastRevisionId: revisionId,
                  updatedAt: new Date().toISOString(),
                } satisfies TextTask)
              : item,
          ),
          annotations: spanMigration.annotations,
          reviewConflicts: conflictMigration.conflicts,
          resolvedConflicts,
          history: { ...state.history, [taskId]: [] },
          future: { ...state.future, [taskId]: [] },
          selectedAnnotationId: null,
        }));
        scheduleSaved(set);
        return { ok: true, revisionId, report };
      },
    }),
    {
      name: "annotation-workbench-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        annotations: state.annotations,
        reviewConflicts: state.reviewConflicts,
        customLabels: state.customLabels,
        templates: state.templates,
        activeTaskId: state.activeTaskId,
        reviewerVisibility: state.reviewerVisibility,
        resolvedConflicts: state.resolvedConflicts,
        reviewNotes: state.reviewNotes,
        batchSelection: state.batchSelection,
      }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<WorkbenchState>;
        const merged: WorkbenchState = {
          ...current,
          ...saved,
          // 旧持久化里没有审核冲突时，沿用当前内置冲突，避免审核页读空
          reviewConflicts: saved.reviewConflicts ?? current.reviewConflicts,
        };
        // 旧持久化里的文本区间可能没有锚文本，按当前稿件回填
        merged.annotations = backfillSpanAnchors(merged.annotations, merged.tasks);
        return merged;
      },
    },
  ),
);

export function labelsForTask(taskKind: TaskKind, customLabels: Record<TaskKind, LabelDefinition[]>): LabelDefinition[] {
  return [...labelsByKind[taskKind], ...customLabels[taskKind]];
}

export function allReviewConflicts(): ReviewConflict[] {
  return useWorkbenchStore.getState().reviewConflicts;
}
