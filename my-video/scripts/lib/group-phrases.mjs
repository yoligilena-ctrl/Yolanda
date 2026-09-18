// Agrupa las palabras transcritas (Caption[], con espacios al inicio como
// las genera @remotion/openai-whisper) en frases, cortando cuando hay un
// silencio >= 700ms, una frase ya lleva más de 4000ms, o un pageBreakAfter
// explícito — los mismos criterios que usa createTikTokStyleCaptions en
// Composition.tsx, para que cualquier script que agrupe frases (reglas o
// IA) coincida con lo que se ve en pantalla.
export const BREAK_ON_SILENCE_MS = 700;
export const MAX_PHRASE_MS = 4000;

export function groupIntoPhrases(captions) {
  const phrases = [];
  let current = [];

  for (const caption of captions) {
    if (current.length === 0) {
      current.push(caption);
      continue;
    }
    const prev = current[current.length - 1];
    const gap = caption.startMs - prev.endMs;
    const phraseDuration = caption.endMs - current[0].startMs;
    if (
      prev.pageBreakAfter ||
      gap >= BREAK_ON_SILENCE_MS ||
      phraseDuration >= MAX_PHRASE_MS
    ) {
      phrases.push(current);
      current = [caption];
    } else {
      current.push(caption);
    }
  }
  if (current.length > 0) phrases.push(current);

  return phrases.map((words) => ({
    text: words.map((w) => w.text).join("").trim(),
    startMs: words[0].startMs,
    endMs: words[words.length - 1].endMs,
    wordCount: words.length,
  }));
}
