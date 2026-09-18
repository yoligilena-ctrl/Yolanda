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

La duración de la escena se recalcula sola con cada instrucción —
por ejemplo, si recortas el video a 3 segundos o le pones velocidad
2x, el resto del video (transiciones, música) se ajusta automático.

**Importante sobre formatos:** en este entorno de sandbox, el
navegador headless usado para previsualizar y renderizar no tiene
soporte para H.264 (`.mp4` común de celulares/cámaras). Usa
`.webm` (VP8/VP9) para que funcione aquí. En tu propia máquina, con
Chrome normal, `.mp4` debería funcionar sin problemas.

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
