import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  AddCommentRounded,
  CategoryRounded,
  DeleteOutlineRounded,
  EditNoteRounded,
  FormatClearRounded,
  HistoryRounded,
  RedoRounded,
  UndoRounded,
  TextFieldsRounded,
  WarningAmberRounded,
} from "@mui/icons-material";
import type { TextSpanAnnotation, TextTask } from "../types/annotation";
import { labelsForTask, useWorkbenchStore } from "../stores/workbenchStore";
import { getSelectionRange, splitText, type TextRange } from "../utils/textSelection";
import { formatRelativeTime } from "../utils/task";

export default function TextAnnotator({ task }: { task: TextTask }) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [selection, setSelection] = useState<TextRange | null>(null);
  const [documentNote, setDocumentNote] = useState("");
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [draftContent, setDraftContent] = useState(task.content);
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [revisionSummary, setRevisionSummary] = useState<string | null>(null);
  const annotations = useWorkbenchStore((state) => state.annotations);
  const customLabels = useWorkbenchStore((state) => state.customLabels);
  const activeLabelId = useWorkbenchStore((state) => state.activeLabelId);
  const selectedAnnotationId = useWorkbenchStore((state) => state.selectedAnnotationId);
  const textRevisions = useWorkbenchStore((state) => state.textRevisions);
  const setActiveLabel = useWorkbenchStore((state) => state.setActiveLabel);
  const selectAnnotation = useWorkbenchStore((state) => state.selectAnnotation);
  const addAnnotation = useWorkbenchStore((state) => state.addAnnotation);
  const removeAnnotation = useWorkbenchStore((state) => state.removeAnnotation);
  const reviseTextTask = useWorkbenchStore((state) => state.reviseTextTask);
  const undo = useWorkbenchStore((state) => state.undo);
  const redo = useWorkbenchStore((state) => state.redo);
  const nextTask = useWorkbenchStore((state) => state.nextTask);
  const labels = labelsForTask(task.kind, customLabels);
  const chunks = useMemo(() => splitText(task.content), [task.content]);
  const spans = useMemo(
    () =>
      annotations.filter(
        (annotation): annotation is TextSpanAnnotation =>
          annotation.taskId === task.id &&
          annotation.kind === "text-span" &&
          annotation.scope === "span" &&
          !annotation.dangling,
      ),
    [annotations, task.id],
  );
  const danglingSpans = annotations.filter(
    (annotation): annotation is TextSpanAnnotation =>
      annotation.taskId === task.id && annotation.kind === "text-span" && Boolean(annotation.dangling),
  );
  const documentLabels = annotations.filter(
    (annotation) => annotation.taskId === task.id && annotation.kind === "text-span" && annotation.scope === "document",
  );
  const revisions = textRevisions[task.id] ?? [];

  useEffect(() => {
    setSelection(null);
    setDocumentNote("");
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

  const openRevisionDialog = () => {
    setDraftContent(task.content);
    setSimulateFailure(false);
    setRevisionOpen(true);
  };

  const applyRevision = () => {
    if (draftContent === task.content) {
      setRevisionOpen(false);
      return;
    }
    reviseTextTask(task.id, draftContent, { simulateFailure });
    const latest = useWorkbenchStore.getState().textRevisions[task.id]?.[0];
    if (latest) {
      setRevisionSummary(
        `已按新稿件重锚定：${latest.reanchored} 条区间挪到新位置，${latest.unchanged} 条未动，${latest.dangling} 条整段删除已悬空归档`,
      );
    }
    setRevisionOpen(false);
  };

  return (
    <Paper variant="outlined" sx={{ minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Stack direction="row" spacing={0.8} alignItems="center" sx={{ p: 1.1, borderBottom: "1px solid", borderColor: "divider", flexWrap: "wrap" }}>
        <Button size="small" startIcon={<TextFieldsRounded />} variant="contained" disabled={!selection} onClick={applySpan}>
          标注所选区间
        </Button>
        <Button size="small" startIcon={<CategoryRounded />} onClick={applyDocumentLabel}>文档分类</Button>
        <Button size="small" startIcon={<EditNoteRounded />} onClick={openRevisionDialog}>修订稿件</Button>
        <Button
          size="small"
          startIcon={<HistoryRounded />}
          color={danglingSpans.length ? "warning" : "inherit"}
          onClick={() => setArchiveOpen(true)}
        >
          悬空归档{danglingSpans.length ? ` ${danglingSpans.length}` : ""}
        </Button>
        <Button size="small" startIcon={<UndoRounded />} onClick={undo}>撤销</Button>
        <Button size="small" startIcon={<RedoRounded />} onClick={redo}>重做</Button>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.3 }} />
        {selection ? (
          <Chip color="primary" size="small" label={`${selection.start} - ${selection.end} · ${selection.text.length} 字`} />
        ) : (
          <Chip size="small" variant="outlined" label="拖动文本选择区间" />
        )}
        <Typography sx={{ fontSize: 10.5, color: "text.secondary", ml: "auto" }}>
          命中标签 {spans.length} 个 · 悬空 {danglingSpans.length} 个 · 文档分类 {documentLabels.length} 个
        </Typography>
      </Stack>

      {revisionSummary && (
        <Box sx={{ px: 1.4, py: 0.6, bgcolor: "warning.50", borderBottom: "1px solid", borderColor: "warning.100", display: "flex", alignItems: "center", gap: 1 }}>
          <WarningAmberRounded fontSize="small" color="warning" />
          <Typography sx={{ fontSize: 11.5, color: "warning.dark", flex: 1 }}>{revisionSummary}</Typography>
          <Button size="small" onClick={() => setRevisionSummary(null)}>知道了</Button>
        </Box>
      )}

      <Box className="scroll-area" sx={{ minHeight: 0, flex: 1, overflowY: "auto", p: { xs: 2, md: 3.5 }, bgcolor: "#fbfcfe" }}>
        <Box sx={{ maxWidth: 920, mx: "auto" }}>
          <Typography sx={{ fontSize: { xs: 18, md: 22 }, fontWeight: 900, mb: 0.8 }}>{task.title}</Typography>
          <Typography sx={{ fontSize: 11, color: "text.secondary", mb: 2.4 }}>
            {task.source} · {task.content.length.toLocaleString("zh-CN")} 字符 · 自动保存
          </Typography>
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

      <Dialog open={revisionOpen} onClose={() => setRevisionOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontSize: 15, fontWeight: 900 }}>接受数据组修订稿</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 11.5, color: "text.secondary", mb: 1 }}>
            粘贴改好的新稿件。句子增删或前后调换时，已标区间会按原先对应的文字自动挪到新位置；整段被拿掉的区间不会丢失，将标为悬空并留档。
          </Typography>
          <TextField
            multiline
            minRows={10}
            fullWidth
            value={draftContent}
            onChange={(event) => setDraftContent(event.target.value)}
            placeholder="粘贴新稿件全文"
            sx={{ fontSize: 13, lineHeight: 1.8 }}
          />
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
            <Chip size="small" variant="outlined" label={`${draftContent.length.toLocaleString("zh-CN")} 字符`} />
            <Chip size="small" variant="outlined" label={`当前 ${task.content.length.toLocaleString("zh-CN")} 字符`} />
            <FormControlLabel
              control={<Checkbox size="small" checked={simulateFailure} onChange={(event) => setSimulateFailure(event.target.checked)} />}
              label={<Typography sx={{ fontSize: 11 }}>模拟落盘失败（验证上一版保留、重试不重复追加）</Typography>}
              sx={{ ml: "auto" }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRevisionOpen(false)}>取消</Button>
          <Button variant="contained" onClick={applyRevision} disabled={draftContent === task.content}>
            应用修订并重锚定
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={archiveOpen} onClose={() => setArchiveOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontSize: 15, fontWeight: 900 }}>悬空区间与修订留档</DialogTitle>
        <DialogContent>
          {danglingSpans.length === 0 && (
            <Typography sx={{ fontSize: 12.5, color: "text.secondary", py: 2 }}>当前没有悬空区间。稿件修订后整段消失的区间会保留在这里，可随时回溯依据。</Typography>
          )}
          <Stack spacing={1}>
            {danglingSpans.map((span) => {
              const label = labels.find((item) => item.id === span.labelId);
              return (
                <Paper key={span.id} variant="outlined" sx={{ p: 1.2, borderColor: "warning.light", bgcolor: "warning.50" }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: label?.color ?? "#999" }} />
                    <Typography sx={{ fontSize: 12, fontWeight: 800, flex: 1 }}>{label?.name ?? "未命名"} · {span.author}</Typography>
                    <Chip size="small" color="warning" label="悬空" />
                    <Typography sx={{ fontSize: 10.5, color: "text.secondary" }}>{formatRelativeTime(span.danglingAt ?? span.createdAt)}</Typography>
                  </Stack>
                  <Typography sx={{ fontSize: 12.5, mt: 0.8, lineHeight: 1.7, color: "text.primary" }}>
                    「{span.anchorText ?? task.content.slice(span.start, span.end)}」
                  </Typography>
                  <Typography sx={{ fontSize: 10.5, color: "text.secondary", mt: 0.4 }}>{span.danglingReason ?? "所指文字在新稿件中不存在"}</Typography>
                </Paper>
              );
            })}
          </Stack>
          <Divider sx={{ my: 1.4 }} />
          <Typography sx={{ fontSize: 12, fontWeight: 800, mb: 0.8 }}>修订记录</Typography>
          {revisions.length === 0 && (
            <Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>暂无修订记录。</Typography>
          )}
          <Stack spacing={0.6}>
            {revisions.map((record) => (
              <Paper key={record.id} variant="outlined" sx={{ p: 1 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography sx={{ fontSize: 11.5, fontWeight: 800 }}>{record.source}</Typography>
                  <Typography sx={{ fontSize: 10.5, color: "text.secondary" }}>{formatRelativeTime(record.at)}</Typography>
                  <Chip size="small" label={`重锚定 ${record.reanchored}`} sx={{ height: 19, fontSize: 9.5 }} />
                  <Chip size="small" label={`未动 ${record.unchanged}`} sx={{ height: 19, fontSize: 9.5 }} />
                  <Chip size="small" color="warning" label={`悬空 ${record.dangling}`} sx={{ height: 19, fontSize: 9.5 }} />
                  <Chip size="small" variant="outlined" label={`文档级 ${record.documentLabels}`} sx={{ height: 19, fontSize: 9.5 }} />
                </Stack>
              </Paper>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setArchiveOpen(false)}>关闭</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
