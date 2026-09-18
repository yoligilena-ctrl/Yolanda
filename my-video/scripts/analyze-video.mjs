#!/usr/bin/env node
// Motor de reglas (SIN llamadas a ningún LLM/API) que lee los subtítulos ya
// transcritos (public/<video>.captions.json, generado con `npm run
// captions`) y elige qué frases son "importantes", para que
// videoEditPlanFileName filtre los subtítulos y solo se muestren esas.
//
// No es comprensión de lenguaje natural real: busca palabras clave, ya sea
// pasadas directo (--keywords) o extraídas de una instrucción en texto
// libre con patrones simples ("cuando diga X", "que mencione Y", "sobre
// Z"). Si no encuentra ninguna keyword, se queda con las frases más
// "sustanciales" (ni muy cortas ni interminables) repartidas por el video.
//
// Uso:
//   node scripts/analyze-video.mjs mi-video.webm --keywords="precio,oferta"
//   node scripts/analyze-video.mjs mi-video.webm --instruction="resalta cuando hable de precio o de la oferta"
//   node scripts/analyze-video.mjs mi-video.webm --max-highlights=5

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { groupIntoPhrases } from "./lib/group-phrases.mjs";

function parseArgs(argv) {
  const [videoFileName, ...rest] = argv;
  const options = { keywords: [], instruction: "", maxHighlights: 5 };
  for (const arg of rest) {
    const value = arg.slice(arg.indexOf("=") + 1);
    if (arg.startsWith("--keywords=")) {
      options.keywords = value
        .split(",")
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean);
    } else if (arg.startsWith("--instruction=")) {
      options.instruction = value;
    } else if (arg.startsWith("--max-highlights=")) {
      options.maxHighlights = Math.max(1, Number(value) || 5);
    }
  }
  return { videoFileName, options };
}

// Extrae keywords de una instrucción en texto libre buscando patrones
// simples tipo "cuando diga X", "que mencione Y y Z", "sobre A, B o C".
// Esto NO es un parser de lenguaje natural: es un match de patrones fijos.
function extractKeywordsFromInstruction(instruction) {
  if (!instruction) return [];
  const lower = instruction.toLowerCase();
  const triggerPattern =
    /(?:cuando (?:diga|mencione|hable de|hable sobre)|que (?:diga|mencione)|sobre|acerca de)\s+([^.;]+)/g;
  const leadingStopwords = /^(?:de la|de los|de las|de el|de|la|los|las|el|un|una)\s+/;

  const found = [];
  let match;
  while ((match = triggerPattern.exec(lower)) !== null) {
    const chunk = match[1];
    const words = chunk
      .split(/,|\by\b|\bo\b/)
      .map((w) => w.trim().replace(/[¿?¡!"'.]/g, ""))
      .map((w) => w.replace(leadingStopwords, "").replace(leadingStopwords, ""))
      .map((w) => w.trim())
      .filter(Boolean);
    found.push(...words);
  }
  return [...new Set(found)];
}

function scorePhrase(phrase, keywords) {
  const lowerText = phrase.text.toLowerCase();
  const matchedKeywords = keywords.filter((k) => lowerText.includes(k));

  // Ni muletillas sueltas ni un monólogo entero: una frase "sustancial"
  // típica ronda entre 3 y 14 palabras.
  const lengthScore =
    phrase.wordCount >= 3 && phrase.wordCount <= 14 ? 1 : 0.3;

  const keywordScore = matchedKeywords.length * 5;

  return {
    ...phrase,
    score: lengthScore + keywordScore,
    matchedKeywords,
  };
}

const { videoFileName, options } = parseArgs(process.argv.slice(2));

if (!videoFileName) {
  console.error("Uso: node scripts/analyze-video.mjs <archivo-en-public>.webm [--keywords=\"a,b\"] [--instruction=\"...\"] [--max-highlights=5]");
  process.exit(1);
}

const publicDir = path.join(process.cwd(), "public");
const baseName = videoFileName.replace(/\.[^.]+$/, "");
const captionsPath = path.join(publicDir, `${baseName}.captions.json`);
const outputPath = path.join(publicDir, `${baseName}.editplan.json`);

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

const keywords = [
  ...new Set([
    ...options.keywords,
    ...extractKeywordsFromInstruction(options.instruction),
  ]),
];

const phrases = groupIntoPhrases(captions).map((p) => scorePhrase(p, keywords));

const keywordMatches = phrases.filter((p) => p.matchedKeywords.length > 0);

// Si hay keywords y alguna frase las contiene, nos quedamos SOLO con esas
// (es justo lo que pidió la instrucción). Si no matchean ninguna, o no se
// dio ninguna keyword, caemos al modo heurístico: las frases más
// "sustanciales" del video, ordenadas por puntaje.
const candidates = keywordMatches.length > 0 ? keywordMatches : phrases;

const highlights = candidates
  .filter((p) => p.score > 0)
  .sort((a, b) => b.score - a.score)
  .slice(0, options.maxHighlights)
  .sort((a, b) => a.startMs - b.startMs)
  .map((p) => ({
    text: p.text,
    startMs: p.startMs,
    endMs: p.endMs,
    score: Math.round(p.score * 10) / 10,
    reason:
      p.matchedKeywords.length > 0
        ? `keyword:${p.matchedKeywords.join(",")}`
        : "heuristic",
  }));

const editPlan = {
  sourceCaptions: `${baseName}.captions.json`,
  keywords,
  totalPhrases: phrases.length,
  highlights,
};

writeFileSync(outputPath, JSON.stringify(editPlan, null, 2));

console.log(`Frases detectadas: ${phrases.length}. Destacadas: ${highlights.length}.`);
if (keywords.length > 0) {
  console.log(`Keywords usadas: ${keywords.join(", ")}`);
}
for (const h of highlights) {
  console.log(`  [${(h.startMs / 1000).toFixed(1)}s-${(h.endMs / 1000).toFixed(1)}s] (${h.reason}) "${h.text}"`);
}
console.log(`Guardado en ${outputPath}`);
console.log(`Usá videoEditPlanFileName: "${baseName}.editplan.json" en los props de la composición.`);
