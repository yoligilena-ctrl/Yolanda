# Remotion video

<p align="center">
  <a href="https://github.com/remotion-dev/logo">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://github.com/remotion-dev/logo/raw/main/animated-logo-banner-dark.apng">
      <img alt="Animated Remotion Logo" src="https://github.com/remotion-dev/logo/raw/main/animated-logo-banner-light.gif">
    </picture>
  </a>
</p>

Welcome to your Remotion project!

## Commands

**Install Dependencies**

```console
npm i
```

**Start Preview**

```console
npm run dev
```

**Render video**

```console
npx remotion render
```

**Upgrade Remotion**

```console
npx remotion upgrade
```

## Usar tu propio video

El proyecto puede incluir un video que tú subas, como una escena más
entre el título y el subtítulo:

1. Corre `npm run dev` para abrir el Studio.
2. En el panel izquierdo, click en la pestaña **Assets** y arrastra tu
   archivo de video ahí (esto lo copia a `public/`).
3. Abre el panel de props de la composición (ícono `</>` arriba) y
   escribe el nombre exacto del archivo en `videoFileName` (por
   ejemplo `"mi-video.webm"`).
4. El Studio recalcula automáticamente la duración total del video
   según la duración real de tu archivo — no hay que tocar código.

### Transformar el video con instrucciones

En ese mismo panel de props puedes agregar estas "instrucciones" de
edición, sin tocar código:

- `videoTrimStartSeconds` / `videoTrimEndSeconds`: recorta el video
  (segundos a saltar desde el inicio / hasta dónde llegar). `0` en
  `videoTrimEndSeconds` significa "hasta el final real del archivo".
- `videoPlaybackRate`: velocidad de reproducción (`1` normal, `2`
  doble de rápido, `0.5` mitad de velocidad).
- `videoOverlayText`: texto que aparece superpuesto abajo del video
  (vacío = sin overlay).
- `videoZoomStartSeconds` / `videoZoomDurationSeconds` /
  `videoZoomScale`: zoom ("punch-in") manual en un momento del video
  ya recortado — cuándo empieza, cuánto dura y a qué escala llega
  (ej. `1.5` = 50% más cerca). `videoZoomDurationSeconds` en `0`
  desactiva el efecto (por defecto). El zoom siempre centra en medio
  del cuadro; hace ease in/out, no es un salto brusco.
- `videoCalloutType` (`"arrow"` o `"circle"`), `videoCalloutStartSeconds`,
  `videoCalloutDurationSeconds`, `videoCalloutXPercent`/`YPercent`
  (posición, 0-100), `videoCalloutDirection` (`"up"`/`"down"`/`"left"`/`"right"`,
  solo para `arrow`), `videoCalloutText` (etiqueta opcional): flecha o
  círculo resaltado en un momento y lugar del video, con pulso continuo
  mientras está visible. `videoCalloutDurationSeconds` en `0` desactiva
  el efecto (por defecto).

La duración de la escena se recalcula sola con cada instrucción —
por ejemplo, si recortas el video a 3 segundos o le pones velocidad
2x, el resto del video (transiciones, música) se ajusta automático.

### Subtítulos animados (con la API de Whisper de OpenAI)

1. Necesitás [ffmpeg](https://ffmpeg.org/) instalado en tu máquina y una
   [API key de OpenAI](https://platform.openai.com/api-keys) con acceso
   a la API de audio.
2. Corré, desde `my-video/`:
   ```console
   OPENAI_API_KEY="sk-..." npm run captions -- mi-video.webm
   ```
   Esto extrae el audio, lo transcribe con `whisper-1` (con timestamps
   por palabra), y guarda `public/mi-video.captions.json`.
3. En el panel de props, poné `videoCaptionsFileName` como
   `"mi-video.captions.json"`.

Los subtítulos aparecen agrupados por frase, resaltando la palabra que
se está diciendo en ese momento (estilo TikTok) — **solo mientras hay
voz**; en los silencios no se muestra nada. Si le pusiste recorte
(`videoTrimStartSeconds`) o velocidad (`videoPlaybackRate`) al video, la
sincronización de los subtítulos se ajusta sola.

**Importante:** `api.openai.com` está bloqueado en este entorno de
sandbox (mismo tipo de restricción de red que bloquea Hugging Face y
GitHub Releases), así que `npm run captions` no va a funcionar acá —
corrélo en tu propia máquina o en un entorno sin esa restricción.

**Importante sobre formatos:** en este entorno de sandbox, el
navegador headless usado para previsualizar y renderizar no tiene
soporte para H.264 (`.mp4` común de celulares/cámaras). Usa
`.webm` (VP8/VP9) para que funcione aquí. En tu propia máquina, con
Chrome normal, `.mp4` debería funcionar sin problemas.

### Cortes automáticos por silencio

Si tu video tiene pausas largas (silencios entre frases), podés generar
una copia con esos tramos recortados automáticamente — **100% local con
ffmpeg, sin ninguna API externa**, así que funciona en cualquier entorno:

1. Necesitás [ffmpeg](https://ffmpeg.org/) instalado en tu máquina y en
   el `PATH`.
2. Subí tu video a `public/` (ver "Usar tu propio video" más arriba).
3. Corré, desde `my-video/`:
   ```console
   npm run cut-silence -- mi-video.webm
   ```
   Esto detecta los tramos de silencio con `ffmpeg silencedetect` y
   genera `public/mi-video.cuts.webm` (o `.mp4`, según la extensión de
   entrada) con esos tramos quitados, dejando el resto del audio y video
   pegado sin cortes.
4. En el panel de props, poné `videoFileName` como
   `"mi-video.cuts.webm"` — el resto de las instrucciones (zoom,
   callouts, subtítulos, overlay) funcionan igual sobre el video ya
   recortado.

Parámetros opcionales:

- `--threshold=-30`: qué tan silencioso (en dB) tiene que ser el audio
  para contar como silencio. Más negativo = más estricto (detecta
  menos silencios). Si tu video tiene ruido de fondo y no detecta
  pausas, probá `--threshold=-40`.
- `--min-silence=0.6`: duración mínima en segundos para que una pausa
  cuente como silencio a cortar (evita cortar micro-pausas normales
  del habla).
- `--padding=0.15`: cuántos segundos de silencio dejar pegados a cada
  lado del corte, para no comerse el inicio/final de una palabra.

Ejemplo con parámetros ajustados:

```console
npm run cut-silence -- mi-video.webm --threshold=-35 --min-silence=0.8 --padding=0.1
```

### Corrección de color cinematográfica

El prop `videoColorGrade` aplica un "look" profesional sobre tu video **sin
tocar el archivo original** — es un filtro que se aplica en pantalla (y al
renderizar), 100% local (filtros CSS estándar, sin LUTs ni servicios
externos):

- `"none"` (por defecto): sin cambios.
- `"cinematic"`: más contraste y saturación, un toque de calidez y una
  viñeta suave en los bordes — el look "cine" clásico.
- `"warm"`: más cálido (naranja/piel), sin viñeta.
- `"cool"`: tono más frío/azulado.
- `"bw"`: blanco y negro con contraste realzado.

Poné `videoColorGrade` en el panel de props (o por `--props`). Combina sin
problema con zoom, callouts, cortes y subtítulos — se aplica siempre sobre
el video ya procesado por las demás instrucciones.

### Plan de edición automático: subtítulos solo en las frases importantes

Por defecto, si activás `videoCaptionsFileName`, se muestran *todos* los
subtítulos transcritos. Para que solo aparezcan en las frases que vos
decidas importantes, hay un motor de reglas local (`scripts/analyze-video.mjs`,
**sin ningún LLM ni API** — es un extractor de palabras clave, no
comprensión de lenguaje natural real):

1. Necesitás haber generado los subtítulos primero (`npm run captions`,
   ver arriba).
2. Corré, desde `my-video/`:
   ```console
   npm run analyze -- mi-video.webm --keywords="precio,oferta"
   ```
   o con una instrucción en texto libre (reconoce patrones simples como
   "cuando diga/mencione X", "sobre Y"):
   ```console
   npm run analyze -- mi-video.webm --instruction="resalta cuando hable de precio o de la oferta"
   ```
   Esto agrupa la transcripción en frases y arma
   `public/mi-video.editplan.json` con las que contienen esas palabras
   clave. **Si ninguna frase matchea (o no le pasás keywords/instrucción),
   cae a un modo heurístico**: elige las frases más "sustanciales" del
   video (ni muletillas sueltas ni monólogos completos), hasta
   `--max-highlights` (default 5).
3. En el panel de props, poné `videoEditPlanFileName` como
   `"mi-video.editplan.json"` — ahora los subtítulos solo se muestran en
   esas frases. Si lo dejás vacío, se sigue mostrando todo (comportamiento
   de siempre, sin romper nada).

**Importante — qué tan "inteligente" es esto:** no hay ningún modelo de
lenguaje interpretando tu instrucción; es un buscador de palabras clave con
un puñado de patrones fijos. Funciona bien para pedidos concretos ("resalta
cuando diga X"), no para pedidos abstractos ("resalta lo más
interesante"). Conectar un LLM de verdad (OpenAI o Anthropic) para eso es
un paso pendiente, pensado para que puedas probarlo en tu propia máquina.

## Flujo completo recomendado (en tu máquina)

Con todas las funciones juntas, el orden para editar un video real es:

```console
npm i
npm run dev
```

1. Subí tu video a `public/` (pestaña **Assets** del Studio).
2. **(Opcional) Cortá los silencios:**
   ```console
   npm run cut-silence -- mi-video.webm
   ```
   → usa `mi-video.cuts.webm` de acá en adelante.
3. **(Opcional) Generá subtítulos** (necesita tu propia API key de OpenAI):
   ```console
   OPENAI_API_KEY="sk-..." npm run captions -- mi-video.cuts.webm
   ```
4. **(Opcional) Elegí qué frases destacar:**
   ```console
   npm run analyze -- mi-video.cuts.webm --keywords="lo que quieras resaltar"
   ```
5. En el panel de props del Studio (ícono `</>`), configurá:
   - `videoFileName`: `"mi-video.cuts.webm"`
   - `videoCaptionsFileName`: `"mi-video.cuts.captions.json"`
   - `videoEditPlanFileName`: `"mi-video.cuts.editplan.json"`
   - `videoColorGrade`: `"cinematic"` (o el que prefieras)
   - `videoCalloutType` / `videoCalloutStartSeconds` / etc. si querés una
     flecha o círculo en algún momento.
   - `aspectRatio`: `"vertical"` para Reels/Shorts.
6. Previsualizá en el Studio. Cuando estés conforme, renderizá:
   ```console
   npx remotion render MyComp out/video-final.mp4 --props='{"videoFileName":"mi-video.cuts.webm","videoCaptionsFileName":"mi-video.cuts.captions.json","videoEditPlanFileName":"mi-video.cuts.editplan.json","videoColorGrade":"cinematic","aspectRatio":"vertical"}'
   ```
   (o copiá el JSON completo de props que armaste en el panel del Studio,
   con el botón de copiar que tiene al lado).
7. **Importalo en CapCut** (ver sección de abajo) para los últimos
   retoques.

## Exportar para CapCut

CapCut **no tiene un formato de proyecto abierto ni documentado**
que se pueda generar desde afuera (su `.draft` interno es propietario
y no publica ningún SDK o spec) — así que no es posible crear un
"proyecto de CapCut" editable con las escenas como capas separadas
desde este repositorio.

Lo que sí funciona, y es como se usa CapCut en la práctica con
material externo: exportar un `.mp4` estándar (H.264 + AAC, que es
justo lo que ya generamos) e importarlo a CapCut como un clip más,
igual que cualquier video grabado con el celular. Desde ahí puedes
seguir editando dentro de CapCut normalmente.

Para eso, el prop `aspectRatio` controla el formato de salida:

- `"landscape"` (por defecto): 1280×720, 16:9 — YouTube/web.
- `"vertical"`: 720×1280, 9:16 — el formato que CapCut usa para
  TikTok/Reels/Shorts.
- `"square"`: 1080×1080, 1:1 — feed de Instagram.

Cámbialo en el panel de props del Studio, o al renderizar por CLI:

```console
npx remotion render MyComp out/video.mp4 --props='{"aspectRatio":"vertical"}'
```

Los tamaños de texto de las escenas se ajustan solos según el
formato elegido.

## Docs

Get started with Remotion by reading the [fundamentals page](https://www.remotion.dev/docs/the-fundamentals).

## Help

We provide help on our [Discord server](https://discord.gg/6VzzNDwUwV).

## Issues

Found an issue with Remotion? [File an issue here](https://github.com/remotion-dev/remotion/issues/new).

## License

Note that for some entities a company license is needed. [Read the terms here](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md).
