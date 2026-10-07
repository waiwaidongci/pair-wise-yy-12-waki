import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Divider,
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
  RedoRounded,
  TextFieldsRounded,
  UndoRounded,
} from "@mui/icons-material";
import type { TextSpanAnnotation, TextTask } from "../types/annotation";
import { labelsForTask, useWorkbenchStore } from "../stores/workbenchStore";
import { getSelectionRange, splitText, type TextRange } from "../utils/textSelection";

export default function TextAnnotator({ task }: { task: TextTask }) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [selection, setSelection] = useState<TextRange | null>(null);
  const [documentNote, setDocumentNote] = useState("");
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
  const labels = labelsForTask(task.kind, customLabels);
  const chunks = useMemo(() => splitText(task.content), [task.content]);
  const spans = useMemo(
    () =>
      annotations.filter(
        (annotation): annotation is TextSpanAnnotation =>
          annotation.taskId === task.id && annotation.kind === "text-span" && annotation.scope === "span",
      ),
    [annotations, task.id],
  );
  const documentLabels = annotations.filter((annotation) => annotation.taskId === task.id && annotation.kind === "text-span" && annotation.scope === "document");

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
        {selection ? (
          <Chip color="primary" size="small" label={`${selection.start} - ${selection.end} · ${selection.text.length} 字`} />
        ) : (
          <Chip size="small" variant="outlined" label="拖动文本选择区间" />
        )}
        <Typography sx={{ fontSize: 10.5, color: "text.secondary", ml: "auto" }}>
          命中标签 {spans.length} 个 · 文档分类 {documentLabels.length} 个
        </Typography>
      </Stack>

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
    </Paper>
  );
}
