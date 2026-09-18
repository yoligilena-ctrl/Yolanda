#!/usr/bin/env node
// Detecta silencios en el audio de un video subido a public/ y genera un
// nuevo archivo (public/<video>.cuts.<ext>) con esos silencios recortados
// — 100% local con ffmpeg, sin ninguna API externa.
//
// Uso:
//   node scripts/cut-silence.mjs mi-video.webm
//   node scripts/cut-silence.mjs mi-video.webm --threshold=-35 --min-silence=0.8 --padding=0.1
//
// Requiere ffmpeg instalado y en el PATH.

import { existsSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import {
  runFfmpegCaptured,
  parseFfmpegDurationSeconds,
} from "./lib/ffmpeg-duration.mjs";

function parseArgs(argv) {
  const [videoFileName, ...rest] = argv;
  const options = { threshold: -30, minSilence: 0.6, padding: 0.15 };
  for (const arg of rest) {
    const [key, value] = arg.replace(/^--/, "").split("=");
    if (key === "threshold") options.threshold = Number(value);
    if (key === "min-silence") options.minSilence = Number(value);
    if (key === "padding") options.padding = Number(value);
  }
  return { videoFileName, options };
}

const { videoFileName, options } = parseArgs(process.argv.slice(2));

if (!videoFileName) {
  console.error("Uso: node scripts/cut-silence.mjs <archivo-en-public>.webm");
  process.exit(1);
}

const publicDir = path.join(process.cwd(), "public");
const inputPath = path.join(publicDir, videoFileName);

if (!existsSync(inputPath)) {
  console.error(`No se encontró ${inputPath}. El archivo debe estar en public/.`);
  process.exit(1);
}

const ext = path.extname(videoFileName);
const baseName = videoFileName.slice(0, -ext.length);
const outputPath = path.join(publicDir, `${baseName}.cuts${ext}`);

console.log(`Analizando silencios en ${videoFileName}...`);
const analysisOutput = runFfmpegCaptured([
  "-hide_banner",
  "-i",
  inputPath,
  "-vn",
  "-af",
  `silencedetect=noise=${options.threshold}dB:d=${options.minSilence}`,
  "-f",
  "null",
  "-",
]);

const duration = parseFfmpegDurationSeconds(analysisOutput);
if (duration === null) {
  console.error("No se pudo leer la duración del video. Salida de ffmpeg:");
  console.error(analysisOutput);
  process.exit(1);
}
console.log(
  `Duración detectada: ${(duration / 60).toFixed(1)} min (${duration.toFixed(1)}s).`,
);

const starts = [...analysisOutput.matchAll(/silence_start:\s*([\d.]+)/g)].map(
  (m) => Number(m[1]),
);
const ends = [...analysisOutput.matchAll(/silence_end:\s*([\d.]+)/g)].map(
  (m) => Number(m[1]),
);

// Si el video termina en silencio, ffmpeg reporta silence_start pero no
// llega a emitir el silence_end correspondiente (el archivo se acaba
// antes). Completamos ese último tramo hasta el final.
if (starts.length > ends.length) {
  ends.push(duration);
}

const silences = starts.map((start, i) => ({ start, end: ends[i] }));

if (silences.length === 0) {
  console.log("No se detectaron silencios con estos parámetros. Nada que recortar.");
  process.exit(0);
}

// Tramos a CONSERVAR: todo lo que no sea silencio, dejando un pequeño
// margen (padding) hacia adentro del silencio para no cortar palabras.
const keepSegments = [];
let cursor = 0;
for (const { start, end } of silences) {
  const keepEnd = Math.min(start + options.padding, end);
  if (keepEnd > cursor) {
    keepSegments.push({ start: cursor, end: keepEnd });
  }
  cursor = Math.max(cursor, end - options.padding);
}
if (cursor < duration) {
  keepSegments.push({ start: cursor, end: duration });
}

// Descarta tramos degenerados (silencios muy cortos que el padding dejó
// en ~0 de duración útil).
const MIN_KEEP_SECONDS = 0.05;
const finalSegments = keepSegments.filter(
  (seg) => seg.end - seg.start > MIN_KEEP_SECONDS,
);

if (finalSegments.length === 0) {
  console.error("Todo el video quedó clasificado como silencio. Probá con --threshold más bajo (ej. -40).");
  process.exit(1);
}

const originalDuration = duration;
const keptDuration = finalSegments.reduce(
  (sum, seg) => sum + (seg.end - seg.start),
  0,
);
console.log(
  `Silencios detectados: ${silences.length}. Tramos a conservar: ${finalSegments.length}.`,
);
console.log(
  `Duración original: ${originalDuration.toFixed(2)}s → nueva duración: ${keptDuration.toFixed(2)}s ` +
    `(-${(originalDuration - keptDuration).toFixed(2)}s).`,
);

// Cada tramo se recorta a su propio archivo temporal (con -ss/-to
// después de -i, para un corte preciso en vez de saltar al keyframe
// más cercano) y después se pegan todos con el demuxer "concat" — más
// robusto que trim+concat por filtro, que en algunos builds de ffmpeg
// sin el filtro de video "setpts" produce timestamps mal calculados.
const isWebm = ext === ".webm";
const codecArgs = isWebm
  ? ["-c:v", "libvpx-vp9", "-pix_fmt", "yuv420p", "-crf", "32", "-b:v", "0", "-c:a", "libopus"]
  : ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac"];

const tempDir = mkdtempSync(path.join(os.tmpdir(), "cut-silence-"));
const segmentPaths = finalSegments.map((_, i) => path.join(tempDir, `seg${i}${ext}`));

console.log(`Generando ${finalSegments.length} tramo(s)...`);
finalSegments.forEach((seg, i) => {
  console.log(
    `  Tramo ${i + 1}/${finalSegments.length} (${seg.start.toFixed(1)}s-${seg.end.toFixed(1)}s)...`,
  );
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "warning",
      "-i",
      inputPath,
      "-ss",
      String(seg.start),
      "-to",
      String(seg.end),
      ...codecArgs,
      segmentPaths[i],
    ],
    { stdio: "inherit" },
  );
});

const concatListPath = path.join(tempDir, "list.txt");
writeFileSync(
  concatListPath,
  segmentPaths.map((p) => `file '${p}'`).join("\n"),
);

console.log("Uniendo los tramos...");
execFileSync(
  "ffmpeg",
  [
    "-y",
    "-hide_banner",
    "-loglevel",
    "warning",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatListPath,
    "-c",
    "copy",
    outputPath,
  ],
  { stdio: "inherit" },
);

rmSync(tempDir, { recursive: true, force: true });

console.log(`Listo: ${outputPath}`);
console.log(
  `Usá videoFileName: "${path.basename(outputPath)}" en los props de la composición.`,
);
