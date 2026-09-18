import { spawnSync } from "node:child_process";

// Le pedimos a ffmpeg que analice un archivo (sin generar ninguna salida) y
// leemos la duración de su propio log en stderr. maxBuffer generoso para
// que archivos largos (muchos minutos de audio/video, con muchas líneas de
// progreso o eventos de silencedetect) nunca trunquen la captura — un
// video de 5-20+ minutos puede generar bastante más salida que el 1MB por
// defecto de Node, lo que antes podía cortar el análisis a mitad de
// camino sin ningún aviso claro.
const MAX_BUFFER_BYTES = 64 * 1024 * 1024;

export function runFfmpegCaptured(ffmpegArgs) {
  const result = spawnSync("ffmpeg", ffmpegArgs, {
    encoding: "utf8",
    maxBuffer: MAX_BUFFER_BYTES,
  });
  if (result.error) {
    throw new Error(
      `No se pudo ejecutar ffmpeg (${result.error.code ?? result.error.message}). ` +
        `¿Está instalado y en el PATH?`,
    );
  }
  return result.stderr ?? "";
}

export function parseFfmpegDurationSeconds(stderrText) {
  const match = stderrText.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

// Duración en segundos de un archivo de audio/video local, vía ffmpeg.
export function getMediaDurationSeconds(filePath) {
  const stderrText = runFfmpegCaptured(["-i", filePath, "-f", "null", "-"]);
  const duration = parseFfmpegDurationSeconds(stderrText);
  if (duration === null) {
    throw new Error(
      `No se pudo leer la duración de ${filePath}. Salida de ffmpeg:\n${stderrText}`,
    );
  }
  return duration;
}
