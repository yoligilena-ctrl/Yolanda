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

**Importante sobre formatos:** en este entorno de sandbox, el
navegador headless usado para previsualizar y renderizar no tiene
soporte para H.264 (`.mp4` común de celulares/cámaras). Usa
`.webm` (VP8/VP9) para que funcione aquí. En tu propia máquina, con
Chrome normal, `.mp4` debería funcionar sin problemas.

## Docs

Get started with Remotion by reading the [fundamentals page](https://www.remotion.dev/docs/the-fundamentals).

## Help

We provide help on our [Discord server](https://discord.gg/6VzzNDwUwV).

## Issues

Found an issue with Remotion? [File an issue here](https://github.com/remotion-dev/remotion/issues/new).

## License

Note that for some entities a company license is needed. [Read the terms here](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md).
