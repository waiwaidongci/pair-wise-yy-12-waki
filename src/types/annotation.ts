export type TaskKind = "image" | "audio" | "text";
export type TaskStatus = "待标注" | "标注中" | "待审核" | "已完成";
export type AnnotationTool = "select" | "bbox" | "polygon" | "keypoint" | "segment";

export interface Point {
  x: number;
  y: number;
}

export interface LabelDefinition {
  id: string;
  name: string;
  color: string;
  hotkey: string;
  description: string;
}

export interface AnnotationBase {
  id: string;
  taskId: string;
  labelId: string;
  author: string;
  createdAt: string;
  confidence?: number;
}

export interface BBoxAnnotation extends AnnotationBase {
  kind: "bbox";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PolygonAnnotation extends AnnotationBase {
  kind: "polygon";
  points: Point[];
}

export interface KeypointAnnotation extends AnnotationBase {
  kind: "keypoint";
  point: Point;
}

export interface AudioSegmentAnnotation extends AnnotationBase {
  kind: "audio-segment";
  start: number;
  end: number;
  transcript?: string;
}

export interface TextSpanAnnotation extends AnnotationBase {
  kind: "text-span";
  start: number;
  end: number;
  scope: "span" | "document";
  note?: string;
  /** 悬空区间：原所指文字在新稿件中整段不存在，区间保留归档但不再高亮 */
  dangling?: boolean;
  /** 悬空/重锚定时区间原先对应的那段文字 */
  anchorText?: string;
  /** 悬空原因（整段删除、重锚定失败等） */
  danglingReason?: string;
  /** 最近一次应用的稿件修订 id */
  revisionId?: string;
  danglingAt?: string;
}

export type Annotation =
  | BBoxAnnotation
  | PolygonAnnotation
  | KeypointAnnotation
  | AudioSegmentAnnotation
  | TextSpanAnnotation;

interface TaskBase {
  id: string;
  kind: TaskKind;
  title: string;
  batch: string;
  instruction: string;
  status: TaskStatus;
  priority: "普通" | "高" | "紧急";
  updatedAt: string;
}

export interface ImageTask extends TaskBase {
  kind: "image";
  width: number;
  height: number;
  imageSeed: number;
}

export interface AudioTask extends TaskBase {
  kind: "audio";
  duration: number;
  audioSeed: number;
  speaker: string;
  transcriptHint: string;
}

export interface TextTask extends TaskBase {
  kind: "text";
  content: string;
  source: string;
}

export type AnnotationTask = ImageTask | AudioTask | TextTask;

export interface LabelTemplate {
  id: string;
  name: string;
  kind: TaskKind;
  labelIds: string[];
}

export interface ReviewCandidate {
  id: string;
  author: string;
  labelId: string;
  value: string;
  confidence: number;
  /** 依据已随稿件修订失效，等待按新稿件重算 */
  invalid?: boolean;
}

/** 一次稿件修订的留档记录 */
export interface TextRevisionRecord {
  id: string;
  taskId: string;
  at: string;
  source: string;
  /** 重锚定成功（含位置移动）的区间数 */
  reanchored: number;
  /** 所指文字未变、无需移动的区间数 */
  unchanged: number;
  /** 整段被拿掉、标为悬空的区间数 */
  dangling: number;
  /** 文档级标签数（随稿件长度平移） */
  documentLabels: number;
}

/** 冲突依据文本在新稿件中的状态 */
export type ConflictBasisState = "ok" | "moved" | "invalid";

export interface ConflictBasisStatus {
  state: ConflictBasisState;
  /** 冲突依据的原文（从 target / 候选描述中抽取的引用片段） */
  basisText: string;
  checkedAt: string;
  /** 依据在新稿件中移动后的新文本（重算成功时写入） */
  resolvedText?: string;
  reason?: string;
}

export interface ReviewConflict {
  id: string;
  taskId: string;
  target: string;
  severity: "轻微" | "一般" | "严重";
  candidates: ReviewCandidate[];
  /** 稿件修订重算后，被替换下来的原候选（留档可查） */
  archivedCandidates?: ReviewCandidate[];
}

export interface AnnotationDraft {
  kind: AnnotationTool;
  points: Point[];
  bbox?: { x: number; y: number; width: number; height: number };
}
