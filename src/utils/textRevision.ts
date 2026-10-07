import type {
  Annotation,
  ReviewCandidate,
  ReviewConflict,
  TextSpanAnnotation,
} from "../types/annotation";

/**
 * 数据组修订稿件后的迁移逻辑：
 * - 句子增删或前后调换时，按每条区间原先对应的原文（anchorText）重新对位到新位置；
 * - 原文被整段拿掉的区间不删除，标成 dangling（悬空）并留档；
 * - 候选随稿件重算：依据文字被移除的候选直接失效，新稿件上重新计算候选；
 * - 已确认但依据不在的冲突退回待处理。
 */

export interface RevisionReport {
  revisionId: string;
  taskId: string;
  oldVersion: number;
  newVersion: number;
  moved: string[];
  dangled: string[];
  invalidatedCandidates: string[];
  recomputedCandidates: string[];
  reopenedConflicts: string[];
}

export interface CandidateComputerInput {
  taskId: string;
  content: string;
  revisionId: string;
}

export interface CandidateComputerResult {
  conflictId: string;
  target: string;
  evidenceText: string;
  candidates: Array<Pick<ReviewCandidate, "author" | "labelId" | "value" | "confidence">>;
}

/** 候选重算器：按新稿件重新给出审核候选；未提供时只失效不补算 */
export type CandidateComputer = (input: CandidateComputerInput) => CandidateComputerResult[];

function isSpan(annotation: Annotation): annotation is TextSpanAnnotation {
  return annotation.kind === "text-span" && annotation.scope === "span";
}

/**
 * 按区间原先对应的文字在新稿件中查找新位置。
 * 句子调换时同一文字可能多处出现，优先选择与旧位置最接近的一处，保持对位稳定。
 */
export function relocateByText(
  content: string,
  anchor: string,
  previousStart: number,
): { start: number; end: number } | null {
  if (!anchor) return null;
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  let from = 0;
  for (;;) {
    const index = content.indexOf(anchor, from);
    if (index < 0) break;
    const distance = Math.abs(index - previousStart);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
    from = index + anchor.length;
  }
  if (bestIndex < 0) return null;
  return { start: bestIndex, end: bestIndex + anchor.length };
}

function spanAnchor(span: TextSpanAnnotation, oldContent: string): string {
  return span.anchorText ?? oldContent.slice(span.start, span.end) ?? "";
}

/** 迁移一个文本任务下的区间标注：随原文挪位，原文消失则悬空留档 */
export function migrateSpanAnnotations(
  annotations: Annotation[],
  taskId: string,
  oldContent: string,
  newContent: string,
  revisionId: string,
): { annotations: Annotation[]; moved: string[]; dangled: string[] } {
  const moved: string[] = [];
  const dangled: string[] = [];
  const next = annotations.map((annotation) => {
    if (annotation.taskId !== taskId || !isSpan(annotation)) return annotation;
    const anchor = spanAnchor(annotation, oldContent);
    const relocated = relocateByText(newContent, anchor, annotation.start);
    if (!relocated) {
      dangled.push(annotation.id);
      return {
        ...annotation,
        anchorText: anchor,
        anchorStatus: "dangling" as const,
        dangledByRevision: revisionId,
      };
    }
    if (relocated.start !== annotation.start || relocated.end !== annotation.end) {
      moved.push(annotation.id);
    }
    return {
      ...annotation,
      start: relocated.start,
      end: relocated.end,
      anchorText: anchor,
      anchorStatus: "anchored" as const,
      anchoredByRevision: revisionId,
      dangledByRevision: undefined,
    };
  });
  return { annotations: next, moved, dangled };
}

function evidenceExists(content: string, evidence: string | undefined): boolean {
  return Boolean(evidence && content.includes(evidence));
}

/** 审核候选随新稿件重算：依据被移除的候选失效，其余候选重算替换，已确认失据的退回待处理 */
export function recomputeReviewConflicts(
  conflicts: ReviewConflict[],
  taskId: string,
  newContent: string,
  revisionId: string,
  compute?: CandidateComputer,
): {
  conflicts: ReviewConflict[];
  invalidatedCandidates: string[];
  recomputedCandidates: string[];
  reopenedConflicts: string[];
} {
  const invalidatedCandidates: string[] = [];
  const recomputedCandidates: string[] = [];
  const reopenedConflicts: string[] = [];

  const results = compute?.({ taskId, content: newContent, revisionId }) ?? [];
  const byConflict = new Map(results.map((result) => [result.conflictId, result]));

  const next = conflicts.map((conflict) => {
    if (conflict.taskId !== taskId) return conflict;

    const recomputed = byConflict.get(conflict.id);
    const evidence = recomputed?.evidenceText ?? conflict.evidenceText;
    const evidenceStillThere = evidenceExists(newContent, evidence);

    let candidates: ReviewCandidate[];
    if (recomputed) {
      // 按新稿件重算：旧候选直接失效并留档，重算候选为有效候选
      candidates = [
        ...conflict.candidates.map((candidate) => {
          if (candidate.status === "invalidated") return candidate;
          invalidatedCandidates.push(candidate.id);
          return { ...candidate, status: "invalidated" as const, invalidatedByRevision: revisionId };
        }),
        ...recomputed.candidates.map((candidate, index) => ({
          ...candidate,
          id: `${conflict.id}-rc-${revisionId}-${index}`,
          status: "active" as const,
          recomputed: true,
        })),
      ];
      recomputedCandidates.push(...recomputed.candidates.map((_, index) => `${conflict.id}-rc-${revisionId}-${index}`));
    } else {
      // 没有重算结果：仅把建在被移除文字上的候选直接失效
      candidates = conflict.candidates.map((candidate) => {
        if (candidate.status === "invalidated" || evidenceStillThere) return candidate;
        invalidatedCandidates.push(candidate.id);
        return { ...candidate, status: "invalidated" as const, invalidatedByRevision: revisionId };
      });
    }

    // 已确认但依据不在新稿件中：退回待处理
    let status = conflict.status;
    if (conflict.status === "已确认" && !evidenceStillThere) {
      status = "待处理";
      reopenedConflicts.push(conflict.id);
    }

    return {
      ...conflict,
      target: recomputed?.target ?? conflict.target,
      evidenceText: evidence,
      candidates,
      status,
      recomputedByRevision: recomputed ? revisionId : conflict.recomputedByRevision,
    };
  });

  return { conflicts: next, invalidatedCandidates, recomputedCandidates, reopenedConflicts };
}
