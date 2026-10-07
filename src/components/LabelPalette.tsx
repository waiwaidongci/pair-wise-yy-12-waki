import { Box, Button, Chip, Divider, MenuItem, Paper, Select, Stack, Tooltip, Typography } from "@mui/material";
import { AddRounded, BookmarkAddRounded, LayersRounded } from "@mui/icons-material";
import { useWorkbenchStore } from "../stores/workbenchStore";
import { labelsForTask } from "../stores/workbenchStore";

export default function LabelPalette() {
  const tasks = useWorkbenchStore((state) => state.tasks);
  const activeTaskId = useWorkbenchStore((state) => state.activeTaskId);
  const activeLabelId = useWorkbenchStore((state) => state.activeLabelId);
  const templates = useWorkbenchStore((state) => state.templates);
  const activeTemplateId = useWorkbenchStore((state) => state.activeTemplateId);
  const customLabels = useWorkbenchStore((state) => state.customLabels);
  const setActiveLabel = useWorkbenchStore((state) => state.setActiveLabel);
  const applyTemplate = useWorkbenchStore((state) => state.applyTemplate);
  const createTemplate = useWorkbenchStore((state) => state.createTemplate);
  const addCustomLabel = useWorkbenchStore((state) => state.addCustomLabel);
  const task = tasks.find((item) => item.id === activeTaskId)!;
  const labels = labelsForTask(task.kind, customLabels);
  const templatesForKind = templates.filter((template) => template.kind === task.kind);

  const createLabel = () => {
    const name = window.prompt("新标签名称");
    if (!name?.trim()) return;
    const color = window.prompt("标签颜色（HEX）", "#355c9a") ?? "#355c9a";
    addCustomLabel({ name: name.trim(), color, hotkey: "-", description: "团队自定义标签" });
  };

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <LayersRounded color="primary" fontSize="small" />
        <Typography sx={{ fontSize: 13, fontWeight: 900, flex: 1 }}>标签模板</Typography>
        <Tooltip title="把当前标签集合保存为模板">
          <Button
            size="small"
            startIcon={<BookmarkAddRounded />}
            onClick={() => {
              const name = window.prompt("模板名称", `${task.kind === "image" ? "图像" : task.kind === "audio" ? "音频" : "文本"}模板 ${templates.length + 1}`);
              if (name?.trim()) createTemplate(name.trim());
            }}
          >
            保存
          </Button>
        </Tooltip>
      </Stack>
      <Select
        size="small"
        fullWidth
        value={activeTemplateId}
        onChange={(event) => applyTemplate(event.target.value)}
        sx={{ mt: 1.2, fontSize: 12 }}
      >
        {templatesForKind.map((template) => (
          <MenuItem key={template.id} value={template.id}>{template.name}</MenuItem>
        ))}
      </Select>

      <Divider sx={{ my: 1.4 }} />
      <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
        <Typography sx={{ fontSize: 11, fontWeight: 800, color: "text.secondary", flex: 1 }}>当前标签</Typography>
        <Button size="small" startIcon={<AddRounded />} onClick={createLabel}>自定义</Button>
      </Stack>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 0.8 }}>
        {labels.map((label) => {
          const selected = activeLabelId === label.id;
          return (
            <Button
              key={label.id}
              size="small"
              variant={selected ? "contained" : "outlined"}
              onClick={() => setActiveLabel(label.id)}
              sx={{
                justifyContent: "flex-start",
                minWidth: 0,
                px: 1,
                py: 0.8,
                color: selected ? "white" : label.color,
                borderColor: selected ? label.color : "divider",
                bgcolor: selected ? label.color : "background.paper",
                "&:hover": { bgcolor: selected ? label.color : `${label.color}10` },
              }}
            >
              <Box sx={{ width: 8, height: 8, bgcolor: selected ? "white" : label.color, borderRadius: "50%", mr: 0.8, flexShrink: 0 }} />
              <Typography noWrap sx={{ fontSize: 11.5, fontWeight: 850, flex: 1, textAlign: "left" }}>{label.name}</Typography>
              <Chip label={label.hotkey} size="small" sx={{ height: 17, minWidth: 20, fontSize: 9, bgcolor: selected ? "rgba(255,255,255,.18)" : "action.hover", color: "inherit" }} />
            </Button>
          );
        })}
      </Box>
      <Typography sx={{ mt: 1.2, fontSize: 10.5, color: "text.secondary", lineHeight: 1.55 }}>
        {labels.find((label) => label.id === activeLabelId)?.description ?? "选择标签后开始标注"}
      </Typography>
    </Paper>
  );
}
