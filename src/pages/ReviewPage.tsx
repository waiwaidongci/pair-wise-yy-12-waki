import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  FormControlLabel,
  List,
  ListItemButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  CheckCircleRounded,
  CompareArrowsRounded,
  FilterAltRounded,
  GroupsRounded,
  RateReviewRounded,
  WarningAmberRounded,
} from "@mui/icons-material";
import ReviewCanvas from "../components/ReviewCanvas";
import { labelsByKind } from "../data/mockData";
import { useWorkbenchStore } from "../stores/workbenchStore";
import { taskKindLabels } from "../utils/task";

export default function ReviewPage() {
  const tasks = useWorkbenchStore((state) => state.tasks);
  const annotations = useWorkbenchStore((state) => state.annotations);
  const conflicts = useWorkbenchStore((state) => state.conflicts);
  const conflictBasis = useWorkbenchStore((state) => state.conflictBasis);
  const reviewerVisibility = useWorkbenchStore((state) => state.reviewerVisibility);
  const resolvedConflicts = useWorkbenchStore((state) => state.resolvedConflicts);
  const reviewNotes = useWorkbenchStore((state) => state.reviewNotes);
  const toggleReviewer = useWorkbenchStore((state) => state.toggleReviewer);
  const resolveConflict = useWorkbenchStore((state) => state.resolveConflict);
  const setReviewNote = useWorkbenchStore((state) => state.setReviewNote);
  const reviewTaskIds = useMemo(() => new Set(conflicts.map((conflict) => conflict.taskId)), [conflicts]);
  const reviewTasks = tasks.filter((task) => reviewTaskIds.has(task.id));
  const [activeTaskId, setActiveTaskId] = useState(reviewTasks[0]?.id ?? tasks[0].id);
  const taskConflicts = conflicts.filter((conflict) => conflict.taskId === activeTaskId);
  const [activeConflictId, setActiveConflictId] = useState(taskConflicts[0]?.id ?? conflicts[0]?.id);
  const activeConflict = conflicts.find((conflict) => conflict.id === activeConflictId) ?? taskConflicts[0];
  const activeTask = tasks.find((task) => task.id === activeTaskId)!;
  const taskAnnotations = annotations.filter((annotation) => annotation.taskId === activeTaskId);
  const reviewers = Array.from(new Set(taskAnnotations.map((annotation) => annotation.author)));
  const unresolved = conflicts.filter((conflict) => !resolvedConflicts[conflict.id]).length;
  const confidence = activeConflict
    ? Math.round((activeConflict.candidates.reduce((sum, candidate) => sum + candidate.confidence, 0) / activeConflict.candidates.length) * 100)
    : 0;

  return (
    <Box sx={{ px: { xs: 1.5, xl: 2.5 }, py: 2, maxWidth: 1840, mx: "auto" }}>
      <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5, display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
        <RateReviewRounded color="primary" />
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontSize: 15, fontWeight: 900 }}>多人标注冲突审核</Typography>
          <Typography sx={{ fontSize: 11, color: "text.secondary", mt: 0.35 }}>
            同一目标的候选结果、置信度与审核备注会保留在本地，适合质检抽样与复核签发。
          </Typography>
        </Box>
        <Chip icon={<GroupsRounded />} label={`${reviewers.length} 名标注员`} variant="outlined" />
        <Chip icon={<WarningAmberRounded />} color={unresolved ? "warning" : "success"} label={`待处理 ${unresolved} 项`} />
        <Chip icon={<CompareArrowsRounded />} label={`对比目标 ${taskAnnotations.length} 个`} />
      </Paper>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", xl: "280px minmax(520px, 1fr) 340px" },
          gridTemplateRows: { xs: "auto", xl: "calc(100vh - 208px)" },
          gap: 1.5,
        }}
      >
        <Paper variant="outlined" sx={{ minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <Box sx={{ p: 1.4, borderBottom: "1px solid", borderColor: "divider" }}>
            <Stack direction="row" alignItems="center">
              <FilterAltRounded fontSize="small" />
              <Typography sx={{ fontSize: 12.5, fontWeight: 900, ml: 0.8 }}>待审核样本</Typography>
              <Chip size="small" label={reviewTasks.length} sx={{ ml: "auto" }} />
            </Stack>
          </Box>
          <List dense disablePadding className="scroll-area" sx={{ flex: 1, minHeight: 0, overflowY: "auto", p: 0.8 }}>
            {reviewTasks.map((task) => {
              const conflictCount = conflicts.filter((conflict) => conflict.taskId === task.id && !resolvedConflicts[conflict.id]).length;
              return (
                <ListItemButton
                  key={task.id}
                  selected={task.id === activeTaskId}
                  onClick={() => {
                    setActiveTaskId(task.id);
                    setActiveConflictId(conflicts.find((conflict) => conflict.taskId === task.id)?.id ?? "");
                  }}
                  sx={{ borderRadius: 1.2, mb: 0.6, py: 1 }}
                >
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography noWrap sx={{ fontSize: 11.5, fontWeight: 850 }}>{task.title}</Typography>
                    <Stack direction="row" spacing={0.6} sx={{ mt: 0.7 }}>
                      <Chip size="small" label={taskKindLabels[task.kind]} sx={{ height: 19, fontSize: 9.5 }} />
                      <Chip size="small" color={conflictCount ? "error" : "success"} label={conflictCount ? `${conflictCount} 个冲突` : "已处理"} sx={{ height: 19, fontSize: 9.5 }} />
                    </Stack>
                  </Box>
                </ListItemButton>
              );
            })}
          </List>
          <Divider />
          <Box sx={{ p: 1.2 }}>
            <Typography sx={{ fontSize: 10, color: "text.secondary", mb: 0.5 }}>标注员图层</Typography>
            {["周岚", "何序", "陆鸣", "当前标注员"].map((author) => (
              <FormControlLabel
                key={author}
                control={<Checkbox size="small" checked={reviewerVisibility[author] ?? true} onChange={() => toggleReviewer(author)} />}
                label={<Typography sx={{ fontSize: 11 }}>{author}</Typography>}
                sx={{ display: "flex", mr: 0 }}
              />
            ))}
          </Box>
        </Paper>

        <Paper variant="outlined" sx={{ minHeight: { xs: 540, xl: 0 }, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <Box sx={{ p: 1.3, borderBottom: "1px solid", borderColor: "divider", display: "flex", alignItems: "center", gap: 1 }}>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography noWrap sx={{ fontSize: 12.5, fontWeight: 900 }}>{activeTask.title}</Typography>
              <Typography sx={{ fontSize: 10, color: "text.secondary", mt: 0.25 }}>{activeTask.instruction}</Typography>
            </Box>
            <Chip size="small" label={`${reviewers.length} 人标注`} color="primary" variant="outlined" />
          </Box>
          <Box sx={{ minHeight: 0, flex: 1 }}>
            <ReviewCanvas task={activeTask} annotations={taskAnnotations} visibility={reviewerVisibility} />
          </Box>
        </Paper>

        <Paper variant="outlined" sx={{ minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <Box sx={{ p: 1.3, borderBottom: "1px solid", borderColor: "divider" }}>
            <Typography sx={{ fontSize: 12.5, fontWeight: 900 }}>冲突队列</Typography>
            <Typography sx={{ fontSize: 10, color: "text.secondary", mt: 0.25 }}>选择候选值后立即写入复核结果</Typography>
          </Box>
          <Stack spacing={0.8} sx={{ p: 1 }}>
            {conflicts.map((conflict) => {
              const resolved = resolvedConflicts[conflict.id];
              const basis = conflictBasis[conflict.id];
              return (
                <Button
                  key={conflict.id}
                  variant={activeConflictId === conflict.id ? "contained" : "outlined"}
                  color={basis?.state === "invalid" ? "error" : resolved ? "success" : "warning"}
                  onClick={() => setActiveConflictId(conflict.id)}
                  startIcon={resolved ? <CheckCircleRounded /> : <WarningAmberRounded />}
                  sx={{ justifyContent: "flex-start", py: 0.85 }}
                >
                  <Box sx={{ textAlign: "left", minWidth: 0 }}>
                    <Typography noWrap sx={{ fontSize: 11.5, fontWeight: 850 }}>{conflict.target}</Typography>
                    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.3 }}>
                      <Typography sx={{ fontSize: 9.5, opacity: 0.78 }}>{resolved ? "已处理" : `${conflict.candidates.length} 个候选 · ${conflict.severity}`}</Typography>
                      {basis?.state === "invalid" && <Chip size="small" color="error" label="依据失效" sx={{ height: 16, fontSize: 8.5 }} />}
                      {basis?.state === "moved" && <Chip size="small" color="info" label="已按新稿件重算" sx={{ height: 16, fontSize: 8.5 }} />}
                    </Stack>
                  </Box>
                </Button>
              );
            })}
          </Stack>
          <Divider />
          {activeConflict && (
            <Box className="scroll-area" sx={{ minHeight: 0, flex: 1, overflowY: "auto", p: 1.2 }}>
              <Stack direction="row" alignItems="center" spacing={0.8} sx={{ mb: 1 }}>
                <Typography sx={{ fontSize: 11.5, fontWeight: 900, flex: 1 }}>候选结果</Typography>
                <Chip size="small" label={`平均置信度 ${confidence}%`} />
              </Stack>
              <Stack spacing={0.9}>
                {activeConflict.archivedCandidates && (
                  <Paper variant="outlined" sx={{ p: 0.8, bgcolor: "info.50", borderColor: "info.light" }}>
                    <Typography sx={{ fontSize: 10, color: "info.dark" }}>
                      原候选已留档，以下候选按新稿件重算
                    </Typography>
                  </Paper>
                )}
                {activeConflict.candidates.map((candidate) => {
                  const selected = resolvedConflicts[activeConflict.id] === candidate.id;
                  const label = labelsByKind[activeTask.kind].find((item) => item.id === candidate.labelId);
                  const invalid = Boolean(candidate.invalid);
                  return (
                    <Paper
                      key={candidate.id}
                      variant="outlined"
                      sx={{
                        p: 1.1,
                        borderColor: invalid ? "error.light" : selected ? "success.main" : "divider",
                        bgcolor: invalid ? "error.50" : selected ? "success.50" : "background.paper",
                        cursor: invalid ? "not-allowed" : "pointer",
                        opacity: invalid ? 0.75 : 1,
                      }}
                      onClick={() => {
                        if (!invalid) resolveConflict(activeConflict.id, candidate.id);
                      }}
                    >
                      <Stack direction="row" spacing={0.8} alignItems="center">
                        <Box sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: label?.color }} />
                        <Typography sx={{ fontSize: 11.5, fontWeight: 900, flex: 1 }}>{candidate.author}</Typography>
                        {invalid && <Chip size="small" color="error" label="已失效" sx={{ height: 18, fontSize: 9 }} />}
                        <Chip size="small" label={`${Math.round(candidate.confidence * 100)}%`} />
                        {selected && <CheckCircleRounded color="success" fontSize="small" />}
                      </Stack>
                      <Typography sx={{ mt: 0.8, fontSize: 10.8, color: "text.secondary", lineHeight: 1.55 }}>{candidate.value}</Typography>
                      <Chip size="small" label={label?.name ?? candidate.labelId} sx={{ mt: 0.9, height: 20, bgcolor: `${label?.color}15`, color: label?.color }} />
                    </Paper>
                  );
                })}
              </Stack>
              <TextField
                size="small"
                fullWidth
                multiline
                minRows={2}
                value={reviewNotes[activeConflict.id] ?? ""}
                onChange={(event) => setReviewNote(activeConflict.id, event.target.value)}
                placeholder="填写复核说明，供下一轮质检追踪"
                sx={{ mt: 1.3 }}
              />
              <Button
                fullWidth
                variant="contained"
                color="success"
                sx={{ mt: 1 }}
                disabled={!resolvedConflicts[activeConflict.id]}
                onClick={() => {
                  const index = conflicts.findIndex((conflict) => conflict.id === activeConflict.id);
                  const next = conflicts[index + 1] ?? conflicts.find((conflict) => conflict.taskId !== activeTaskId);
                  if (next) setActiveConflictId(next.id);
                }}
              >
                确认并进入下一项
              </Button>
            </Box>
          )}
        </Paper>
      </Box>
    </Box>
  );
}
