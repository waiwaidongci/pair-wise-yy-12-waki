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

export type SpanAnchorStatus = "anchored" | "dangling";

export interface TextSpanAnnotation extends AnnotationBase {
  kind: "text-span";
  start: number;
  end: number;
  scope: "span" | "document";
  note?: string;
  /** 区间最初对应的那段原文，稿件改版时据此重新对位 */
  anchorText?: string;
  /** anchored：已对位到当前稿件；dangling：原文字被整段移除，区间悬空留档 */
  anchorStatus?: SpanAnchorStatus;
  /** 最近一次把区间挪到新位置的修订批次 */
  anchoredByRevision?: string;
  /** 悬空时所属的修订批次，便于留档可查 */
  dangledByRevision?: string;
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
  /** 当前稿件版本号，每次接收修订 +1 */
  contentVersion?: number;
  /** 当前稿件对应的最近一次修订批次 ID */
  lastRevisionId?: string;
}

export type AnnotationTask = ImageTask | AudioTask | TextTask;

export interface LabelTemplate {
  id: string;
  name: string;
  kind: TaskKind;
  labelIds: string[];
}

export type CandidateStatus = "active" | "invalidated";

export interface ReviewCandidate {
  id: string;
  author: string;
  labelId: string;
  value: string;
  confidence: number;
  /** active：依据仍在当前稿件；invalidated：依据文字被移除而直接失效（留档） */
  status?: CandidateStatus;
  /** 失效所属的修订批次 */
  invalidatedByRevision?: string;
  /** 该候选是否来自按新稿件的重算结果 */
  recomputed?: boolean;
}

export type ConflictStatus = "待处理" | "已确认";

export interface ReviewConflict {
  id: string;
  taskId: string;
  target: string;
  severity: "轻微" | "一般" | "严重";
  candidates: ReviewCandidate[];
  /** 候选共同依据的原文片段，改稿后据此判断依据是否还在 */
  evidenceText?: string;
  /** 已确认但依据在改版中消失时，自动退回待处理 */
  status?: ConflictStatus;
  /** 最近一次重算所属的修订批次 */
  recomputedByRevision?: string;
}

export interface AnnotationDraft {
  kind: AnnotationTool;
  points: Point[];
  bbox?: { x: number; y: number; width: number; height: number };
}
