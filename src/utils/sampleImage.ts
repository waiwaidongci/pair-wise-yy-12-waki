import type { ImageTask } from "../types/annotation";

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function createSampleImage(task: ImageTask): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = task.width;
  canvas.height = task.height;
  const context = canvas.getContext("2d")!;
  const next = random(task.imageSeed);
  const gradient = context.createLinearGradient(0, 0, task.width, task.height);
  gradient.addColorStop(0, "#71839a");
  gradient.addColorStop(0.48, "#aeb8c4");
  gradient.addColorStop(1, "#556273");
  context.fillStyle = gradient;
  context.fillRect(0, 0, task.width, task.height);

  for (let index = 0; index < 22; index += 1) {
    const x = next() * task.width;
    const y = next() * task.height;
    const size = 70 + next() * 260;
    context.fillStyle = `rgba(${Math.floor(35 + next() * 120)}, ${Math.floor(45 + next() * 120)}, ${Math.floor(55 + next() * 120)}, ${0.08 + next() * 0.18})`;
    context.beginPath();
    context.arc(x, y, size, 0, Math.PI * 2);
    context.fill();
  }

  context.fillStyle = "rgba(24, 32, 47, 0.78)";
  context.fillRect(0, task.height * 0.66, task.width, task.height * 0.34);
  context.fillStyle = "#e8edf3";
  context.fillRect(task.width * 0.08, task.height * 0.72, task.width * 0.38, task.height * 0.1);
  context.fillStyle = "#d4b24d";
  context.fillRect(task.width * 0.56, task.height * 0.7, task.width * 0.18, task.height * 0.17);
  context.fillStyle = "#3d4a5a";
  context.fillRect(task.width * 0.72, task.height * 0.18, task.width * 0.16, task.height * 0.3);
  context.fillStyle = "#91b5d5";
  context.fillRect(task.width * 0.76, task.height * 0.23, task.width * 0.08, task.height * 0.09);

  for (let index = 0; index < 900; index += 1) {
    const alpha = next() * 0.08;
    context.fillStyle = `rgba(255,255,255,${alpha})`;
    context.fillRect(next() * task.width, next() * task.height, 2, 2);
  }

  context.save();
  context.translate(task.width - 190, 44);
  context.fillStyle = "rgba(15,23,42,0.72)";
  context.fillRect(0, 0, 146, 44);
  context.fillStyle = "#ffffff";
  context.font = "700 18px Avenir Next, sans-serif";
  context.fillText(`CAM-${String(task.imageSeed).padStart(3, "0")}`, 18, 28);
  context.restore();
  return canvas;
}
