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

import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { openAiWhisperApiToCaptions } from "@remotion/openai-whisper";

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
const audioPath = path.join(publicDir, `${baseName}.captions-audio.mp3`);
const outputPath = path.join(publicDir, `${baseName}.captions.json`);

console.log("Extrayendo audio con ffmpeg...");
try {
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      videoPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "libmp3lame",
      "-q:a",
      "4",
      audioPath,
    ],
    { stdio: "inherit" },
  );
} catch {
  console.error(
    "No se pudo extraer el audio. ¿Tenés ffmpeg instalado y en el PATH?",
  );
  process.exit(1);
}

console.log("Transcribiendo con la API de Whisper (whisper-1)...");

const audioBuffer = readFileSync(audioPath);
const form = new FormData();
form.append("file", new Blob([audioBuffer], { type: "audio/mpeg" }), path.basename(audioPath));
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
  console.error(`Error de la API de Whisper (${response.status}): ${errorText}`);
  unlinkSync(audioPath);
  process.exit(1);
}

const transcript = await response.json();
unlinkSync(audioPath);

if (!transcript.words || transcript.words.length === 0) {
  console.error(
    "La API no devolvió palabras con timestamps. Respuesta completa:",
    transcript,
  );
  process.exit(1);
}

// Usa el conversor oficial de Remotion: reconstruye espacios y puntuación
// comparando cada palabra contra el texto completo (Whisper no los
// incluye en la lista de palabras), que es justo lo que
// createTikTokStyleCaptions necesita para agrupar bien las frases.
const { captions } = openAiWhisperApiToCaptions({ transcription: transcript });

writeFileSync(outputPath, JSON.stringify(captions, null, 2));

console.log(`Listo: ${captions.length} palabras transcritas.`);
console.log(`Guardado en ${outputPath}`);
console.log(
  `Usá videoCaptionsFileName: "${baseName}.captions.json" en los props de la composición.`,
);
