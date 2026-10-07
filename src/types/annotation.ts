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
}

export interface ReviewConflict {
  id: string;
  taskId: string;
  target: string;
  severity: "轻微" | "一般" | "严重";
  candidates: ReviewCandidate[];
}

export interface AnnotationDraft {
  kind: AnnotationTool;
  points: Point[];
  bbox?: { x: number; y: number; width: number; height: number };
}
