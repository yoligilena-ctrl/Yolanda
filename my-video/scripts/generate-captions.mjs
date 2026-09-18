#!/usr/bin/env node
// Genera subtítulos con timestamps por palabra usando la API de Whisper de
// OpenAI, y los guarda en public/<video>.captions.json en el formato
// Caption[] que espera @remotion/captions.
//
// Uso:
//   OPENAI_API_KEY="sk-..." node scripts/generate-captions.mjs mi-video.webm
//
// Requiere:
//   - ffmpeg instalado y disponible en el PATH (para extraer el audio).
//   - Node 18+ (usa fetch/FormData/Blob nativos).
//   - Una API key de OpenAI con acceso a la API de audio (variable de
//     entorno OPENAI_API_KEY). Nunca la escribas en este archivo.
//
// Videos largos: la API de Whisper rechaza archivos de más de 25MB
// (límite fijo de OpenAI, no de este proyecto). Para que eso no te deje
// sin subtítulos en un video de 20+ minutos, el audio se extrae a un
// bitrate fijo y bajo (64kbps mono, de sobra para que Whisper entienda la
// voz) y, si aun así supera el límite seguro, se corta en varias partes
// que se transcriben una por una y se pegan ajustando los tiempos de cada
// palabra para que sigan sincronizados con el video original completo.

import {
  existsSync,
  readFileSync,
  writeFileSync,
  statSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { openAiWhisperApiToCaptions } from "@remotion/openai-whisper";
import { getMediaDurationSeconds } from "./lib/ffmpeg-duration.mjs";

// Bitrate fijo (no VBR) para que el tamaño del audio sea predecible a
// partir de su duración, y así poder decidir de antemano cuántas partes
// hacen falta sin tener que extraer-y-reintentar.
export const AUDIO_BITRATE_KBPS = 64;
// 24MB de margen bajo el límite real de 25MB de la API de Whisper.
export const MAX_CHUNK_MB = 24;
export const MAX_CHUNK_SECONDS = Math.floor(
  (MAX_CHUNK_MB * 1024 * 8) / AUDIO_BITRATE_KBPS,
);

// Desplaza los tiempos de un Caption[] que vino de UNA parte del audio
// para que queden relativos al video completo en vez de al comienzo de
// esa parte.
export function offsetCaptions(captions, offsetMs) {
  return captions.map((caption) => ({
    ...caption,
    startMs: caption.startMs + offsetMs,
    endMs: caption.endMs + offsetMs,
    timestampMs: caption.timestampMs + offsetMs,
  }));
}

async function transcribeFile(filePath, apiKey) {
  const audioBuffer = readFileSync(filePath);
  const form = new FormData();
  form.append("file", new Blob([audioBuffer], { type: "audio/mpeg" }), path.basename(filePath));
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error de la API de Whisper (${response.status}): ${errorText}`);
  }
  return response.json();
}

async function main() {
  const [, , videoFileNameArg] = process.argv;

  if (!videoFileNameArg) {
    console.error(
      "Uso: node scripts/generate-captions.mjs <archivo-en-public>.webm",
    );
    process.exit(1);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("Falta la variable de entorno OPENAI_API_KEY.");
    console.error(
      `Corré: OPENAI_API_KEY="sk-..." node scripts/generate-captions.mjs ${videoFileNameArg}`,
    );
    process.exit(1);
  }

  const publicDir = path.join(process.cwd(), "public");
  const videoPath = path.join(publicDir, videoFileNameArg);

  if (!existsSync(videoPath)) {
    console.error(`No se encontró ${videoPath}. El archivo debe estar en public/.`);
    process.exit(1);
  }

  const baseName = videoFileNameArg.replace(/\.[^.]+$/, "");
  const outputPath = path.join(publicDir, `${baseName}.captions.json`);
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "captions-"));
  const fullAudioPath = path.join(tempDir, "full.mp3");
  const cleanup = () => rmSync(tempDir, { recursive: true, force: true });

  try {
    console.log("Extrayendo audio con ffmpeg...");
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-hide_banner",
        "-loglevel",
        "warning",
        "-i",
        videoPath,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "libmp3lame",
        "-b:a",
        `${AUDIO_BITRATE_KBPS}k`,
        fullAudioPath,
      ],
      { stdio: "inherit" },
    );

    const durationSeconds = getMediaDurationSeconds(fullAudioPath);
    const sizeMB = statSync(fullAudioPath).size / 1024 / 1024;
    console.log(
      `Audio extraído: ${(durationSeconds / 60).toFixed(1)} min, ${sizeMB.toFixed(1)}MB.`,
    );

    const numChunks = Math.max(1, Math.ceil(durationSeconds / MAX_CHUNK_SECONDS));
    if (numChunks === 1) {
      console.log("Transcribiendo con la API de Whisper (whisper-1)...");
    } else {
      console.log(
        `El audio supera el límite de tamaño de Whisper (25MB) en una sola parte — ` +
          `se va a transcribir en ${numChunks} partes de hasta ${(MAX_CHUNK_SECONDS / 60).toFixed(0)} min cada una.`,
      );
    }

    const allCaptions = [];
    for (let i = 0; i < numChunks; i++) {
      const chunkStart = i * MAX_CHUNK_SECONDS;
      const chunkEnd = Math.min((i + 1) * MAX_CHUNK_SECONDS, durationSeconds);
      let chunkPath = fullAudioPath;

      if (numChunks > 1) {
        chunkPath = path.join(tempDir, `chunk${i}.mp3`);
        console.log(
          `Transcribiendo parte ${i + 1}/${numChunks} (${chunkStart.toFixed(0)}s-${chunkEnd.toFixed(0)}s)...`,
        );
        execFileSync(
          "ffmpeg",
          [
            "-y",
            "-hide_banner",
            "-loglevel",
            "warning",
            "-i",
            fullAudioPath,
            "-ss",
            String(chunkStart),
            "-to",
            String(chunkEnd),
            "-c",
            "copy",
            chunkPath,
          ],
          { stdio: "inherit" },
        );
      }

      const transcript = await transcribeFile(chunkPath, apiKey);

      if (!transcript.words || transcript.words.length === 0) {
        console.log(`  (sin voz detectada en esta parte)`);
        continue;
      }

      // Cada parte se convierte de forma independiente (el conversor
      // oficial reconstruye espacios/puntuación comparando contra el
      // texto de ESA parte), y recién después se corrigen sus tiempos
      // para que queden relativos al video completo, no a la parte
      // individual.
      const { captions } = openAiWhisperApiToCaptions({ transcription: transcript });
      allCaptions.push(...offsetCaptions(captions, chunkStart * 1000));
    }

    if (allCaptions.length === 0) {
      throw new Error("La API no devolvió palabras con timestamps en ninguna parte del audio.");
    }

    writeFileSync(outputPath, JSON.stringify(allCaptions, null, 2));

    console.log(`\nListo: ${allCaptions.length} palabras transcritas.`);
    console.log(`Guardado en ${outputPath}`);
    console.log(
      `Usá videoCaptionsFileName: "${baseName}.captions.json" en los props de la composición.`,
    );
    if (numChunks > 1) {
      console.log(
        "Nota: al transcribirse en partes separadas, la palabra exacta en el corte entre " +
          "una parte y la siguiente puede quedar levemente distinta a como habría salido de " +
          "una sola pasada — el resto de la sincronización no se ve afectado.",
      );
    }
    cleanup();
  } catch (err) {
    console.error(String(err.message ?? err));
    cleanup();
    process.exit(1);
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main();
}
