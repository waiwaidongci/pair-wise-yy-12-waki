import type { AudioTask } from "../types/annotation";

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1103515245 + 12345) >>> 0;
    return state / 4294967296;
  };
}

export function createWaveform(duration: number, seed: number, bars = 720): number[] {
  const next = random(seed);
  return Array.from({ length: bars }, (_, index) => {
    const position = index / bars;
    const speechEnvelope = Math.sin(position * Math.PI * 7 + seed) * 0.18 + 0.42;
    const pause = Math.sin(position * Math.PI * 13 + seed * 0.4) > 0.76 ? 0.12 : 1;
    return Math.min(1, Math.max(0.04, (next() * 0.62 + speechEnvelope) * pause));
  });
}

export function createMockAudioUrl(task: AudioTask): string {
  const sampleRate = 8000;
  const seconds = Math.min(task.duration, 36);
  const sampleCount = Math.floor(sampleRate * seconds);
  const buffer = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(buffer);
  const writeText = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
  };

  writeText(0, "RIFF");
  view.setUint32(4, 36 + sampleCount * 2, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, sampleCount * 2, true);

  const next = random(task.audioSeed);
  let smoothed = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate;
    const phrase = Math.sin(time * Math.PI * 1.2 + task.audioSeed) > -0.7 ? 1 : 0.1;
    const voice = Math.sin(time * 2 * Math.PI * (155 + (task.audioSeed % 55))) * 0.38;
    const harmonics = Math.sin(time * 2 * Math.PI * 310) * 0.12 + Math.sin(time * 2 * Math.PI * 620) * 0.06;
    const noise = (next() * 2 - 1) * 0.07;
    smoothed = smoothed * 0.56 + (voice + harmonics + noise) * 0.44;
    view.setInt16(44 + index * 2, Math.max(-1, Math.min(1, smoothed * phrase)) * 0x7fff, true);
  }

  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}
