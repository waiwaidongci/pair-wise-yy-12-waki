import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  AddCommentRounded,
  CategoryRounded,
  DeleteOutlineRounded,
  FormatClearRounded,
  HistoryRounded,
  RedoRounded,
  TextFieldsRounded,
  UndoRounded,
  UpdateRounded,
} from "@mui/icons-material";
import type { TextSpanAnnotation, TextTask } from "../types/annotation";
import { labelsForTask, useWorkbenchStore, type ApplyTextRevisionResult } from "../stores/workbenchStore";
import { getSelectionRange, splitText, type TextRange } from "../utils/textSelection";
import { revisionArchive, type RevisionArchiveEntry } from "../utils/revisionArchive";

interface RevisedSample {
  key: string;
  label: string;
  transform: (content: string) => string;
}

const revisedSamples: RevisedSample[] = [
  {
    key: "reorder",
    label: "前后调换：把赠品/核实段移到优惠券段之前",
    transform: (content) => {
      const paragraphs = content.split("\n\n");
      if (paragraphs.length < 6) return content;
      // 第 2 段（优惠券）与第 6 段（赠品核实）调换
      const next = [...paragraphs];
      [next[1], next[5]] = [next[5], next[1]];
      return next.join("\n\n");
    },
  },
  {
    key: "insert",
    label: "新增句子：在开头补充到店时间更正",
    transform: (content) =>
      `更正：到店时间应为前天上午，以下评价以此为准。\n\n${content}`,
  },
  {
    key: "remove-evidence",
    label: "整段拿掉：删除优惠券说明段（依据消失，候选失效）",
    transform: (content) => {
      const paragraphs = content.split("\n\n");
      return paragraphs.filter((paragraph) => !paragraph.includes("优惠券只能在新设备上使用")).join("\n\n");
    },
  },
  {
    key: "remove-phone",
    label: "整段拿掉：删除手机号所在段（敏感区间悬空）",
    transform: (content) => {
      const paragraphs = content.split("\n\n");
      return paragraphs.filter((paragraph) => !paragraph.includes("13800001234")).join("\n\n");
    },
  },
];

export default function TextAnnotator({ task }: { task: TextTask }) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [selection, setSelection] = useState<TextRange | null>(null);
  const [documentNote, setDocumentNote] = useState("");
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [revisionResult, setRevisionResult] = useState<ApplyTextRevisionResult | null>(null);
  const [archiveEntries, setArchiveEntries] = useState<RevisionArchiveEntry[]>(() => revisionArchive.listForTask(task.id));
  const [archiveOpen, setArchiveOpen] = useState(false);
  const annotations = useWorkbenchStore((state) => state.annotations);
  const customLabels = useWorkbenchStore((state) => state.customLabels);
  const activeLabelId = useWorkbenchStore((state) => state.activeLabelId);
  const selectedAnnotationId = useWorkbenchStore((state) => state.selectedAnnotationId);
  const setActiveLabel = useWorkbenchStore((state) => state.setActiveLabel);
  const selectAnnotation = useWorkbenchStore((state) => state.selectAnnotation);
  const addAnnotation = useWorkbenchStore((state) => state.addAnnotation);
  const removeAnnotation = useWorkbenchStore((state) => state.removeAnnotation);
  const undo = useWorkbenchStore((state) => state.undo);
  const redo = useWorkbenchStore((state) => state.redo);
  const nextTask = useWorkbenchStore((state) => state.nextTask);
  const applyTextRevision = useWorkbenchStore((state) => state.applyTextRevision);
  const labels = labelsForTask(task.kind, customLabels);
  const chunks = useMemo(() => splitText(task.content), [task.content]);
  const taskSpans = useMemo(
    () =>
      annotations.filter(
        (annotation): annotation is TextSpanAnnotation =>
          annotation.taskId === task.id && annotation.kind === "text-span" && annotation.scope === "span",
      ),
    [annotations, task.id],
  );
  const spans = useMemo(() => taskSpans.filter((span) => span.anchorStatus !== "dangling"), [taskSpans]);
  const danglingSpans = useMemo(() => taskSpans.filter((span) => span.anchorStatus === "dangling"), [taskSpans]);
  const documentLabels = annotations.filter((annotation) => annotation.taskId === task.id && annotation.kind === "text-span" && annotation.scope === "document");

  useEffect(() => {
    setSelection(null);
    setDocumentNote("");
    setRevisionResult(null);
    setArchiveEntries(revisionArchive.listForTask(task.id));
  }, [task.id]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.matches("input, textarea, select, [contenteditable='true']")) return;
      const label = labels.find((item) => item.hotkey === event.key);
      if (label) setActiveLabel(label.id);
      const key = event.key.toLowerCase();
      if (key === "n") nextTask();
      if ((key === "delete" || key === "backspace") && selectedAnnotationId) removeAnnotation(selectedAnnotationId);
      if ((event.metaKey || event.ctrlKey) && key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [labels, nextTask, redo, removeAnnotation, selectedAnnotationId, setActiveLabel, undo]);

  const receiveRevision = (newContent: string) => {
    const result = applyTextRevision(task.id, newContent);
    setMenuAnchor(null);
    setRevisionResult(result);
    if (result.ok && !result.duplicated) setArchiveEntries(revisionArchive.listForTask(task.id));
  };

  const applySpan = () => {
    if (!selection || !activeLabelId) return;
    addAnnotation({
      id: `text-span-${Date.now()}`,
      taskId: task.id,
      kind: "text-span",
      labelId: activeLabelId,
      author: "当前标注员",
      createdAt: new Date().toISOString(),
      confidence: 0.95,
      start: selection.start,
      end: selection.end,
      scope: "span",
      note: selection.text.slice(0, 80),
    });
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  };

  const applyDocumentLabel = () => {
    if (!activeLabelId) return;
    addAnnotation({
      id: `text-document-${Date.now()}`,
      taskId: task.id,
      kind: "text-span",
      labelId: activeLabelId,
      author: "当前标注员",
      createdAt: new Date().toISOString(),
      confidence: 0.93,
      start: 0,
      end: task.content.length,
      scope: "document",
      note: documentNote.trim() || "文档级分类",
    });
    setDocumentNote("");
  };

  return (
    <Paper variant="outlined" sx={{ minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Stack direction="row" spacing={0.8} alignItems="center" sx={{ p: 1.1, borderBottom: "1px solid", borderColor: "divider", flexWrap: "wrap" }}>
        <Button size="small" startIcon={<TextFieldsRounded />} variant="contained" disabled={!selection} onClick={applySpan}>
          标注所选区间
        </Button>
        <Button size="small" startIcon={<CategoryRounded />} onClick={applyDocumentLabel}>文档分类</Button>
        <Button size="small" startIcon={<UndoRounded />} onClick={undo}>撤销</Button>
        <Button size="small" startIcon={<RedoRounded />} onClick={redo}>重做</Button>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.3 }} />
        <Button
          size="small"
          color="secondary"
          variant="outlined"
          startIcon={<UpdateRounded />}
          onClick={(event) => setMenuAnchor(event.currentTarget)}
        >
          接收数据组修订稿
        </Button>
        <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
          {revisedSamples.map((sample) => (
            <MenuItem key={sample.key} onClick={() => receiveRevision(sample.transform(task.content))}>
              <Typography sx={{ fontSize: 12 }}>{sample.label}</Typography>
            </MenuItem>
          ))}
        </Menu>
        <Tooltip title="查看本样本历次修订留档">
          <Button size="small" startIcon={<HistoryRounded />} onClick={() => setArchiveOpen((value) => !value)}>
            修订留档 {archiveEntries.length ? `(${archiveEntries.length})` : ""}
          </Button>
        </Tooltip>
        {selection ? (
          <Chip color="primary" size="small" label={`${selection.start} - ${selection.end} · ${selection.text.length} 字`} />
        ) : (
          <Chip size="small" variant="outlined" label="拖动文本选择区间" />
        )}
        <Typography sx={{ fontSize: 10.5, color: "text.secondary", ml: "auto" }}>
          稿件 v{task.contentVersion ?? 0} · 命中标签 {spans.length} 个 · 悬空 {danglingSpans.length} 个 · 文档分类 {documentLabels.length} 个
        </Typography>
      </Stack>

      {revisionResult && (
        <Box sx={{ px: 1.2, pt: 1 }}>
          {revisionResult.ok ? (
            <Alert
              severity="success"
              onClose={() => setRevisionResult(null)}
              sx={{ py: 0.3, "& .MuiAlert-message": { fontSize: 12 } }}
            >
              {revisionResult.duplicated
                ? "该修订已落过盘，按幂等处理：未重复追加留档，仍保留第一次的结果。"
                : `修订 ${revisionResult.revisionId} 已接收并落盘：区间随原文挪位 ${revisionResult.report?.moved.length ?? 0} 条、悬空 ${revisionResult.report?.dangled.length ?? 0} 条、候选失效 ${revisionResult.report?.invalidatedCandidates.length ?? 0} 条、重算 ${revisionResult.report?.recomputedCandidates.length ?? 0} 条${revisionResult.report?.reopenedConflicts.length ? `、已确认退回待处理 ${revisionResult.report.reopenedConflicts.length} 项` : ""}。`}
            </Alert>
          ) : (
            <Alert
              severity={revisionResult.reason === "write-failed" ? "error" : "info"}
              onClose={() => setRevisionResult(null)}
              sx={{ py: 0.3, "& .MuiAlert-message": { fontSize: 12 } }}
            >
              {revisionResult.reason === "write-failed"
                ? `落盘失败（${revisionResult.error}）：上一版稿件与标注完整保留，可直接重试，重试不会重复追加。`
                : revisionResult.reason === "unchanged"
                  ? "修订稿与当前稿件完全相同，未生成新版本。"
                  : "无法对该样本接收修订。"}
            </Alert>
          )}
        </Box>
      )}

      <Box className="scroll-area" sx={{ minHeight: 0, flex: 1, overflowY: "auto", p: { xs: 2, md: 3.5 }, bgcolor: "#fbfcfe" }}>
        <Box sx={{ maxWidth: 920, mx: "auto" }}>
          <Typography sx={{ fontSize: { xs: 18, md: 22 }, fontWeight: 900, mb: 0.8 }}>{task.title}</Typography>
          <Typography sx={{ fontSize: 11, color: "text.secondary", mb: danglingSpans.length ? 1.2 : 2.4 }}>
            {task.source} · {task.content.length.toLocaleString("zh-CN")} 字符 · 自动保存
          </Typography>

          {danglingSpans.length > 0 && (
            <Alert severity="warning" sx={{ mb: 2, py: 0.6, "& .MuiAlert-message": { width: 1 } }}>
              <Typography sx={{ fontSize: 12, fontWeight: 800 }}>
                {danglingSpans.length} 条区间对应的原文在修订稿中被整段拿掉，已标为悬空并留档，未参与当前稿件渲染。
              </Typography>
              <Stack direction="row" spacing={0.7} sx={{ mt: 0.7, flexWrap: "wrap", rowGap: 0.7 }}>
                {danglingSpans.map((span) => {
                  const label = labels.find((item) => item.id === span.labelId);
                  return (
                    <Chip
                      key={span.id}
                      size="small"
                      variant="outlined"
                      component="span"
                      label={
                        <span>
                          <Box component="span" sx={{ color: label?.color, fontWeight: 800 }}>{label?.name}</Box>
                          {" · "}“{span.anchorText}” · {span.author} · 悬空于 {span.dangledByRevision}
                        </span>
                      }
                      onClick={() => selectAnnotation(span.id)}
                      sx={{ height: "auto", py: 0.3 }}
                    />
                  );
                })}
              </Stack>
            </Alert>
          )}

          <Box
            ref={contentRef}
            className="annotation-text"
            onMouseUp={() => {
              if (contentRef.current) setSelection(getSelectionRange(contentRef.current));
            }}
            onKeyUp={() => {
              if (contentRef.current) setSelection(getSelectionRange(contentRef.current));
            }}
            sx={{ fontSize: 15, color: "#263247" }}
          >
            {chunks.map((chunk) => {
              const overlaps = spans.filter((span) => chunk.start < span.end && chunk.end > span.start);
              const activeOverlap = overlaps.find((span) => span.id === selectedAnnotationId) ?? overlaps[overlaps.length - 1];
              const label = labels.find((item) => item.id === activeOverlap?.labelId);
              const active = activeOverlap?.id === selectedAnnotationId;
              return (
                <Box
                  component="span"
                  key={`${chunk.start}-${chunk.text}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (activeOverlap) selectAnnotation(activeOverlap.id);
                  }}
                  sx={{
                    whiteSpace: "pre-wrap",
                    cursor: activeOverlap ? "pointer" : "text",
                    position: "relative",
                    bgcolor: label ? `${label.color}${active ? "45" : "24"}` : "transparent",
                    borderBottom: label ? `2px solid ${label.color}` : "none",
                    borderTop: overlaps.length > 1 ? `1px dashed ${label?.color}` : "none",
                    borderRadius: "2px",
                  }}
                >
                  {chunk.text}
                </Box>
              );
            })}
          </Box>

          {archiveOpen && (
            <Paper variant="outlined" sx={{ mt: 3 }}>
              <Box sx={{ px: 1.4, py: 1, borderBottom: "1px solid", borderColor: "divider", bgcolor: "grey.50" }}>
                <Typography sx={{ fontSize: 12, fontWeight: 900 }}>修订留档（可查）</Typography>
                <Typography sx={{ fontSize: 10, color: "text.secondary", mt: 0.3 }}>
                  每次接收修订先落盘再生效；落盘失败不会产生记录，重试同稿只保留一条。
                </Typography>
              </Box>
              <Stack spacing={1} sx={{ p: 1.2 }}>
                {archiveEntries.length === 0 && (
                  <Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>暂无修订记录。</Typography>
                )}
                {archiveEntries
                  .slice()
                  .reverse()
                  .map((entry) => (
                    <Paper key={entry.revisionId} variant="outlined" sx={{ p: 1.1 }}>
                      <Stack direction="row" spacing={0.8} alignItems="center" sx={{ flexWrap: "wrap", rowGap: 0.5 }}>
                        <Chip size="small" color="primary" label={`v${entry.fromVersion} → v${entry.toVersion}`} />
                        <Typography sx={{ fontSize: 11, fontWeight: 800 }}>{entry.revisionId}</Typography>
                        <Typography sx={{ fontSize: 10, color: "text.secondary", ml: "auto" }}>
                          {new Date(entry.appliedAt).toLocaleString("zh-CN")}
                        </Typography>
                      </Stack>
                      <Stack direction="row" spacing={0.6} sx={{ mt: 0.8, flexWrap: "wrap", rowGap: 0.6 }}>
                        <Chip size="small" color="info" variant="outlined" label={`随文挪位 ${entry.report.moved.length}`} />
                        <Chip size="small" color="warning" variant="outlined" label={`悬空留档 ${entry.report.dangled.length}`} />
                        <Chip size="small" color="error" variant="outlined" label={`候选失效 ${entry.report.invalidatedCandidates.length}`} />
                        <Chip size="small" color="success" variant="outlined" label={`重算候选 ${entry.report.recomputedCandidates.length}`} />
                        {entry.report.reopenedConflicts.length > 0 && (
                          <Chip size="small" color="secondary" variant="outlined" label={`确认退回 ${entry.report.reopenedConflicts.length}`} />
                        )}
                      </Stack>
                      {entry.report.dangled.length > 0 && (
                        <Typography sx={{ fontSize: 10, color: "text.secondary", mt: 0.7 }}>
                          悬空区间：{entry.report.dangled.join("、")}
                        </Typography>
                      )}
                    </Paper>
                  ))}
              </Stack>
            </Paper>
          )}
        </Box>
      </Box>

      <Box sx={{ p: 1.2, borderTop: "1px solid", borderColor: "divider", bgcolor: "grey.50" }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <AddCommentRounded fontSize="small" color="action" />
          <input
            value={documentNote}
            onChange={(event) => setDocumentNote(event.target.value)}
            placeholder="为当前样本补充审核备注（文档分类时写入）"
            style={{ flex: 1, minWidth: 0, border: "1px solid #ccd4df", borderRadius: 8, padding: "8px 10px", background: "white" }}
          />
          {selectedAnnotationId && (
            <Button size="small" color="error" startIcon={<DeleteOutlineRounded />} onClick={() => removeAnnotation(selectedAnnotationId)}>
              删除所指区间
            </Button>
          )}
          <Tooltip title="清除浏览器当前选中文本">
            <Button
              size="small"
              startIcon={<FormatClearRounded />}
              onClick={() => {
                window.getSelection()?.removeAllRanges();
                setSelection(null);
              }}
            >
              清除选择
            </Button>
          </Tooltip>
        </Stack>
      </Box>
    </Paper>
  );
}
