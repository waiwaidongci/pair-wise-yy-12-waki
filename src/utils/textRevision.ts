import type { ReviewCandidate, ReviewConflict, TextSpanAnnotation } from "../types/annotation";

/** 区间重锚定结果 */
export interface ReanchorOutcome {
  annotationId: string;
  /** moved: 文字在新稿件中找到且位置移动；unchanged: 位置未变；dangling: 整段文字在新稿件中不存在 */
  status: "moved" | "unchanged" | "dangling";
  start: number;
  end: number;
  /** 区间原先对应的那段文字（留档用） */
  anchorText: string;
  reason?: string;
}

/** 冲突依据重校验结果 */
export interface ConflictRevalidation {
  state: "ok" | "moved" | "invalid";
  /** 依据原文 */
  basisText: string;
  /** moved 时依据在新稿件中的新文本 */
  resolvedText?: string;
  /** moved 时依据文本替换后的新 target */
  target?: string;
  /** moved 时按新稿件重算后的候选（原候选留档） */
  candidates?: ReviewCandidate[];
  reason?: string;
}

interface LocatedWindow {
  start: number;
  end: number;
  score: number;
}

/* ------------------------------- 文本相似度 ------------------------------- */

function charBigrams(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (let i = 0; i < text.length - 1; i++) {
    const bigram = text.slice(i, i + 2);
    counts.set(bigram, (counts.get(bigram) ?? 0) + 1);
  }
  return counts;
}

function diceSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let intersection = 0;
  for (const [key, value] of a) {
    const other = b.get(key);
    if (other) intersection += Math.min(value, other);
  }
  let total = 0;
  for (const value of a.values()) total += value;
  for (const value of b.values()) total += value;
  return total === 0 ? 0 : (2 * intersection) / total;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/* ------------------------------- 区间重锚定 ------------------------------- */

function findOccurrences(doc: string, needle: string): number[] {
  const found: number[] = [];
  if (!needle) return found;
  let index = doc.indexOf(needle);
  while (index !== -1) {
    found.push(index);
    index = doc.indexOf(needle, index + needle.length);
  }
  return found;
}

/** 多次命中时，按上下文相似度 + 就近原则消歧 */
function disambiguate(anchor: string, occurrences: number[], oldDoc: string, newDoc: string, oldStart: number): number {
  const contextRadius = 24;
  const oldBefore = oldDoc.slice(Math.max(0, oldStart - contextRadius), oldStart);
  const oldAfter = oldDoc.slice(oldStart + anchor.length, oldStart + anchor.length + contextRadius);
  const beforeBg = charBigrams(oldBefore);
  const afterBg = charBigrams(oldAfter);

  let best = occurrences[0];
  let bestScore = -Infinity;
  for (const pos of occurrences) {
    const before = newDoc.slice(Math.max(0, pos - contextRadius), pos);
    const after = newDoc.slice(pos + anchor.length, pos + anchor.length + contextRadius);
    const contextScore =
      (diceSimilarity(beforeBg, charBigrams(before)) + diceSimilarity(afterBg, charBigrams(after))) / 2;
    // 上下文优先，距离仅作平手时的弱兜底，避免调换后被旧位置吸住
    const score = contextScore - Math.abs(pos - oldStart) / 100_000;
    if (score > bestScore) {
      bestScore = score;
      best = pos;
    }
  }
  return best;
}

/** 模糊定位：滑动窗口 + 二元组粗筛 + 编辑距离精排，容忍区间内少量文字改动 */
function fuzzyLocate(anchor: string, doc: string): LocatedWindow | null {
  const anchorLen = anchor.length;
  if (anchorLen < 2) return null;
  const anchorBg = charBigrams(anchor);
  // 允许窗口长度在 anchor 附近浮动，以容忍插入/删除导致的长度变化
  const minLen = Math.max(2, anchorLen - 3);
  const maxLen = Math.min(doc.length, anchorLen + 3);
  const candidates: LocatedWindow[] = [];
  for (let len = minLen; len <= maxLen; len++) {
    for (let start = 0; start + len <= doc.length; start++) {
      const window = doc.slice(start, start + len);
      const dice = diceSimilarity(anchorBg, charBigrams(window));
      if (dice >= 0.55) candidates.push({ start, end: start + len, score: dice });
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);

  let best: LocatedWindow | null = null;
  for (const candidate of candidates.slice(0, 8)) {
    // 精排时用候选自身长度的窗口计算编辑距离，覆盖插入/删除后的完整短语
    const window = doc.slice(candidate.start, candidate.end);
    const editDistance = levenshtein(anchor, window);
    const editSimilarity = 1 - editDistance / Math.max(anchorLen, window.length);
    const score = editSimilarity * 0.8 + candidate.score * 0.2;
    if (best === null || score > best.score) {
      best = { start: candidate.start, end: candidate.end, score };
    }
  }
  return best !== null && best.score >= 0.62 ? best : null;
}

/**
 * 按区间原先对应的文字，把每条区间重新锚定到新稿件的位置。
 * - 文字整段删除且无处可寻 → dangling（悬空，留档不丢）
 * - 文字位置随增删/调换移动 → moved
 * - 精确命中且位置不变 → unchanged
 */
export function reanchorSpans(
  oldContent: string,
  newContent: string,
  spans: Pick<TextSpanAnnotation, "id" | "start" | "end" | "anchorText">[],
): ReanchorOutcome[] {
  return spans.map((span) => {
    const anchorText = span.anchorText ?? oldContent.slice(span.start, span.end);
    if (!anchorText.trim()) {
      return {
        annotationId: span.id,
        status: "dangling",
        start: span.start,
        end: span.end,
        anchorText,
        reason: "区间内容为空，无法在新稿件中定位",
      };
    }

    const occurrences = findOccurrences(newContent, anchorText);
    if (occurrences.length > 0) {
      const start = occurrences.length === 1 ? occurrences[0] : disambiguate(anchorText, occurrences, oldContent, newContent, span.start);
      return {
        annotationId: span.id,
        status: start === span.start ? "unchanged" : "moved",
        start,
        end: start + anchorText.length,
        anchorText,
      };
    }

    const located = fuzzyLocate(anchorText, newContent);
    if (located) {
      return {
        annotationId: span.id,
        status: "moved",
        start: located.start,
        end: located.end,
        anchorText,
      };
    }

    return {
      annotationId: span.id,
      status: "dangling",
      start: span.start,
      end: span.end,
      anchorText,
      reason: "所指文字在新稿件中不存在（整段删除或改写后无法匹配）",
    };
  });
}

/* ------------------------------- 冲突依据重校验 ------------------------------- */

const QUOTED_PATTERN = /[“「『"]([^”」』"]{2,})[”」』"]/g;

/** 抽取冲突 target 与候选描述中引用的原文片段，按长度降序（越长越具体） */
export function extractBasisTexts(conflict: ReviewConflict): string[] {
  const texts = new Set<string>();
  const grab = (text: string) => {
    let match: RegExpExecArray | null;
    QUOTED_PATTERN.lastIndex = 0;
    while ((match = QUOTED_PATTERN.exec(text))) {
      if (match[1].trim().length >= 2) texts.add(match[1]);
    }
  };
  grab(conflict.target);
  conflict.candidates.forEach((candidate) => grab(candidate.value));
  return Array.from(texts).sort((a, b) => b.length - a.length);
}

function rewriteCandidateValue(value: string, basisText: string, resolvedText: string): string {
  if (value.includes(basisText)) return value.split(basisText).join(resolvedText);
  return `${value}（已按新稿件重算）`;
}

/**
 * 稿件修订后重校验冲突依据：
 * - 依据原文仍在 → ok
 * - 依据随文字移动但可定位 → moved，候选按新稿件重算（原候选留档）
 * - 依据整段消失 → invalid，候选直接失效
 */
export function revalidateConflict(conflict: ReviewConflict, newContent: string): ConflictRevalidation {
  const basisTexts = extractBasisTexts(conflict);
  if (basisTexts.length === 0) return { state: "ok", basisText: "" };
  const basisText = basisTexts[0];

  if (newContent.includes(basisText)) return { state: "ok", basisText };

  const located = fuzzyLocate(basisText, newContent);
  if (located && located.score >= 0.62) {
    const resolvedText = newContent.slice(located.start, located.end);
    return {
      state: "moved",
      basisText,
      resolvedText,
      target: conflict.target.split(basisText).join(resolvedText),
      candidates: conflict.candidates.map((candidate, index) => ({
        ...candidate,
        id: `${candidate.id}-rec${Date.now().toString(36)}-${index}`,
        value: rewriteCandidateValue(candidate.value, basisText, resolvedText),
        confidence: Math.round(candidate.confidence * 0.92 * 100) / 100,
      })),
    };
  }

  return {
    state: "invalid",
    basisText,
    reason: "冲突依据的原文在新稿件中不存在，候选失效，需按新稿件重新标注",
  };
}
