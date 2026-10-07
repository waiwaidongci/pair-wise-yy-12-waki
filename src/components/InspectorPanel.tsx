import {
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { DeleteOutlineRounded, RestartAltRounded, UndoRounded, RedoRounded, VisibilityRounded } from "@mui/icons-material";
import { labelsForTask, useWorkbenchStore } from "../stores/workbenchStore";
import { formatRelativeTime } from "../utils/task";

function annotationLabel(kind: string): string {
  if (kind === "bbox") return "矩形框";
  if (kind === "polygon") return "多边形";
  if (kind === "keypoint") return "关键点";
  if (kind === "audio-segment") return "音频片段";
  return "文本区间";
}

export default function InspectorPanel() {
  const tasks = useWorkbenchStore((state) => state.tasks);
  const annotations = useWorkbenchStore((state) => state.annotations);
  const activeTaskId = useWorkbenchStore((state) => state.activeTaskId);
  const selectedAnnotationId = useWorkbenchStore((state) => state.selectedAnnotationId);
  const customLabels = useWorkbenchStore((state) => state.customLabels);
  const lastSavedAt = useWorkbenchStore((state) => state.lastSavedAt);
  const history = useWorkbenchStore((state) => state.history);
  const future = useWorkbenchStore((state) => state.future);
  const selectAnnotation = useWorkbenchStore((state) => state.selectAnnotation);
  const removeAnnotation = useWorkbenchStore((state) => state.removeAnnotation);
  const undo = useWorkbenchStore((state) => state.undo);
  const redo = useWorkbenchStore((state) => state.redo);
  const resetViewport = useWorkbenchStore((state) => state.resetViewport);
  const task = tasks.find((item) => item.id === activeTaskId)!;
  const taskAnnotations = annotations.filter((annotation) => annotation.taskId === activeTaskId);
  const labels = labelsForTask(task.kind, customLabels);

  return (
    <Paper variant="outlined" sx={{ minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Box sx={{ p: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
        <Stack direction="row" alignItems="center">
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 900 }}>标注检查器</Typography>
            <Typography sx={{ fontSize: 10.5, color: "text.secondary", mt: 0.3 }}>
              {taskAnnotations.length} 个标注 · {formatRelativeTime(lastSavedAt)}保存
            </Typography>
          </Box>
          <Tooltip title="撤销">
            <span>
              <IconButton size="small" disabled={!(history[activeTaskId]?.length)} onClick={undo}><UndoRounded fontSize="small" /></IconButton>
            </span>
          </Tooltip>
          <Tooltip title="重做">
            <span>
              <IconButton size="small" disabled={!(future[activeTaskId]?.length)} onClick={redo}><RedoRounded fontSize="small" /></IconButton>
            </span>
          </Tooltip>
        </Stack>
        <Stack direction="row" spacing={0.7} sx={{ mt: 1.1 }}>
          <Chip size="small" label={task.kind === "image" ? "像素坐标" : task.kind === "audio" ? "毫秒精度" : "字符偏移"} />
          <Chip size="small" variant="outlined" label={`${taskAnnotations.length} 条`} />
          {task.kind === "image" && (
            <Button size="small" startIcon={<RestartAltRounded />} onClick={resetViewport}>复位视图</Button>
          )}
        </Stack>
      </Box>

      <List dense disablePadding className="scroll-area" sx={{ flex: 1, minHeight: 0, overflowY: "auto", p: 0.8 }}>
        {taskAnnotations.length === 0 && (
          <Box sx={{ p: 3, textAlign: "center", color: "text.secondary" }}>
            <VisibilityRounded />
            <Typography sx={{ fontSize: 12, mt: 1 }}>当前样本还没有标注</Typography>
          </Box>
        )}
        {taskAnnotations.map((annotation) => {
          const label = labels.find((item) => item.id === annotation.labelId);
          const dangling = annotation.kind === "text-span" && Boolean((annotation as { dangling?: boolean }).dangling);
          return (
            <ListItem
              key={annotation.id}
              disablePadding
              secondaryAction={
                <IconButton edge="end" size="small" color="error" onClick={() => removeAnnotation(annotation.id)}>
                  <DeleteOutlineRounded fontSize="small" />
                </IconButton>
              }
            >
              <ListItemButton
                selected={selectedAnnotationId === annotation.id}
                onClick={() => selectAnnotation(annotation.id)}
                sx={{ borderRadius: 1, pr: 6, opacity: dangling ? 0.62 : 1 }}
              >
                <Box sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: label?.color ?? "#777", mr: 1.2, flexShrink: 0 }} />
                <ListItemText
                  primary={
                    <Stack direction="row" spacing={0.6} alignItems="center">
                      <Typography sx={{ fontSize: 11.5, fontWeight: 800 }}>{label?.name ?? "未命名"} · {annotationLabel(annotation.kind)}</Typography>
                      {dangling && <Chip size="small" color="warning" label="悬空" sx={{ height: 17, fontSize: 9 }} />}
                    </Stack>
                  }
                  secondary={
                    dangling && annotation.kind === "text-span" && (annotation as { anchorText?: string }).anchorText
                      ? `「${(annotation as { anchorText: string }).anchorText.slice(0, 24)}」`
                      : `${annotation.author} · 置信度 ${((annotation.confidence ?? 0.9) * 100).toFixed(0)}%`
                  }
                  primaryTypographyProps={{ fontSize: 11.5, fontWeight: 800 }}
                  secondaryTypographyProps={{ fontSize: 9.8 }}
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
      <Divider />
      <Box sx={{ p: 1.3, bgcolor: "grey.50" }}>
        <Typography sx={{ fontSize: 10, color: "text.secondary", lineHeight: 1.6 }}>
          删除、撤销和重做均立即更新画布，并触发自动保存。标注内容会按样本隔离存储。
        </Typography>
      </Box>
    </Paper>
  );
}
