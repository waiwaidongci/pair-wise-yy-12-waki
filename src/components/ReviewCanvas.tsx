import { useEffect, useRef } from "react";
import { Box } from "@mui/material";
import type { Annotation, AnnotationTask, ImageTask, TextSpanAnnotation } from "../types/annotation";
import { createSampleImage } from "../utils/sampleImage";
import { labelsByKind } from "../data/mockData";

export default function ReviewCanvas({
  task,
  annotations,
  visibility,
}: {
  task: AnnotationTask;
  annotations: Annotation[];
  visibility: Record<string, boolean>;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sampleRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (task.kind === "image") sampleRef.current = createSampleImage(task as ImageTask);
  }, [task]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    const width = parent?.clientWidth ?? 900;
    const height = parent?.clientHeight ?? 520;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const context = canvas.getContext("2d")!;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#101827";
    context.fillRect(0, 0, width, height);

    if (task.kind !== "image" || !sampleRef.current) return;
    const scale = Math.min(width / task.width, height / task.height) * 0.92;
    const offsetX = (width - task.width * scale) / 2;
    const offsetY = (height - task.height * scale) / 2;
    context.drawImage(sampleRef.current, offsetX, offsetY, task.width * scale, task.height * scale);

    for (const annotation of annotations) {
      if (!visibility[annotation.author]) continue;
      const label = labelsByKind.image.find((item) => item.id === annotation.labelId);
      context.save();
      context.strokeStyle = label?.color ?? "#ffffff";
      context.fillStyle = `${label?.color ?? "#ffffff"}22`;
      context.lineWidth = annotation.author === "何序" ? 3 : 2;
      context.setLineDash(annotation.author === "何序" ? [] : [8, 5]);
      if (annotation.kind === "bbox") {
        const x = offsetX + annotation.x * scale;
        const y = offsetY + annotation.y * scale;
        context.fillRect(x, y, annotation.width * scale, annotation.height * scale);
        context.strokeRect(x, y, annotation.width * scale, annotation.height * scale);
      }
      if (annotation.kind === "polygon") {
        context.beginPath();
        annotation.points.forEach((point, index) => {
          const x = offsetX + point.x * scale;
          const y = offsetY + point.y * scale;
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        });
        context.closePath();
        context.fill();
        context.stroke();
      }
      if (annotation.kind === "keypoint") {
        const x = offsetX + annotation.point.x * scale;
        const y = offsetY + annotation.point.y * scale;
        context.beginPath();
        context.arc(x, y, 8, 0, Math.PI * 2);
        context.fill();
        context.stroke();
      }
      context.restore();
    }
  }, [annotations, task, visibility]);

  if (task.kind === "image") {
    return <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />;
  }

  if (task.kind === "audio") {
    const total = task.duration;
    return (
      <Box sx={{ height: "100%", minHeight: 340, bgcolor: "#111827", px: 2, py: 3, position: "relative" }}>
        <Box sx={{ position: "absolute", left: 18, top: 14, color: "rgba(255,255,255,.58)", fontSize: 11 }}>
          多人片段审核 · 总时长 {Math.round(total)} 秒
        </Box>
        {[1, 2, 3, 4, 5].map((line) => (
          <Box key={line} sx={{ position: "absolute", left: 0, right: 0, top: `${line * 16}%`, borderTop: "1px solid rgba(255,255,255,.06)" }} />
        ))}
        {annotations.filter((annotation) => annotation.kind === "audio-segment" && visibility[annotation.author]).map((annotation) => {
          if (annotation.kind !== "audio-segment") return null;
          const label = labelsByKind.audio.find((item) => item.id === annotation.labelId);
          return (
            <Box
              key={annotation.id}
              sx={{
                position: "absolute",
                left: `${(annotation.start / total) * 100}%`,
                width: `${((annotation.end - annotation.start) / total) * 100}%`,
                top: annotation.author === "陆鸣" ? "34%" : "48%",
                height: 42,
                bgcolor: `${label?.color}bb`,
                border: `2px solid ${label?.color}`,
                borderRadius: 1,
                px: 0.8,
                overflow: "hidden",
              }}
            >
              <Box sx={{ color: "white", fontSize: 10.5, fontWeight: 800, whiteSpace: "nowrap" }}>{label?.name} · {annotation.author}</Box>
              <Box sx={{ color: "rgba(255,255,255,.78)", fontSize: 9.5, whiteSpace: "nowrap" }}>{annotation.start.toFixed(1)}s - {annotation.end.toFixed(1)}s</Box>
            </Box>
          );
        })}
        <Box sx={{ position: "absolute", left: 16, right: 16, bottom: 18 }}>
          <Box sx={{ height: 68, display: "flex", alignItems: "center", gap: "2px" }}>
            {Array.from({ length: 96 }, (_, index) => (
              <Box key={index} sx={{ flex: 1, height: `${18 + Math.abs(Math.sin(index * 1.7)) * 45}%`, bgcolor: "rgba(147,197,253,.52)", borderRadius: 1 }} />
            ))}
          </Box>
          <Box sx={{ display: "flex", justifyContent: "space-between", color: "rgba(255,255,255,.5)", fontSize: 9.5, mt: 0.5 }}>
            <span>00:00</span><span>{Math.round(total / 2)}s</span><span>{Math.round(total)}s</span>
          </Box>
        </Box>
      </Box>
    );
  }

  const spans = annotations.filter(
    (annotation): annotation is TextSpanAnnotation => annotation.kind === "text-span" && annotation.scope === "span",
  );
  return (
    <Box className="scroll-area" sx={{ height: "100%", minHeight: 420, overflowY: "auto", bgcolor: "#fafbfd", p: 3 }}>
      <Box className="annotation-text" sx={{ maxWidth: 900, mx: "auto", fontSize: 14.5, lineHeight: 2 }}>
        {Array.from(task.content).map((character, index) => {
          const hit = spans.find((span) => visibility[span.author] && index >= span.start && index < span.end);
          if (!hit || hit.kind !== "text-span") return <span key={`${index}-${character}`}>{character}</span>;
          const label = labelsByKind.text.find((item) => item.id === hit.labelId);
          if (spans.find((span) => span.start === index)?.id !== hit.id) return <span key={`${index}-${character}`}>{character}</span>;
          const text = task.content.slice(hit.start, hit.end);
          return (
            <Box
              component="span"
              key={hit.id}
              title={`${hit.author} · ${label?.name}`}
              sx={{ bgcolor: `${label?.color}28`, borderBottom: `2px solid ${label?.color}`, borderRadius: 0.5 }}
            >
              {text}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
