import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  Annotation,
  AnnotationTask,
  AnnotationTool,
  LabelDefinition,
  LabelTemplate,
  Point,
  TaskKind,
} from "../types/annotation";
import { labelsByKind, mockAnnotations, mockConflicts, mockTasks, mockTemplates } from "../data/mockData";

type SaveState = "已保存" | "保存中" | "待保存";

interface WorkbenchState {
  tasks: AnnotationTask[];
  annotations: Annotation[];
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

export const useWorkbenchStore = create<WorkbenchState>()(
  persist(
    (set, get) => ({
      tasks: mockTasks,
      annotations: mockAnnotations,
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
        set((state) => ({
          annotations: [...state.annotations, annotation],
          selectedAnnotationId: annotation.id,
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
        set({ activeTemplateId: templateId, activeLabelId: template.labelIds[0] ?? get().activeLabelId });
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
        set((state) => ({ resolvedConflicts: { ...state.resolvedConflicts, [conflictId]: candidateId } })),
      setReviewNote: (conflictId, note) =>
        set((state) => ({ reviewNotes: { ...state.reviewNotes, [conflictId]: note } })),
    }),
    {
      name: "annotation-workbench-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        annotations: state.annotations,
        customLabels: state.customLabels,
        templates: state.templates,
        activeTaskId: state.activeTaskId,
        reviewerVisibility: state.reviewerVisibility,
        resolvedConflicts: state.resolvedConflicts,
        reviewNotes: state.reviewNotes,
        batchSelection: state.batchSelection,
      }),
    },
  ),
);

export function labelsForTask(taskKind: TaskKind, customLabels: Record<TaskKind, LabelDefinition[]>): LabelDefinition[] {
  return [...labelsByKind[taskKind], ...customLabels[taskKind]];
}

export function allReviewConflicts() {
  return mockConflicts;
}
