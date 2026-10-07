import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, Divider, IconButton, Paper, Stack, Tooltip, Typography } from "@mui/material";
import {
  CenterFocusStrongRounded,
  CropSquareRounded,
  GestureRounded,
  NearMeRounded,
  RemoveRounded,
  AddRounded,
  RestartAltRounded,
  PanToolRounded,
} from "@mui/icons-material";
import type { Annotation, AnnotationDraft, AnnotationTool, ImageTask, Point } from "../types/annotation";
import { useWorkbenchStore, labelsForTask } from "../stores/workbenchStore";
import { createSampleImage } from "../utils/sampleImage";
import { clamp } from "../utils/task";

interface CanvasSize {
  width: number;
  height: number;
}

interface PointerState {
  mode: "pan" | "bbox" | "select" | "none";
  startScreen: Point;
  startWorld: Point;
  startPan: Point;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export default function ImageAnnotator({ task }: { task: ImageTask }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState<CanvasSize>({ width: 900, height: 600 });
  const [draft, setDraft] = useState<AnnotationDraft | null>(null);
  const pointerState = useRef<PointerState>({ mode: "none", startScreen: { x: 0, y: 0 }, startWorld: { x: 0, y: 0 }, startPan: { x: 0, y: 0 } });
  const spacePressed = useRef(false);
  const annotations = useWorkbenchStore((state) => state.annotations);
  const customLabels = useWorkbenchStore((state) => state.customLabels);
  const activeTool = useWorkbenchStore((state) => state.activeTool);
  const activeLabelId = useWorkbenchStore((state) => state.activeLabelId);
  const selectedAnnotationId = useWorkbenchStore((state) => state.selectedAnnotationId);
  const zoom = useWorkbenchStore((state) => state.zoom);
  const pan = useWorkbenchStore((state) => state.pan);
  const setActiveTool = useWorkbenchStore((state) => state.setActiveTool);
  const setActiveLabel = useWorkbenchStore((state) => state.setActiveLabel);
  const selectAnnotation = useWorkbenchStore((state) => state.selectAnnotation);
  const addAnnotation = useWorkbenchStore((state) => state.addAnnotation);
  const removeAnnotation = useWorkbenchStore((state) => state.removeAnnotation);
  const undo = useWorkbenchStore((state) => state.undo);
  const redo = useWorkbenchStore((state) => state.redo);
  const nextTask = useWorkbenchStore((state) => state.nextTask);
  const previousTask = useWorkbenchStore((state) => state.previousTask);
  const setViewport = useWorkbenchStore((state) => state.setViewport);
  const resetViewport = useWorkbenchStore((state) => state.resetViewport);
  const labels = labelsForTask(task.kind, customLabels);
  const taskAnnotations = useMemo(() => annotations.filter((annotation) => annotation.taskId === task.id), [annotations, task.id]);

  const fitScale = Math.min(size.width / task.width, size.height / task.height) * 0.92;
  const scale = fitScale * zoom;

  const worldToScreen = useCallback(
    (point: Point): Point => ({
      x: size.width / 2 + pan.x + (point.x - task.width / 2) * scale,
      y: size.height / 2 + pan.y + (point.y - task.height / 2) * scale,
    }),
    [pan.x, pan.y, scale, size.height, size.width, task.height, task.width],
  );

  const screenToWorld = useCallback(
    (point: Point): Point => ({
      x: (point.x - size.width / 2 - pan.x) / scale + task.width / 2,
      y: (point.y - size.height / 2 - pan.y) / scale + task.height / 2,
    }),
    [pan.x, pan.y, scale, size.height, size.width, task.height, task.width],
  );

  useEffect(() => {
    sampleCanvasRef.current = createSampleImage(task);
  }, [task]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const hitTest = useCallback(
    (world: Point): Annotation | null => {
      for (let index = taskAnnotations.length - 1; index >= 0; index -= 1) {
        const annotation = taskAnnotations[index];
        if (annotation.kind === "bbox") {
          if (world.x >= annotation.x && world.x <= annotation.x + annotation.width && world.y >= annotation.y && world.y <= annotation.y + annotation.height) return annotation;
        }
        if (annotation.kind === "keypoint" && distance(world, annotation.point) < 18 / scale) return annotation;
        if (annotation.kind === "polygon") {
          const xs = annotation.points.map((point) => point.x);
          const ys = annotation.points.map((point) => point.y);
          if (world.x >= Math.min(...xs) && world.x <= Math.max(...xs) && world.y >= Math.min(...ys) && world.y <= Math.max(...ys)) return annotation;
        }
      }
      return null;
    },
    [scale, taskAnnotations],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const sample = sampleCanvasRef.current;
    if (!canvas || !sample) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(size.width * dpr) || canvas.height !== Math.round(size.height * dpr)) {
      canvas.width = Math.round(size.width * dpr);
      canvas.height = Math.round(size.height * dpr);
    }
    const context = canvas.getContext("2d")!;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, size.width, size.height);
    context.fillStyle = "#111827";
    context.fillRect(0, 0, size.width, size.height);

    context.save();
    context.translate(size.width / 2 + pan.x, size.height / 2 + pan.y);
    context.scale(scale, scale);
    context.translate(-task.width / 2, -task.height / 2);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(sample, 0, 0);
    context.restore();

    const toScreen = (point: Point) => worldToScreen(point);
    for (const annotation of taskAnnotations) {
      const label = labels.find((item) => item.id === annotation.labelId);
      const color = label?.color ?? "#ffffff";
      const selected = annotation.id === selectedAnnotationId;
      const start = annotation.kind === "bbox" ? toScreen({ x: annotation.x, y: annotation.y }) : null;
      const end =
        annotation.kind === "bbox"
          ? toScreen({ x: annotation.x + annotation.width, y: annotation.y + annotation.height })
          : null;

      context.save();
      context.lineWidth = selected ? 3 : 2;
      context.strokeStyle = color;
      context.fillStyle = `${color}22`;
      context.shadowColor = selected ? color : "transparent";
      context.shadowBlur = selected ? 12 : 0;
      if (annotation.kind === "bbox" && start && end) {
        context.fillRect(start.x, start.y, end.x - start.x, end.y - start.y);
        context.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
        context.shadowBlur = 0;
        context.fillStyle = color;
        context.fillRect(start.x, start.y - 19, Math.max(48, context.measureText(label?.name ?? "目标").width + 26), 19);
        context.fillStyle = "#fff";
        context.font = "700 11px Avenir Next, sans-serif";
        context.fillText(`${label?.name ?? "目标"} ${Math.round((annotation.confidence ?? 0.9) * 100)}%`, start.x + 7, start.y - 5);
      }
      if (annotation.kind === "polygon") {
        context.beginPath();
        annotation.points.forEach((point, index) => {
          const screen = toScreen(point);
          if (index === 0) context.moveTo(screen.x, screen.y);
          else context.lineTo(screen.x, screen.y);
        });
        context.closePath();
        context.fill();
        context.stroke();
        const first = toScreen(annotation.points[0]);
        context.shadowBlur = 0;
        context.fillStyle = color;
        context.fillRect(first.x, first.y - 19, Math.max(58, context.measureText(label?.name ?? "目标").width + 28), 19);
        context.fillStyle = "#fff";
        context.font = "700 11px Avenir Next, sans-serif";
        context.fillText(label?.name ?? "目标", first.x + 7, first.y - 5);
      }
      if (annotation.kind === "keypoint") {
        const point = toScreen(annotation.point);
        context.beginPath();
        context.arc(point.x, point.y, selected ? 9 : 7, 0, Math.PI * 2);
        context.fillStyle = `${color}88`;
        context.fill();
        context.stroke();
        context.beginPath();
        context.moveTo(point.x - 12, point.y);
        context.lineTo(point.x + 12, point.y);
        context.moveTo(point.x, point.y - 12);
        context.lineTo(point.x, point.y + 12);
        context.stroke();
      }
      context.restore();
    }

    if (draft) {
      const color = labels.find((label) => label.id === activeLabelId)?.color ?? "#2368e7";
      context.save();
      context.strokeStyle = color;
      context.fillStyle = `${color}30`;
      context.lineWidth = 2;
      context.setLineDash([7, 5]);
      if (draft.kind === "bbox" && draft.bbox) {
        const start = toScreen({ x: draft.bbox.x, y: draft.bbox.y });
        const end = toScreen({ x: draft.bbox.x + draft.bbox.width, y: draft.bbox.y + draft.bbox.height });
        context.fillRect(start.x, start.y, end.x - start.x, end.y - start.y);
        context.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
      }
      if (draft.kind === "polygon" && draft.points.length) {
        context.beginPath();
        draft.points.forEach((point, index) => {
          const screen = toScreen(point);
          if (index === 0) context.moveTo(screen.x, screen.y);
          else context.lineTo(screen.x, screen.y);
        });
        context.stroke();
        draft.points.forEach((point) => {
          const screen = toScreen(point);
          context.beginPath();
          context.arc(screen.x, screen.y, 4, 0, Math.PI * 2);
          context.fill();
        });
      }
      context.restore();
    }
  }, [activeLabelId, draft, labels, pan.x, pan.y, scale, selectedAnnotationId, size, task.height, task.width, taskAnnotations, worldToScreen]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(frame);
  }, [draw]);

  const finishPolygon = useCallback(() => {
    if (draft?.kind !== "polygon" || draft.points.length < 3 || !activeLabelId) {
      setDraft(null);
      return;
    }
    addAnnotation({
      id: `polygon-${Date.now()}`,
      taskId: task.id,
      kind: "polygon",
      labelId: activeLabelId,
      author: "当前标注员",
      createdAt: new Date().toISOString(),
      confidence: 0.92,
      points: draft.points,
    });
    setDraft(null);
  }, [activeLabelId, addAnnotation, draft, task.id]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.matches("input, textarea, select, [contenteditable='true']")) return;
      const label = labels.find((item) => item.hotkey === event.key);
      if (label) {
        setActiveLabel(label.id);
        return;
      }
      if (event.code === "Space") {
        spacePressed.current = true;
        event.preventDefault();
      }
      const key = event.key.toLowerCase();
      if (key === "v") setActiveTool("select");
      if (key === "b") setActiveTool("bbox");
      if (key === "p") setActiveTool("polygon");
      if (key === "k") setActiveTool("keypoint");
      if (key === "0") resetViewport();
      if (key === "n") nextTask();
      if (key === "m") previousTask();
      if (key === "escape") setDraft(null);
      if (key === "enter" && draft?.kind === "polygon") finishPolygon();
      if ((key === "delete" || key === "backspace") && selectedAnnotationId) removeAnnotation(selectedAnnotationId);
      if ((event.metaKey || event.ctrlKey) && key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") spacePressed.current = false;
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [draft, finishPolygon, labels, nextTask, previousTask, redo, removeAnnotation, resetViewport, selectedAnnotationId, setActiveLabel, setActiveTool, undo]);

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const screen = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const world = screenToWorld(screen);
    event.currentTarget.setPointerCapture(event.pointerId);

    if (event.button === 1 || spacePressed.current) {
      pointerState.current = { mode: "pan", startScreen: screen, startWorld: world, startPan: pan };
      return;
    }

    if (activeTool === "select") {
      const hit = hitTest(world);
      selectAnnotation(hit?.id ?? null);
      pointerState.current = { mode: "select", startScreen: screen, startWorld: world, startPan: pan };
      return;
    }

    if (activeTool === "bbox") {
      pointerState.current = { mode: "bbox", startScreen: screen, startWorld: world, startPan: pan };
      setDraft({ kind: "bbox", points: [world], bbox: { x: world.x, y: world.y, width: 0, height: 0 } });
    }

    if (activeTool === "polygon") {
      setDraft((current) => ({
        kind: "polygon",
        points: current?.kind === "polygon" ? [...current.points, world] : [world],
      }));
    }

    if (activeTool === "keypoint" && activeLabelId) {
      addAnnotation({
        id: `keypoint-${Date.now()}`,
        taskId: task.id,
        kind: "keypoint",
        labelId: activeLabelId,
        author: "当前标注员",
        createdAt: new Date().toISOString(),
        confidence: 0.9,
        point: world,
      });
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const state = pointerState.current;
    if (state.mode === "none") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const screen = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    if (state.mode === "pan") {
      setViewport(zoom, {
        x: state.startPan.x + screen.x - state.startScreen.x,
        y: state.startPan.y + screen.y - state.startScreen.y,
      });
    }
    if (state.mode === "bbox") {
      const world = screenToWorld(screen);
      const x = clamp(Math.min(state.startWorld.x, world.x), 0, task.width);
      const y = clamp(Math.min(state.startWorld.y, world.y), 0, task.height);
      const endX = clamp(Math.max(state.startWorld.x, world.x), 0, task.width);
      const endY = clamp(Math.max(state.startWorld.y, world.y), 0, task.height);
      setDraft({ kind: "bbox", points: [state.startWorld, world], bbox: { x, y, width: endX - x, height: endY - y } });
    }
  };

  const onPointerUp = () => {
    const state = pointerState.current;
    pointerState.current = { mode: "none", startScreen: { x: 0, y: 0 }, startWorld: { x: 0, y: 0 }, startPan: pan };
    if (state.mode === "bbox" && draft?.bbox && draft.bbox.width > 4 && draft.bbox.height > 4 && activeLabelId) {
      addAnnotation({
        id: `bbox-${Date.now()}`,
        taskId: task.id,
        kind: "bbox",
        labelId: activeLabelId,
        author: "当前标注员",
        createdAt: new Date().toISOString(),
        confidence: 0.93,
        ...draft.bbox,
      });
      setDraft(null);
    } else if (state.mode === "bbox") {
      setDraft(null);
    }
  };

  const onWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const mouse = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const world = screenToWorld(mouse);
    const nextZoom = clamp(zoom * (event.deltaY > 0 ? 0.9 : 1.1), 0.18, 5);
    const nextScale = fitScale * nextZoom;
    setViewport(nextZoom, {
      x: mouse.x - size.width / 2 - (world.x - task.width / 2) * nextScale,
      y: mouse.y - size.height / 2 - (world.y - task.height / 2) * nextScale,
    });
  };

  const tools: Array<{ id: AnnotationTool; label: string; icon: React.ReactNode }> = [
    { id: "select", label: "选择 V", icon: <NearMeRounded /> },
    { id: "bbox", label: "矩形 B", icon: <CropSquareRounded /> },
    { id: "polygon", label: "多边形 P", icon: <GestureRounded /> },
    { id: "keypoint", label: "关键点 K", icon: <CenterFocusStrongRounded /> },
  ];

  return (
    <Paper variant="outlined" sx={{ minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Stack direction="row" spacing={0.7} alignItems="center" sx={{ p: 1, borderBottom: "1px solid", borderColor: "divider", flexWrap: "wrap" }}>
        {tools.map((tool) => (
          <Tooltip key={tool.id} title={tool.label}>
            <Button
              size="small"
              variant={activeTool === tool.id ? "contained" : "text"}
              color={activeTool === tool.id ? "primary" : "inherit"}
              startIcon={tool.icon}
              onClick={() => setActiveTool(tool.id)}
            >
              {tool.label.split(" ")[0]}
            </Button>
          </Tooltip>
        ))}
        <Divider orientation="vertical" flexItem sx={{ mx: 0.3 }} />
        <Tooltip title="缩小">
          <IconButton size="small" onClick={() => setViewport(clamp(zoom * 0.88, 0.18, 5), pan)}><RemoveRounded fontSize="small" /></IconButton>
        </Tooltip>
        <Typography sx={{ width: 48, textAlign: "center", fontSize: 11, fontWeight: 800 }}>{Math.round(zoom * 100)}%</Typography>
        <Tooltip title="放大">
          <IconButton size="small" onClick={() => setViewport(clamp(zoom * 1.12, 0.18, 5), pan)}><AddRounded fontSize="small" /></IconButton>
        </Tooltip>
        <Tooltip title="适应窗口">
          <IconButton size="small" onClick={resetViewport}><RestartAltRounded fontSize="small" /></IconButton>
        </Tooltip>
        <Typography sx={{ fontSize: 10.5, color: "text.secondary", ml: "auto" }}>
          空格拖拽平移 · 滚轮缩放 · Enter 完成多边形
        </Typography>
      </Stack>

      <Box ref={containerRef} sx={{ position: "relative", flex: 1, minHeight: 420, overflow: "hidden", bgcolor: "#111827" }}>
        <canvas
          ref={canvasRef}
          style={{ display: "block", width: "100%", height: "100%", cursor: activeTool === "select" ? "default" : "crosshair", touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={() => {
            if (draft?.kind === "polygon") finishPolygon();
          }}
          onWheel={onWheel}
          onContextMenu={(event) => event.preventDefault()}
        />
        <Box sx={{ position: "absolute", left: 12, bottom: 12, bgcolor: "rgba(15,23,42,.78)", color: "white", px: 1.2, py: 0.65, borderRadius: 1, fontSize: 10.5, display: "flex", alignItems: "center", gap: 0.6 }}>
          <PanToolRounded sx={{ fontSize: 14 }} /> {Math.round(task.width * scale)} × {Math.round(task.height * scale)} px
        </Box>
        {draft?.kind === "polygon" && (
          <Box sx={{ position: "absolute", right: 12, bottom: 12, bgcolor: "primary.main", color: "white", px: 1.2, py: 0.7, borderRadius: 1, fontSize: 10.5 }}>
            已放置 {draft.points.length} 个点 · 双击闭合
          </Box>
        )}
      </Box>
    </Paper>
  );
}
