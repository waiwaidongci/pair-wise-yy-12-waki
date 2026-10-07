export interface TextRange {
  start: number;
  end: number;
  text: string;
}

export function getSelectionRange(container: HTMLElement): TextRange | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;

  const before = range.cloneRange();
  before.selectNodeContents(container);
  before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().length;
  const text = range.toString();
  return { start, end: start + text.length, text };
}

export interface TextChunk {
  text: string;
  start: number;
  end: number;
}

export function splitText(content: string): TextChunk[] {
  const chunks: TextChunk[] = [];
  const matcher = /[\u4e00-\u9fff]|[A-Za-z0-9][A-Za-z0-9_-]*|\s+|[^\s]/g;
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(content))) {
    chunks.push({ text: match[0], start: match.index, end: match.index + match[0].length });
  }
  return chunks;
}

export function rangeOverlaps(start: number, end: number, spans: { start: number; end: number }[]): boolean {
  return spans.some((span) => start < span.end && end > span.start);
}
