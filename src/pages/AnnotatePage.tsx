import { Box, Chip, Paper, Stack, Typography } from "@mui/material";
import { AltRouteRounded, SaveRounded, SpeedRounded } from "@mui/icons-material";
import AudioAnnotator from "../components/AudioAnnotator";
import ImageAnnotator from "../components/ImageAnnotator";
import InspectorPanel from "../components/InspectorPanel";
import LabelPalette from "../components/LabelPalette";
import TaskNavigator from "../components/TaskNavigator";
import TextAnnotator from "../components/TextAnnotator";
import { useWorkbenchStore } from "../stores/workbenchStore";
import { taskKindLabels } from "../utils/task";

export default function AnnotatePage() {
  const tasks = useWorkbenchStore((state) => state.tasks);
  const activeTaskId = useWorkbenchStore((state) => state.activeTaskId);
  const autosave = useWorkbenchStore((state) => state.autosave);
  const task = tasks.find((item) => item.id === activeTaskId) ?? tasks[0];

  return (
    <Box sx={{ px: { xs: 1.5, xl: 2.5 }, py: 2, maxWidth: 1840, mx: "auto" }}>
      <Paper variant="outlined" sx={{ p: 1.5, mb: 1.6, display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography noWrap sx={{ fontSize: 15, fontWeight: 900 }}>{task.title}</Typography>
            <Chip size="small" color="primary" variant="outlined" label={taskKindLabels[task.kind]} />
            <Chip size="small" label={task.priority} color={task.priority === "紧急" ? "error" : task.priority === "高" ? "warning" : "default"} />
            <Chip size="small" variant="outlined" label={task.status} />
          </Stack>
          <Typography sx={{ mt: 0.65, fontSize: 11.5, color: "text.secondary" }}>{task.instruction}</Typography>
        </Box>
        <Stack direction="row" spacing={0.7}>
          <Chip icon={<SaveRounded />} size="small" label={autosave} color={autosave === "保存中" ? "warning" : "success"} variant="outlined" />
          <Chip icon={<SpeedRounded />} size="small" label="低延迟模式" variant="outlined" />
          <Chip icon={<AltRouteRounded />} size="small" label="依赖规则已启用" variant="outlined" />
        </Stack>
      </Paper>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", xl: "272px minmax(560px, 1fr) 310px" },
          gridTemplateRows: { xs: "auto", xl: "calc(100vh - 218px)" },
          gap: 1.5,
          alignItems: "stretch",
        }}
      >
        <Box sx={{ minHeight: { xs: 380, xl: 0 } }}>
          <TaskNavigator />
        </Box>

        <Box sx={{ minWidth: 0, minHeight: { xs: 580, xl: 0 } }}>
          {task.kind === "image" && <ImageAnnotator task={task} />}
          {task.kind === "audio" && <AudioAnnotator task={task} />}
          {task.kind === "text" && <TextAnnotator task={task} />}
        </Box>

        <Stack spacing={1.5} sx={{ minHeight: 0 }}>
          <LabelPalette />
          <Box sx={{ minHeight: { xs: 340, xl: 0 }, flex: 1 }}>
            <InspectorPanel />
          </Box>
        </Stack>
      </Box>
    </Box>
  );
}
