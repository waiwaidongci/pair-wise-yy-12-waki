import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  Annotation,
  AnnotationTask,
  AnnotationTool,
  ConflictBasisStatus,
  LabelDefinition,
  LabelTemplate,
  Point,
  ReviewConflict,
  TaskKind,
  TextRevisionRecord,
  TextSpanAnnotation,
} from "../types/annotation";
import { labelsByKind, mockAnnotations, mockConflicts, mockTasks, mockTemplates } from "../data/mockData";
import { createSafeStorage, type PersistStatus } from "../utils/safeStorage";
import { reanchorSpans, revalidateConflict } from "../utils/textRevision";

type SaveState = "已保存" | "保存中" | "待保存" | "保存失败";

interface WorkbenchState {
  tasks: AnnotationTask[];
  annotations: Annotation[];
  templates: LabelTemplate[];
  conflicts: ReviewConflict[];
  /** 文本任务的稿件修订留档，按 taskId 分组，最新在前 */
  textRevisions: Record<string, TextRevisionRecord[]>;
  /** 冲突依据文本在最近一次稿件修订后的状态 */
  conflictBasis: Record<string, ConflictBasisStatus>;
  customLabels: Record<TaskKind, LabelDefinition[]>;
  activeTaskId: string;
  activeTool: AnnotationTool;
  activeLabelId: string;
  activeTemplateId: string;
  selectedAnnotationId: string | null;
  batchSelection: string[];
  autosave: SaveState;
  lastSavedAt: string;
  persistStatus: PersistStatus;
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
  retryPersist: () => void;
  reviseTextTask: (taskId: string, newContent: string, options?: { source?: string; simulateFailure?: boolean }) => void;
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

const safeStorage = createSafeStorage();

let saveTimer: number | undefined;

function scheduleSaved(set: (state: Partial<WorkbenchState>) => void) {
  if (saveTimer) window.clearTimeout(saveTimer);
  set({ autosave: "保存中" });
  saveTimer = window.setTimeout(() => {
    const failed = safeStorage.getStatus().pending;
    set({
      autosave: failed ? "保存失败" : "已保存",
      lastSavedAt: failed ? useWorkbenchStore.getState().lastSavedAt : new Date().toISOString(),
    });
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
      conflicts: mockConflicts,
      textRevisions: {},
      conflictBasis: {},
      customLabels: { image: [], audio: [], text: [] },
      activeTaskId: mockTasks[0].id,
      activeTool: "select",
      activeLabelId: labelsByKind.image[0].id,
      activeTemplateId: mockTemplates[0].id,
      selectedAnnotationId: null,
      batchSelection: [],
      autosave: "已保存",
      lastSavedAt: new Date().toISOString(),
      persistStatus: safeStorage.getStatus(),
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
        if (safeStorage.getStatus().pending) {
          get().retryPersist();
          return;
        }
        set({ autosave: "已保存", lastSavedAt: new Date().toISOString() });
      },

      retryPersist: () => {
        if (saveTimer) window.clearTimeout(saveTimer);
        set({ autosave: "保存中" });
        safeStorage.retry();
        const status = safeStorage.getStatus();
        set({
          persistStatus: status,
          autosave: status.pending ? "保存失败" : "已保存",
          lastSavedAt: status.pending ? get().lastSavedAt : new Date().toISOString(),
        });
      },

      reviseTextTask: (taskId, newContent, options) => {
        const task = get().tasks.find((item) => item.id === taskId);
        if (!task || task.kind !== "text") return;
        const oldContent = task.content;
        // 幂等：内容未变不产生任何追加，重试不会重复落修订
        if (newContent === oldContent) return;

        const now = new Date().toISOString();
        const revisionId = `rev-${Date.now()}`;
        const existingSpans = get()
          .annotations.filter(
            (annotation): annotation is TextSpanAnnotation =>
              annotation.taskId === taskId && annotation.kind === "text-span" && annotation.scope === "span" && !annotation.dangling,
          );
        const outcomes = reanchorSpans(oldContent, newContent, existingSpans);
        const outcomeById = new Map(outcomes.map((outcome) => [outcome.annotationId, outcome]));

        let reanchored = 0;
        let unchanged = 0;
        let dangling = 0;
        let documentLabels = 0;
        const nextAnnotations = get().annotations.map((annotation) => {
          if (annotation.taskId !== taskId || annotation.kind !== "text-span") return annotation;
          const span = annotation as TextSpanAnnotation;
          if (span.scope === "document") {
            documentLabels += 1;
            // 文档级标签覆盖全文，随新稿件长度平移
            return { ...span, end: newContent.length, revisionId };
          }
          if (span.dangling) return span; // 已悬空的区间继续留档，不重复处理
          const outcome = outcomeById.get(span.id);
          if (!outcome) return span;
          if (outcome.status === "dangling") {
            dangling += 1;
            return {
              ...span,
              dangling: true,
              start: outcome.start,
              end: outcome.end,
              anchorText: outcome.anchorText,
              danglingReason: outcome.reason,
              danglingAt: now,
              revisionId,
            };
          }
          if (outcome.status === "moved") {
            reanchored += 1;
            return {
              ...span,
              start: outcome.start,
              end: outcome.end,
              anchorText: outcome.anchorText,
              dangling: false,
              danglingReason: undefined,
              revisionId,
            };
          }
          unchanged += 1;
          return { ...span, revisionId };
        });

        // 冲突依据重校验：失效候选作废重算，已确认但依据不在的退回待处理
        const nextConflicts = [...get().conflicts];
        const nextBasis = { ...get().conflictBasis };
        const nextResolved = { ...get().resolvedConflicts };
        for (const conflict of get().conflicts.filter((item) => item.taskId === taskId)) {
          const result = revalidateConflict(conflict, newContent);
          nextBasis[conflict.id] = {
            state: result.state,
            basisText: result.basisText,
            checkedAt: now,
            resolvedText: result.resolvedText,
            reason: result.reason,
          };
          if (result.state === "ok") continue;
          const index = nextConflicts.findIndex((item) => item.id === conflict.id);
          if (index < 0) continue;
          if (result.state === "moved" && result.candidates) {
            const recalculated = result.candidates;
            nextConflicts[index] = {
              ...conflict,
              target: result.target ?? conflict.target,
              candidates: recalculated,
              archivedCandidates: conflict.candidates,
            };
            // 已确认的候选被重算替换：把确认关系平移到同作者的新候选，找不到则退回待处理
            const resolvedId = nextResolved[conflict.id];
            if (resolvedId) {
              const previous = conflict.candidates.find((candidate) => candidate.id === resolvedId);
              const replacement = recalculated.find((candidate) => candidate.author === previous?.author);
              if (replacement) nextResolved[conflict.id] = replacement.id;
              else delete nextResolved[conflict.id];
            }
          } else {
            // 依据整段消失：候选直接失效；已确认的退回待处理
            nextConflicts[index] = {
              ...conflict,
              candidates: conflict.candidates.map((candidate) => ({ ...candidate, invalid: true })),
            };
            delete nextResolved[conflict.id];
          }
        }

        const record: TextRevisionRecord = {
          id: revisionId,
          taskId,
          at: now,
          source: options?.source ?? "数据组修订",
          reanchored,
          unchanged,
          dangling,
          documentLabels,
        };

        if (options?.simulateFailure) safeStorage.armFailure();

        set((state) => ({
          tasks: state.tasks.map((item) =>
            item.id === taskId ? { ...item, content: newContent, updatedAt: now } : item,
          ),
          annotations: nextAnnotations,
          conflicts: nextConflicts,
          conflictBasis: nextBasis,
          resolvedConflicts: nextResolved,
          textRevisions: {
            ...state.textRevisions,
            [taskId]: [record, ...(state.textRevisions[taskId] ?? [])],
          },
        }));
        scheduleSaved(set);
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
      storage: createJSONStorage(() => safeStorage.storage),
      partialize: (state) => ({
        annotations: state.annotations,
        customLabels: state.customLabels,
        templates: state.templates,
        conflicts: state.conflicts,
        textRevisions: state.textRevisions,
        conflictBasis: state.conflictBasis,
        activeTaskId: state.activeTaskId,
        reviewerVisibility: state.reviewerVisibility,
        resolvedConflicts: state.resolvedConflicts,
        reviewNotes: state.reviewNotes,
        batchSelection: state.batchSelection,
      }),
    },
  ),
);

safeStorage.subscribe((status) => {
  useWorkbenchStore.setState({
    persistStatus: status,
    autosave: status.pending ? "保存失败" : "已保存",
  });
});

export function labelsForTask(taskKind: TaskKind, customLabels: Record<TaskKind, LabelDefinition[]>): LabelDefinition[] {
  return [...labelsByKind[taskKind], ...customLabels[taskKind]];
}

export function allReviewConflicts() {
  return mockConflicts;
}
