import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  LinearProgress,
  List,
  ListItemButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  DeleteOutlineRounded,
  GraphicEqRounded,
  PauseRounded,
  PlayArrowRounded,
  RedoRounded,
  RestartAltRounded,
  UndoRounded,
  VolumeUpRounded,
  ZoomInRounded,
  ZoomOutRounded,
} from "@mui/icons-material";
import type { AudioSegmentAnnotation, AudioTask } from "../types/annotation";
import { labelsForTask, useWorkbenchStore } from "../stores/workbenchStore";
import { createMockAudioUrl, createWaveform } from "../utils/mockAudio";
import { clamp, formatTime } from "../utils/task";

export default function AudioAnnotator({ task }: { task: AudioTask }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const dragStartRef = useRef(0);
  const [size, setSize] = useState({ width: 900, height: 260 });
  const [audioUrl, setAudioUrl] = useState("");
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [viewStart, setViewStart] = useState(0);
  const [draftRange, setDraftRange] = useState<{ start: number; end: number } | null>(null);
  const annotations = useWorkbenchStore((state) => state.annotations);
  const activeTaskId = useWorkbenchStore((state) => state.activeTaskId);
  const customLabels = useWorkbenchStore((state) => state.customLabels);
  const activeTool = useWorkbenchStore((state) => state.activeTool);
  const activeLabelId = useWorkbenchStore((state) => state.activeLabelId);
  const selectedAnnotationId = useWorkbenchStore((state) => state.selectedAnnotationId);
  const setActiveTool = useWorkbenchStore((state) => state.setActiveTool);
  const setActiveLabel = useWorkbenchStore((state) => state.setActiveLabel);
  const selectAnnotation = useWorkbenchStore((state) => state.selectAnnotation);
  const addAnnotation = useWorkbenchStore((state) => state.addAnnotation);
  const removeAnnotation = useWorkbenchStore((state) => state.removeAnnotation);
  const undo = useWorkbenchStore((state) => state.undo);
  const redo = useWorkbenchStore((state) => state.redo);
  const nextTask = useWorkbenchStore((state) => state.nextTask);
  const labels = labelsForTask(task.kind, customLabels);
  const waveform = useMemo(() => createWaveform(task.duration, task.audioSeed), [task.audioSeed, task.duration]);
  const segments = useMemo(
    () => annotations.filter((annotation): annotation is AudioSegmentAnnotation => annotation.taskId === task.id && annotation.kind === "audio-segment"),
    [annotations, task.id],
  );
  const selectedSegment = segments.find((segment) => segment.id === selectedAnnotationId);
  const visibleDuration = task.duration / zoom;
  const viewEnd = Math.min(task.duration, viewStart + visibleDuration);
  const progress = (currentTime / task.duration) * 100;

  useEffect(() => {
    const url = createMockAudioUrl(task);
    setAudioUrl(url);
    setCurrentTime(0);
    setViewStart(0);
    return () => URL.revokeObjectURL(url);
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

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
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

    const middle = size.height * 0.5;
    const amplitude = size.height * 0.34;
    context.strokeStyle = "rgba(255,255,255,.07)";
    context.lineWidth = 1;
    for (let line = 1; line < 6; line += 1) {
      const y = (size.height / 6) * line;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(size.width, y);
      context.stroke();
    }

    for (const segment of segments) {
      const segmentStart = (segment.start - viewStart) / visibleDuration;
      const segmentEnd = (segment.end - viewStart) / visibleDuration;
      if (segmentEnd < 0 || segmentStart > 1) continue;
      const label = labels.find((item) => item.id === segment.labelId);
      const x = Math.max(0, segmentStart * size.width);
      const end = Math.min(size.width, segmentEnd * size.width);
      context.fillStyle = `${label?.color ?? "#2368e7"}${segment.id === selectedAnnotationId ? "66" : "35"}`;
      context.fillRect(x, 0, Math.max(2, end - x), size.height);
      context.strokeStyle = label?.color ?? "#2368e7";
      context.strokeRect(x + 0.5, 0.5, Math.max(2, end - x - 1), size.height - 1);
    }

    if (draftRange) {
      const start = ((Math.min(draftRange.start, draftRange.end) - viewStart) / visibleDuration) * size.width;
      const end = ((Math.max(draftRange.start, draftRange.end) - viewStart) / visibleDuration) * size.width;
      context.fillStyle = "rgba(35,104,231,.38)";
      context.fillRect(start, 0, Math.max(2, end - start), size.height);
    }

    const barCount = Math.min(waveform.length, Math.max(1, Math.floor(size.width / 2)));
    for (let index = 0; index < barCount; index += 1) {
      const ratio = index / barCount;
      const time = viewStart + ratio * visibleDuration;
      const sourceIndex = clamp(Math.floor((time / task.duration) * waveform.length), 0, waveform.length - 1);
      const value = waveform[sourceIndex] ?? 0.1;
      const x = ratio * size.width;
      const height = Math.max(2, value * amplitude);
      const gradient = context.createLinearGradient(0, middle - height, 0, middle + height);
      gradient.addColorStop(0, "rgba(151,190,244,.92)");
      gradient.addColorStop(0.5, "#e8f1ff");
      gradient.addColorStop(1, "rgba(151,190,244,.92)");
      context.fillStyle = gradient;
      context.fillRect(x, middle - height, Math.max(1, size.width / barCount - 1), height * 2);
    }

    const playheadX = ((currentTime - viewStart) / visibleDuration) * size.width;
    if (playheadX >= 0 && playheadX <= size.width) {
      context.strokeStyle = "#ff5a6f";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(playheadX, 0);
      context.lineTo(playheadX, size.height);
      context.stroke();
      context.fillStyle = "#ff5a6f";
      context.beginPath();
      context.moveTo(playheadX - 5, 0);
      context.lineTo(playheadX + 5, 0);
      context.lineTo(playheadX, 8);
      context.closePath();
      context.fill();
    }
  }, [currentTime, draftRange, labels, segments, selectedAnnotationId, size, task.duration, viewStart, visibleDuration, waveform]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(frame);
  }, [draw]);

  const updatePlayhead = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentTime(audio.currentTime);
    if (audio.currentTime >= viewStart + visibleDuration - 0.15) {
      setViewStart(clamp(audio.currentTime - visibleDuration * 0.2, 0, Math.max(0, task.duration - visibleDuration)));
    }
    if (selectedSegment && audio.currentTime >= selectedSegment.end) {
      audio.currentTime = selectedSegment.start;
    }
    if (!audio.paused) animationRef.current = window.requestAnimationFrame(updatePlayhead);
  }, [selectedSegment, task.duration, viewStart, visibleDuration]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onPlay = () => {
      setPlaying(true);
      if (animationRef.current) window.cancelAnimationFrame(animationRef.current);
      animationRef.current = window.requestAnimationFrame(updatePlayhead);
    };
    const onPause = () => {
      setPlaying(false);
      if (animationRef.current) window.cancelAnimationFrame(animationRef.current);
    };
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onPause);
    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onPause);
    };
  }, [updatePlayhead]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  const seek = (time: number) => {
    const next = clamp(time, 0, task.duration);
    setCurrentTime(next);
    if (audioRef.current) audioRef.current.currentTime = next;
  };

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      if (selectedSegment && (audio.currentTime < selectedSegment.start || audio.currentTime >= selectedSegment.end)) {
        audio.currentTime = selectedSegment.start;
      }
      await audio.play();
    } else {
      audio.pause();
    }
  };

  const timeFromPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    return viewStart + ratio * visibleDuration;
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.matches("input, textarea, select, [contenteditable='true']")) return;
      if (event.code === "Space") {
        event.preventDefault();
        void togglePlay();
      }
      const label = labels.find((item) => item.hotkey === event.key);
      if (label) setActiveLabel(label.id);
      const key = event.key.toLowerCase();
      if (key === "v") setActiveTool("select");
      if (key === "s") setActiveTool("segment");
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
  }, [labels, nextTask, redo, removeAnnotation, selectedAnnotationId, setActiveLabel, setActiveTool, undo]);

  const commitRange = () => {
    if (!draftRange || !activeLabelId) return;
    const start = Math.min(draftRange.start, draftRange.end);
    const end = Math.max(draftRange.start, draftRange.end);
    if (end - start < 0.18) return;
    addAnnotation({
      id: `audio-segment-${Date.now()}`,
      taskId: task.id,
      kind: "audio-segment",
      labelId: activeLabelId,
      author: "当前标注员",
      createdAt: new Date().toISOString(),
      confidence: 0.94,
      start: Number(start.toFixed(2)),
      end: Number(end.toFixed(2)),
      transcript: "",
    });
    setDraftRange(null);
  };

  return (
    <Paper variant="outlined" sx={{ minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Stack direction="row" spacing={0.6} alignItems="center" sx={{ p: 1, borderBottom: "1px solid", borderColor: "divider", flexWrap: "wrap" }}>
        <Button size="small" variant={activeTool === "select" ? "contained" : "text"} onClick={() => setActiveTool("select")}>选择 V</Button>
        <Button size="small" variant={activeTool === "segment" ? "contained" : "text"} onClick={() => setActiveTool("segment")}>切片段 S</Button>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.4 }} />
        <IconButton color={playing ? "primary" : "default"} onClick={() => void togglePlay()}>
          {playing ? <PauseRounded /> : <PlayArrowRounded />}
        </IconButton>
        <Typography sx={{ fontSize: 12, fontFamily: "monospace", fontWeight: 800 }}>{formatTime(currentTime)} / {formatTime(task.duration)}</Typography>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.4 }} />
        <Tooltip title="缩小时间轴"><IconButton size="small" onClick={() => setZoom((value) => clamp(value / 1.35, 1, 12))}><ZoomOutRounded fontSize="small" /></IconButton></Tooltip>
        <Chip size="small" label={`${zoom.toFixed(1)}×`} />
        <Tooltip title="放大时间轴"><IconButton size="small" onClick={() => setZoom((value) => clamp(value * 1.35, 1, 12))}><ZoomInRounded fontSize="small" /></IconButton></Tooltip>
        <Button size="small" onClick={() => setPlaybackRate((value) => (value === 1 ? 1.5 : value === 1.5 ? 2 : 1))}>{playbackRate}×</Button>
        <Button size="small" startIcon={<UndoRounded />} disabled={false} onClick={undo}>撤销</Button>
        <Button size="small" startIcon={<RedoRounded />} disabled={false} onClick={redo}>重做</Button>
        <Typography sx={{ fontSize: 10.5, color: "text.secondary", ml: "auto" }}>
          空格播放 · 拖拽创建片段 · 点击片段精准回放
        </Typography>
      </Stack>

      <Box ref={containerRef} sx={{ position: "relative", flex: 1, minHeight: 300, overflow: "hidden" }}>
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: "100%", cursor: activeTool === "segment" ? "crosshair" : "zoom-in", touchAction: "none" }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            const time = timeFromPointer(event);
            dragStartRef.current = time;
            if (activeTool === "segment") setDraftRange({ start: time, end: time });
            else {
              const hit = [...segments].reverse().find((segment) => time >= segment.start && time <= segment.end);
              if (hit) {
                selectAnnotation(hit.id);
                seek(hit.start);
              } else {
                selectAnnotation(null);
                seek(time);
              }
            }
          }}
          onPointerMove={(event) => {
            if (activeTool !== "segment" || !draftRange) return;
            setDraftRange({ start: dragStartRef.current, end: timeFromPointer(event) });
          }}
          onPointerUp={() => {
            if (draftRange) commitRange();
          }}
          onWheel={(event) => {
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            const pointerRatio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
            const anchor = viewStart + pointerRatio * visibleDuration;
            const nextZoom = clamp(zoom * (event.deltaY > 0 ? 0.88 : 1.14), 1, 12);
            const nextDuration = task.duration / nextZoom;
            setZoom(nextZoom);
            setViewStart(clamp(anchor - pointerRatio * nextDuration, 0, Math.max(0, task.duration - nextDuration)));
          }}
        />
        <Box sx={{ position: "absolute", left: 12, top: 12, bgcolor: "rgba(15,23,42,.78)", color: "white", px: 1.1, py: 0.6, borderRadius: 1, fontSize: 10.5, display: "flex", gap: 0.7, alignItems: "center" }}>
          <GraphicEqRounded sx={{ fontSize: 15 }} /> 已识别 {segments.length} 个片段 · {task.speaker}
        </Box>
      </Box>

      {zoom > 1 && (
        <Box sx={{ px: 1.3, py: 0.8, borderTop: "1px solid", borderColor: "divider" }}>
          <input
            type="range"
            min={0}
            max={Math.max(0, task.duration - visibleDuration)}
            step={0.05}
            value={viewStart}
            style={{ width: "100%" }}
            onChange={(event) => setViewStart(Number(event.target.value))}
          />
        </Box>
      )}
      <LinearProgress variant="determinate" value={progress} sx={{ height: 3 }} />

      <Box sx={{ height: 154, minHeight: 154, overflow: "auto" }} className="scroll-area">
        <List dense disablePadding sx={{ p: 0.8 }}>
          {segments
            .slice()
            .sort((a, b) => a.start - b.start)
            .map((segment) => {
              const label = labels.find((item) => item.id === segment.labelId);
              return (
                <ListItemButton
                  key={segment.id}
                  selected={segment.id === selectedAnnotationId}
                  onClick={() => {
                    selectAnnotation(segment.id);
                    seek(segment.start);
                  }}
                  sx={{ borderRadius: 1, mb: 0.45 }}
                >
                  <Box sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: label?.color, mr: 1.1 }} />
                  <Typography sx={{ fontSize: 11, fontWeight: 850, minWidth: 94, fontFamily: "monospace" }}>
                    {formatTime(segment.start)} - {formatTime(segment.end)}
                  </Typography>
                  <Chip size="small" label={label?.name} sx={{ height: 20, mr: 1, bgcolor: `${label?.color}15`, color: label?.color }} />
                  <Typography noWrap sx={{ fontSize: 10.5, color: "text.secondary", flex: 1 }}>
                    {segment.transcript || "暂无转写内容，可继续补充片段标签"}
                  </Typography>
                  <IconButton
                    edge="end"
                    size="small"
                    color="error"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeAnnotation(segment.id);
                    }}
                  >
                    <DeleteOutlineRounded fontSize="small" />
                  </IconButton>
                </ListItemButton>
              );
            })}
        </List>
      </Box>
      <Divider />
      <Stack direction="row" spacing={1} alignItems="center" sx={{ p: 1, bgcolor: "grey.50" }}>
        <VolumeUpRounded fontSize="small" color="action" />
        <Typography sx={{ fontSize: 10.5, color: "text.secondary" }}>
          媒体文件由任务编号程序化生成，用于验证播放、切段和长音频时间轴交互。
        </Typography>
        <Button size="small" startIcon={<RestartAltRounded />} sx={{ ml: "auto" }} onClick={() => seek(0)}>回到开头</Button>
      </Stack>
      <audio ref={audioRef} src={audioUrl} preload="metadata" />
    </Paper>
  );
}
