import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  FormControl,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  AudiotrackRounded,
  ChevronLeftRounded,
  ChevronRightRounded,
  ClearAllRounded,
  ImageRounded,
  SearchRounded,
  TextSnippetRounded,
} from "@mui/icons-material";
import { useWorkbenchStore } from "../stores/workbenchStore";
import type { AnnotationTask, TaskKind } from "../types/annotation";
import { formatRelativeTime, taskProgress, taskSummary } from "../utils/task";

function KindIcon({ task }: { task: AnnotationTask }) {
  if (task.kind === "image") return <ImageRounded fontSize="small" />;
  if (task.kind === "audio") return <AudiotrackRounded fontSize="small" />;
  return <TextSnippetRounded fontSize="small" />;
}

export default function TaskNavigator() {
  const tasks = useWorkbenchStore((state) => state.tasks);
  const annotations = useWorkbenchStore((state) => state.annotations);
  const activeTaskId = useWorkbenchStore((state) => state.activeTaskId);
  const batchSelection = useWorkbenchStore((state) => state.batchSelection);
  const setActiveTask = useWorkbenchStore((state) => state.setActiveTask);
  const nextTask = useWorkbenchStore((state) => state.nextTask);
  const previousTask = useWorkbenchStore((state) => state.previousTask);
  const toggleBatchTask = useWorkbenchStore((state) => state.toggleBatchTask);
  const clearBatchSelection = useWorkbenchStore((state) => state.clearBatchSelection);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<TaskKind | "all">("all");

  const filtered = useMemo(
    () =>
      tasks.filter((task) => {
        const matchKind = kind === "all" || task.kind === kind;
        const matchQuery = `${task.title}${task.batch}${task.instruction}`.toLowerCase().includes(query.trim().toLowerCase());
        return matchKind && matchQuery;
      }),
    [kind, query, tasks],
  );

  return (
    <Paper variant="outlined" sx={{ minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Box sx={{ p: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography sx={{ fontSize: 13, fontWeight: 900 }}>样本队列</Typography>
            <Typography sx={{ fontSize: 10.5, color: "text.secondary", mt: 0.3 }}>
              {batchSelection.length ? `已勾选 ${batchSelection.length} 个样本` : `${filtered.length} 个可处理样本`}
            </Typography>
          </Box>
          <Stack direction="row" spacing={0.4}>
            <Tooltip title="上一个样本">
              <IconButton size="small" onClick={previousTask}><ChevronLeftRounded fontSize="small" /></IconButton>
            </Tooltip>
            <Tooltip title="下一个样本">
              <IconButton size="small" onClick={nextTask}><ChevronRightRounded fontSize="small" /></IconButton>
            </Tooltip>
          </Stack>
        </Stack>
        <Stack direction="row" spacing={0.8} sx={{ mt: 1.2 }}>
          <TextField
            size="small"
            fullWidth
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索文件或批次"
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> }}
          />
          <FormControl size="small" sx={{ minWidth: 90 }}>
            <Select value={kind} onChange={(event) => setKind(event.target.value as TaskKind | "all")}>
              <MenuItem value="all">全部</MenuItem>
              <MenuItem value="image">图像</MenuItem>
              <MenuItem value="audio">音频</MenuItem>
              <MenuItem value="text">文本</MenuItem>
            </Select>
          </FormControl>
        </Stack>
        {batchSelection.length > 0 && (
          <Button size="small" fullWidth startIcon={<ClearAllRounded />} sx={{ mt: 1 }} onClick={clearBatchSelection}>
            清除批量选择
          </Button>
        )}
      </Box>

      <List dense disablePadding className="scroll-area" sx={{ minHeight: 0, flex: 1, overflowY: "auto", p: 0.8 }}>
        {filtered.map((task) => {
          const active = task.id === activeTaskId;
          const progress = taskProgress(task.id, annotations);
          return (
            <ListItemButton
              key={task.id}
              selected={active}
              onClick={() => setActiveTask(task.id)}
              sx={{
                alignItems: "flex-start",
                gap: 0.6,
                borderRadius: 1.2,
                mb: 0.45,
                py: 1,
                px: 0.7,
                border: "1px solid",
                borderColor: active ? "primary.main" : "transparent",
                bgcolor: active ? "primary.50" : undefined,
              }}
            >
              <Checkbox
                size="small"
                checked={batchSelection.includes(task.id)}
                onClick={(event) => event.stopPropagation()}
                onChange={() => toggleBatchTask(task.id)}
                sx={{ mt: -0.45, ml: -0.4 }}
              />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Stack direction="row" spacing={0.7} alignItems="center">
                  <Box sx={{ color: active ? "primary.main" : "text.secondary", display: "flex" }}><KindIcon task={task} /></Box>
                  <Typography noWrap sx={{ fontSize: 12, fontWeight: 850, flex: 1 }}>{task.title}</Typography>
                </Stack>
                <Typography noWrap sx={{ fontSize: 10, color: "text.secondary", mt: 0.5 }}>{taskSummary(task)}</Typography>
                <Stack direction="row" spacing={0.55} alignItems="center" sx={{ mt: 0.8 }}>
                  <Chip
                    size="small"
                    label={task.status}
                    color={task.status === "待审核" ? "warning" : task.status === "已完成" ? "success" : "default"}
                    variant="outlined"
                    sx={{ height: 19, fontSize: 9.5 }}
                  />
                  {task.priority !== "普通" && <Chip size="small" label={task.priority} color={task.priority === "紧急" ? "error" : "warning"} sx={{ height: 19, fontSize: 9.5 }} />}
                  <Typography sx={{ fontSize: 9.5, color: "text.secondary", ml: "auto" }}>{progress}%</Typography>
                </Stack>
                <Box sx={{ height: 3, bgcolor: "action.hover", borderRadius: 99, mt: 0.7, overflow: "hidden" }}>
                  <Box sx={{ height: "100%", width: `${progress}%`, bgcolor: active ? "primary.main" : "grey.400" }} />
                </Box>
                <Typography sx={{ fontSize: 9.5, color: "text.secondary", mt: 0.55 }}>{formatRelativeTime(task.updatedAt)}更新</Typography>
              </Box>
            </ListItemButton>
          );
        })}
      </List>

      <Divider />
      <Box sx={{ p: 1.2, display: "flex", alignItems: "center", gap: 1 }}>
        <Typography sx={{ fontSize: 10.5, color: "text.secondary", flex: 1 }}>
          勾选多个样本后，使用箭头批量切换
        </Typography>
        <Chip size="small" label={`${batchSelection.length} / ${tasks.length}`} />
      </Box>
    </Paper>
  );
}
