#!/usr/bin/env node
// Motor de instrucciones con LLM real (API de Anthropic/Claude): lee la
// transcripción ya generada (public/<video>.captions.json) y tu
// instrucción en texto libre, y le pide a Claude que elija qué frases son
// importantes y sugiera zooms/paneos/un callout — usando los MISMOS
// formatos de archivo que ya consumen videoEditPlanFileName y
// videoCameraMovesFileName (no hace falta tocar Composition.tsx).
//
// A diferencia de scripts/analyze-video.mjs (reglas locales, sin API),
// esto entiende instrucciones abstractas ("resalta lo más importante para
// alguien que nunca vio esto") porque un modelo de lenguaje real lee la
// transcripción — pero necesita red y una API key.
//
// El LLM NUNCA inventa timestamps: solo elige índices de una lista
// numerada de frases reales (extraídas localmente de la transcripción),
// y esos índices son lo único que se usa para armar el plan final. Los
// campos numéricos de zooms/callout se validan y se acotan al rango del
// video antes de escribirlos a disco.
//
// Uso:
//   ANTHROPIC_API_KEY="sk-ant-..." node scripts/ai-edit-plan.mjs mi-video.webm \
//     --instruction="resalta los momentos más importantes y poné una flecha cuando mencione el precio"
//
// Requiere:
//   - public/<video>.captions.json ya generado (`npm run captions`).
//   - Node 18+ (usa fetch nativo).
//   - Una API key de Anthropic (variable de entorno ANTHROPIC_API_KEY).
//     Nunca la escribas en este archivo.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { groupIntoPhrases } from "./lib/group-phrases.mjs";

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 2000;

function parseArgs(argv) {
  const [videoFileName, ...rest] = argv;
  const options = { instruction: "", model: DEFAULT_MODEL };
  for (const arg of rest) {
    const value = arg.slice(arg.indexOf("=") + 1);
    if (arg.startsWith("--instruction=")) {
      options.instruction = value;
    } else if (arg.startsWith("--model=")) {
      options.model = value;
    }
  }
  return { videoFileName, options };
}

// Arma el prompt: la transcripción como una lista numerada de frases
// reales (con sus tiempos), más la instrucción del usuario, pidiendo un
// JSON estricto. El LLM solo puede referirse a frases por su índice en
// esta lista — así es imposible que invente un timestamp que no exista.
export function buildPrompt({ phrases, instruction, totalDurationSeconds }) {
  const phraseList = phrases
    .map(
      (p, i) =>
        `${i}. [${(p.startMs / 1000).toFixed(1)}s-${(p.endMs / 1000).toFixed(1)}s] "${p.text}"`,
    )
    .join("\n");

  return `Sos un editor de video experto. Tenés la transcripción de un video (duración total: ${totalDurationSeconds.toFixed(1)}s), dividida en frases numeradas:

${phraseList}

Instrucción del usuario: "${instruction || "elegí las frases más importantes del video"}"

Respondé SOLO con un objeto JSON (sin texto adicional, sin markdown) con esta forma exacta:
{
  "highlightPhraseIndexes": [números de la lista de arriba, las frases más importantes según la instrucción, máximo 8],
  "cameraMoves": [
    { "startSeconds": número, "durationSeconds": número, "scale": número entre 1.2 y 2.5, "panXPercent": número 0-100, "panYPercent": número 0-100, "reason": "texto corto" }
  ],
  "calloutSuggestion": { "type": "arrow" o "circle", "startSeconds": número, "durationSeconds": número, "text": "texto corto", "xPercent": número 0-100, "yPercent": número 0-100, "direction": "up"/"down"/"left"/"right", "reason": "texto corto" } o null si no aplica ninguna instrucción de callout
}

Reglas:
- "highlightPhraseIndexes" son ÍNDICES de la lista numerada de arriba, no texto ni timestamps.
- Los tiempos de "cameraMoves" y "calloutSuggestion" deben estar entre 0 y ${totalDurationSeconds.toFixed(1)} segundos.
- "cameraMoves" puede ser una lista vacía si no hay ningún momento que amerite zoom/paneo.
- No agregues explicación, solo el JSON.`;
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  return JSON.parse(raw.trim());
}

function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// Toma el texto crudo de la respuesta del LLM + la lista real de frases,
// y arma un plan validado. Nunca confía en texto/tiempos que el LLM haya
// podido inventar: los highlights se reconstruyen desde `phrases` por
// índice, y todo lo demás se acota a rangos válidos.
export function parseAiResponse(responseText, { phrases, totalDurationSeconds }) {
  const parsed = extractJson(responseText);

  const highlightIndexes = Array.isArray(parsed.highlightPhraseIndexes)
    ? parsed.highlightPhraseIndexes
    : [];
  const highlights = [...new Set(highlightIndexes)]
    .filter((i) => Number.isInteger(i) && i >= 0 && i < phrases.length)
    .sort((a, b) => a - b)
    .slice(0, 8)
    .map((i) => ({
      text: phrases[i].text,
      startMs: phrases[i].startMs,
      endMs: phrases[i].endMs,
      reason: "ai",
    }));

  const cameraMovesRaw = Array.isArray(parsed.cameraMoves) ? parsed.cameraMoves : [];
  const cameraMoves = cameraMovesRaw
    .map((beat) => {
      const startSeconds = clamp(beat.startSeconds, 0, totalDurationSeconds, null);
      if (startSeconds === null) return null;
      const maxDuration = Math.max(0.1, totalDurationSeconds - startSeconds);
      const durationSeconds = clamp(beat.durationSeconds, 0.2, maxDuration, null);
      if (durationSeconds === null) return null;
      return {
        startSeconds: Math.round(startSeconds * 10) / 10,
        durationSeconds: Math.round(durationSeconds * 10) / 10,
        scale: clamp(beat.scale, 1.2, 2.5, 1.6),
        panXPercent: clamp(beat.panXPercent, 0, 100, 50),
        panYPercent: clamp(beat.panYPercent, 0, 100, 50),
      };
    })
    .filter(Boolean);

  let calloutSuggestion = null;
  if (parsed.calloutSuggestion && typeof parsed.calloutSuggestion === "object") {
    const c = parsed.calloutSuggestion;
    const startSeconds = clamp(c.startSeconds, 0, totalDurationSeconds, null);
    if (startSeconds !== null) {
      const maxDuration = Math.max(0.1, totalDurationSeconds - startSeconds);
      calloutSuggestion = {
        type: c.type === "circle" ? "circle" : "arrow",
        startSeconds: Math.round(startSeconds * 10) / 10,
        durationSeconds:
          Math.round(clamp(c.durationSeconds, 0.3, maxDuration, 1) * 10) / 10,
        xPercent: clamp(c.xPercent, 0, 100, 50),
        yPercent: clamp(c.yPercent, 0, 100, 50),
        direction: ["up", "down", "left", "right"].includes(c.direction)
          ? c.direction
          : "up",
        text: typeof c.text === "string" ? c.text.slice(0, 60) : "",
      };
    }
  }

  return { highlights, cameraMoves, calloutSuggestion };
}

async function callClaude({ apiKey, model, prompt }) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(
      `Error de la API de Anthropic (${response.status}): ${JSON.stringify(body)}`,
    );
  }
  return body.content.map((block) => block.text ?? "").join("");
}

async function main() {
  const { videoFileName, options } = parseArgs(process.argv.slice(2));

  if (!videoFileName) {
    console.error(
      'Uso: node scripts/ai-edit-plan.mjs <archivo-en-public>.webm --instruction="..."',
    );
    process.exit(1);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("Falta la variable de entorno ANTHROPIC_API_KEY.");
    console.error(
      `Corré: ANTHROPIC_API_KEY="sk-ant-..." node scripts/ai-edit-plan.mjs ${videoFileName} --instruction="..."`,
    );
    process.exit(1);
  }

  const publicDir = path.join(process.cwd(), "public");
  const baseName = videoFileName.replace(/\.[^.]+$/, "");
  const captionsPath = path.join(publicDir, `${baseName}.captions.json`);

  if (!existsSync(captionsPath)) {
    console.error(`No se encontró ${captionsPath}.`);
    console.error(`Primero corré: npm run captions -- ${videoFileName}`);
    process.exit(1);
  }

  const captions = JSON.parse(readFileSync(captionsPath, "utf8"));
  if (!Array.isArray(captions) || captions.length === 0) {
    console.error(`${captionsPath} está vacío o no tiene el formato esperado.`);
    process.exit(1);
  }

  const phrases = groupIntoPhrases(captions);
  const totalDurationSeconds = Math.max(...captions.map((c) => c.endMs)) / 1000;

  const prompt = buildPrompt({
    phrases,
    instruction: options.instruction,
    totalDurationSeconds,
  });

  console.log(`Consultando a ${options.model} (${phrases.length} frases, ${totalDurationSeconds.toFixed(1)}s de video)...`);

  const responseText = await callClaude({
    apiKey,
    model: options.model,
    prompt,
  });

  let plan;
  try {
    plan = parseAiResponse(responseText, { phrases, totalDurationSeconds });
  } catch (err) {
    console.error("No se pudo interpretar la respuesta del modelo como JSON. Respuesta cruda:");
    console.error(responseText);
    console.error(String(err));
    process.exit(1);
  }

  const editPlanPath = path.join(publicDir, `${baseName}.editplan.json`);
  writeFileSync(
    editPlanPath,
    JSON.stringify(
      {
        sourceCaptions: `${baseName}.captions.json`,
        instruction: options.instruction,
        totalPhrases: phrases.length,
        highlights: plan.highlights,
      },
      null,
      2,
    ),
  );
  console.log(`\nFrases destacadas por la IA: ${plan.highlights.length}.`);
  for (const h of plan.highlights) {
    console.log(`  [${(h.startMs / 1000).toFixed(1)}s-${(h.endMs / 1000).toFixed(1)}s] "${h.text}"`);
  }
  console.log(`Guardado en ${editPlanPath}`);
  console.log(`Usá videoEditPlanFileName: "${baseName}.editplan.json" en los props.`);

  if (plan.cameraMoves.length > 0) {
    const cameraMovesPath = path.join(publicDir, `${baseName}.cameramoves.json`);
    writeFileSync(
      cameraMovesPath,
      JSON.stringify({ beats: plan.cameraMoves }, null, 2),
    );
    console.log(`\nMovimientos de cámara sugeridos: ${plan.cameraMoves.length}.`);
    console.log(`Guardado en ${cameraMovesPath}`);
    console.log(`Usá videoCameraMovesFileName: "${baseName}.cameramoves.json" en los props.`);
  } else {
    console.log("\nLa IA no sugirió ningún zoom/paneo para este video.");
  }

  if (plan.calloutSuggestion) {
    const c = plan.calloutSuggestion;
    console.log("\nCallout sugerido — pegá estos valores en los props:");
    console.log(`  videoCalloutType: "${c.type}"`);
    console.log(`  videoCalloutStartSeconds: ${c.startSeconds}`);
    console.log(`  videoCalloutDurationSeconds: ${c.durationSeconds}`);
    console.log(`  videoCalloutXPercent: ${c.xPercent}`);
    console.log(`  videoCalloutYPercent: ${c.yPercent}`);
    console.log(`  videoCalloutDirection: "${c.direction}"`);
    console.log(`  videoCalloutText: "${c.text}"`);
  } else {
    console.log("\nLa IA no sugirió ningún callout para este video.");
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error(String(err));
    process.exit(1);
  });
}
