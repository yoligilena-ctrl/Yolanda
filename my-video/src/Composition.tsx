import { useEffect, useState } from "react";
import {
  CalculateMetadataFunction,
  Composition,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  AbsoluteFill,
  Audio,
  Video,
  Img,
  staticFile,
  delayRender,
  continueRender,
  cancelRender,
} from "remotion";
import {
  TransitionSeries,
  linearTiming,
  TransitionPresentation,
} from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { fade } from "@remotion/transitions/fade";
import { wipe } from "@remotion/transitions/wipe";
import { flip } from "@remotion/transitions/flip";
import { none } from "@remotion/transitions/none";
import { getVideoMetadata } from "@remotion/media-utils";
import { Caption, createTikTokStyleCaptions } from "@remotion/captions";

type Props = {
  titleText: string;
  subtitleText: string;
  outroText: string;
  creditsText: string;
  // Nombre del archivo subido a public/ (vía el panel "Assets" del Studio).
  // Vacío = no hay video propio, esa escena simplemente no aparece.
  videoFileName: string;
  // --- "Instrucciones" de edición sobre el video propio ---
  // Recorta el video: segundos a saltar desde el inicio / hasta dónde llegar
  // (0 = sin recorte / hasta el final real del archivo).
  videoTrimStartSeconds: number;
  videoTrimEndSeconds: number;
  // Velocidad de reproducción (1 = normal, 2 = doble, 0.5 = mitad).
  videoPlaybackRate: number;
  // Texto superpuesto sobre el video (vacío = sin overlay).
  videoOverlayText: string;
  // Zoom ("punch-in") en un momento del video, relativo al clip ya
  // recortado. videoZoomDurationSeconds = 0 desactiva el efecto.
  videoZoomStartSeconds: number;
  videoZoomDurationSeconds: number;
  videoZoomScale: number;
  // Movimiento de cámara simulado (zoom + paneo), con varios "beats"
  // posibles a lo largo del video: nombre del archivo
  // <video>.cameramoves.json en public/ (ver README). Vacío = se usa el
  // zoom simple de arriba (videoZoomStartSeconds/etc, centrado, un solo
  // momento) sin cambios. Con el archivo puesto, ese zoom simple se
  // ignora y se usan los beats del plan en su lugar (pueden apuntar a
  // cualquier punto del cuadro, no solo el centro).
  videoCameraMovesFileName: string;
  // Flecha o círculo resaltado sobre el video, en un momento y posición
  // dados. videoCalloutDurationSeconds = 0 desactiva el efecto (por
  // defecto). Posición en porcentaje del cuadro (0-100).
  videoCalloutType: "arrow" | "circle";
  videoCalloutStartSeconds: number;
  videoCalloutDurationSeconds: number;
  videoCalloutXPercent: number;
  videoCalloutYPercent: number;
  videoCalloutDirection: "up" | "down" | "left" | "right";
  videoCalloutText: string;
  // Subtítulos animados: nombre del archivo <nombre>.captions.json en
  // public/ (generado con `npm run captions -- <video>`, que llama a la
  // API de Whisper de OpenAI). Vacío = sin subtítulos. Se muestran
  // agrupados por frase/pausa natural, solo mientras hay voz — no todo
  // el video tiene texto encima todo el tiempo.
  videoCaptionsFileName: string;
  // Plan de edición: nombre del archivo <video>.editplan.json en public/
  // (generado con `npm run analyze -- <video>`), con la lista de frases
  // "importantes" que decidió el motor de reglas. Vacío = se muestran
  // todos los subtítulos (comportamiento por defecto, sin filtrar). Con un
  // plan puesto, los subtítulos SOLO aparecen en esas frases.
  videoEditPlanFileName: string;
  // Corrección de color: aplica un look profesional sobre el video tal
  // cual está (no modifica el archivo original, es un filtro en pantalla).
  // "none" = sin cambios (por defecto).
  videoColorGrade: "none" | "cinematic" | "warm" | "cool" | "bw";
  // B-roll: nombre del archivo <video>.broll.json en public/, con una
  // lista de clips/imágenes de apoyo propios para insertar en momentos
  // puntuales (ver README). Vacío = sin B-roll. No hay nada automático acá
  // — la lista la arma el usuario a mano, indicando qué archivo mostrar y
  // cuándo.
  videoBRollFileName: string;
  // Calculado automáticamente en calculateMetadata a partir del archivo real
  // y las instrucciones de recorte/velocidad; no se edita a mano.
  userVideoDurationInFrames: number;
  // Formato de salida. "vertical" (9:16) es el que suele importarse a
  // CapCut para TikTok/Reels/Shorts; "square" (1:1) para feed de
  // Instagram; "landscape" (16:9, por defecto) para YouTube/web.
  aspectRatio: "landscape" | "vertical" | "square";
  // Transición entre las escenas de la composición (intro, video propio,
  // subtítulo, cierre, créditos). "slide" (por defecto, igual que antes)
  // es un deslizamiento desde la izquierda. "auto" va alternando entre
  // varios estilos en cada corte, para que no se sienta repetitivo sin
  // tener que elegir a mano.
  sceneTransitionStyle:
    | "slide"
    | "fade"
    | "wipe"
    | "flip"
    | "none"
    | "auto";
};

const FPS = 30;

const DIMENSIONS: Record<Props["aspectRatio"], { width: number; height: number }> = {
  landscape: { width: 1280, height: 720 },
  vertical: { width: 720, height: 1280 },
  square: { width: 1080, height: 1080 },
};

// Los tamaños de fuente de las escenas están calibrados para el ancho
// "landscape" (1280px); esto los escala proporcionalmente en vertical/square.
const useTextScale = () => {
  const { width } = useVideoConfig();
  return width / DIMENSIONS.landscape.width;
};

// Duración de cada escena, en frames (30 fps)
const INTRO_DURATION = 90; // 3s
const SUBTITLE_DURATION = 105; // 3.5s
const OUTRO_DURATION = 90; // 3s
const CREDITS_DURATION = 90; // 3s
// Cada crossfade "muerde" frames de las dos escenas que une
const TRANSITION_DURATION = 15; // 0.5s
// Duración total sin video propio (4 escenas, 3 transiciones)
const BASE_DURATION =
  INTRO_DURATION +
  SUBTITLE_DURATION +
  OUTRO_DURATION +
  CREDITS_DURATION -
  3 * TRANSITION_DURATION; // 11s

// Corrección de color: combinaciones de filtros CSS estándar (sin LUTs, sin
// tocar el archivo original) que imitan looks de edición profesional.
const COLOR_GRADE_FILTERS: Record<Props["videoColorGrade"], string> = {
  none: "none",
  // Más contraste y saturación, un pelín de calidez y una leve viñeta
  // (agregada aparte, ver más abajo) — el look "cine" clásico.
  cinematic: "contrast(1.15) saturate(1.25) brightness(1.03) sepia(0.08) hue-rotate(-6deg)",
  warm: "contrast(1.05) saturate(1.15) brightness(1.06) sepia(0.2) hue-rotate(-8deg)",
  cool: "contrast(1.08) saturate(1.1) brightness(1.0) hue-rotate(10deg)",
  bw: "grayscale(1) contrast(1.15) brightness(1.05)",
};

// Ciclo usado por "auto": va alternando estilos en cada corte entre
// escenas, para que la edición no se sienta repetitiva sin tener que
// elegir un estilo a mano en cada video.
const AUTO_TRANSITION_CYCLE: Exclude<Props["sceneTransitionStyle"], "auto">[] = [
  "slide",
  "fade",
  "wipe",
  "flip",
];

const getTransitionPresentation = (
  style: Props["sceneTransitionStyle"],
  transitionIndex: number,
): TransitionPresentation<Record<string, unknown>> => {
  const resolvedStyle =
    style === "auto"
      ? AUTO_TRANSITION_CYCLE[transitionIndex % AUTO_TRANSITION_CYCLE.length]
      : style;
  switch (resolvedStyle) {
    case "fade":
      return fade();
    case "wipe":
      return wipe({ direction: "from-left" });
    case "flip":
      return flip({ direction: "from-left" });
    case "none":
      return none();
    case "slide":
    default:
      return slide({ direction: "from-left" });
  }
};

const calculateMetadata: CalculateMetadataFunction<Props> = async ({
  props,
}) => {
  if (!props.videoFileName) {
    return {
      durationInFrames: BASE_DURATION,
      ...DIMENSIONS[props.aspectRatio],
      props: { ...props, userVideoDurationInFrames: 0 },
    };
  }

  let durationInSeconds: number;
  try {
    ({ durationInSeconds } = await getVideoMetadata(
      staticFile(props.videoFileName),
    ));
  } catch (err) {
    // Causa típica: el archivo está en un formato/códec que el navegador
    // headless no puede leer (H.264 o HEVC de un celular, por ejemplo) —
    // convertilo a VP9/webm con ffmpeg primero (ver README, sección
    // "Usar tu propio video").
    throw new Error(
      `No se pudo leer "${props.videoFileName}" (${(err as Error).message ?? err}). ` +
        `¿Es un formato soportado? Si es .mp4 con H.264/HEVC (típico de celular), convertilo antes a ` +
        `VP9/webm con ffmpeg — ver la sección "Usar tu propio video" del README.`,
    );
  }

  // Aplica las instrucciones de recorte antes de calcular cuánto dura
  // realmente la escena.
  const trimStart = Math.max(0, props.videoTrimStartSeconds || 0);
  const trimEnd =
    props.videoTrimEndSeconds > 0
      ? Math.min(props.videoTrimEndSeconds, durationInSeconds)
      : durationInSeconds;
  const trimmedDurationSeconds = Math.max(0.1, trimEnd - trimStart);
  const playbackRate =
    props.videoPlaybackRate > 0 ? props.videoPlaybackRate : 1;

  const userVideoDurationInFrames = Math.max(
    1,
    Math.round((trimmedDurationSeconds / playbackRate) * FPS),
  );

  return {
    // Se agrega una escena y una transición más cuando hay video propio.
    durationInFrames:
      BASE_DURATION + userVideoDurationInFrames - TRANSITION_DURATION,
    ...DIMENSIONS[props.aspectRatio],
    props: { ...props, userVideoDurationInFrames },
  };
};

export const MyComposition = () => {
  return (
    <Composition
      id="MyComp"
      component={MyVideo}
      durationInFrames={BASE_DURATION}
      fps={30}
      width={1280}
      height={720}
      defaultProps={{
        titleText: "Generador de Videos",
        subtitleText: "Hecho 100% con código",
        outroText: "¡Hasta la próxima!",
        creditsText: "Hecho con Remotion",
        videoFileName: "",
        videoTrimStartSeconds: 0,
        videoTrimEndSeconds: 0,
        videoPlaybackRate: 1,
        videoOverlayText: "",
        videoZoomStartSeconds: 0,
        videoZoomDurationSeconds: 0,
        videoZoomScale: 1.5,
        videoCameraMovesFileName: "",
        videoCalloutType: "arrow",
        videoCalloutStartSeconds: 0,
        videoCalloutDurationSeconds: 0,
        videoCalloutXPercent: 50,
        videoCalloutYPercent: 50,
        videoCalloutDirection: "up",
        videoCalloutText: "",
        videoCaptionsFileName: "",
        videoEditPlanFileName: "",
        videoColorGrade: "none",
        videoBRollFileName: "",
        userVideoDurationInFrames: 0,
        aspectRatio: "landscape",
        sceneTransitionStyle: "slide",
      }}
      calculateMetadata={calculateMetadata}
    />
  );
};

export const MyVideo: React.FC<Props> = ({
  titleText,
  subtitleText,
  outroText,
  creditsText,
  videoFileName,
  videoTrimStartSeconds,
  videoPlaybackRate,
  videoOverlayText,
  videoZoomStartSeconds,
  videoZoomDurationSeconds,
  videoZoomScale,
  videoCameraMovesFileName,
  videoCalloutType,
  videoCalloutStartSeconds,
  videoCalloutDurationSeconds,
  videoCalloutXPercent,
  videoCalloutYPercent,
  videoCalloutDirection,
  videoCalloutText,
  videoCaptionsFileName,
  videoEditPlanFileName,
  videoColorGrade,
  videoBRollFileName,
  userVideoDurationInFrames,
  sceneTransitionStyle,
}) => {
  const hasUserVideo = userVideoDurationInFrames > 0;
  const totalDuration =
    BASE_DURATION +
    (hasUserVideo ? userVideoDurationInFrames - TRANSITION_DURATION : 0);

  return (
    <AbsoluteFill>
      <Audio
        src={staticFile("music.mp3")}
        volume={(frame) =>
          // Sube poco a poco durante casi todo el video y se
          // desvanece rápido en los últimos frames para evitar un corte seco.
          interpolate(
            frame,
            [0, totalDuration - 10, totalDuration],
            [0, 0.4, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          )
        }
      />
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={INTRO_DURATION}>
          <IntroScene titleText={titleText} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={getTransitionPresentation(sceneTransitionStyle, 0)}
          timing={linearTiming({ durationInFrames: TRANSITION_DURATION })}
        />
        {hasUserVideo && (
          <>
            <TransitionSeries.Sequence
              durationInFrames={userVideoDurationInFrames}
            >
              <UserVideoScene
                videoFileName={videoFileName}
                trimStartSeconds={videoTrimStartSeconds}
                playbackRate={videoPlaybackRate}
                overlayText={videoOverlayText}
                zoomStartSeconds={videoZoomStartSeconds}
                zoomDurationSeconds={videoZoomDurationSeconds}
                zoomScale={videoZoomScale}
                cameraMovesFileName={videoCameraMovesFileName}
                calloutType={videoCalloutType}
                calloutStartSeconds={videoCalloutStartSeconds}
                calloutDurationSeconds={videoCalloutDurationSeconds}
                calloutXPercent={videoCalloutXPercent}
                calloutYPercent={videoCalloutYPercent}
                calloutDirection={videoCalloutDirection}
                calloutText={videoCalloutText}
                captionsFileName={videoCaptionsFileName}
                editPlanFileName={videoEditPlanFileName}
                colorGrade={videoColorGrade}
                brollFileName={videoBRollFileName}
              />
            </TransitionSeries.Sequence>
            <TransitionSeries.Transition
              presentation={getTransitionPresentation(sceneTransitionStyle, 1)}
              timing={linearTiming({ durationInFrames: TRANSITION_DURATION })}
            />
          </>
        )}
        <TransitionSeries.Sequence durationInFrames={SUBTITLE_DURATION}>
          <SubtitleScene subtitleText={subtitleText} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={getTransitionPresentation(sceneTransitionStyle, 2)}
          timing={linearTiming({ durationInFrames: TRANSITION_DURATION })}
        />
        <TransitionSeries.Sequence durationInFrames={OUTRO_DURATION}>
          <OutroScene outroText={outroText} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={getTransitionPresentation(sceneTransitionStyle, 3)}
          timing={linearTiming({ durationInFrames: TRANSITION_DURATION })}
        />
        <TransitionSeries.Sequence durationInFrames={CREDITS_DURATION}>
          <CreditsScene creditsText={creditsText} />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};

// Escena 1: título con fundido + rebote de escala
const IntroScene: React.FC<{ titleText: string }> = ({ titleText }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const textScale = useTextScale();

  const scale = spring({
    frame,
    fps,
    config: { damping: 12 },
  });

  const opacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0b1020",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          transform: `scale(${scale})`,
          opacity,
          color: "white",
          fontSize: 70 * textScale,
          fontWeight: "bold",
          fontFamily: "sans-serif",
          textAlign: "center",
        }}
      >
        {titleText}
      </div>
    </AbsoluteFill>
  );
};

// Escena 2: subtítulo que entra deslizándose desde abajo
const SubtitleScene: React.FC<{ subtitleText: string }> = ({
  subtitleText,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const textScale = useTextScale();

  const translateY = spring({
    frame,
    fps,
    config: { damping: 14 },
    from: 60,
    to: 0,
  });

  const opacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#131a33",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          transform: `translateY(${translateY}px)`,
          opacity,
          color: "#8ecbff",
          fontSize: 46 * textScale,
          fontWeight: 600,
          fontFamily: "sans-serif",
          textAlign: "center",
        }}
      >
        {subtitleText}
      </div>
    </AbsoluteFill>
  );
};

// Escena 3: cierre con fondo de color y aparición tipo "pop"
const OutroScene: React.FC<{ outroText: string }> = ({ outroText }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const textScale = useTextScale();

  const scale = spring({
    frame,
    fps,
    config: { damping: 10, stiffness: 120 },
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#ff5c5c",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          transform: `scale(${scale})`,
          color: "white",
          fontSize: 60 * textScale,
          fontWeight: "bold",
          fontFamily: "sans-serif",
          textAlign: "center",
        }}
      >
        {outroText}
      </div>
    </AbsoluteFill>
  );
};

type CameraMoveBeat = {
  startSeconds: number;
  durationSeconds: number;
  scale: number;
  panXPercent?: number;
  panYPercent?: number;
};
type CameraMovesPlan = { beats: CameraMoveBeat[] };

// Movimiento de cámara simulado (zoom + paneo), con varios "beats"
// posibles a lo largo del video — ver <video>.cameramoves.json en el
// README. Cuando fileName está vacío no hace ningún fetch y devuelve el
// estado neutro de inmediato (sin afectar el zoom simple existente).
const useCameraMoves = (
  fileName: string,
): { scale: number; translateXPercent: number; translateYPercent: number } => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const [plan, setPlan] = useState<CameraMovesPlan | null>(null);

  useEffect(() => {
    if (!fileName) {
      setPlan(null);
      return;
    }
    const handle = delayRender(`Cargando movimientos de cámara: ${fileName}`);
    let cancelled = false;

    fetch(staticFile(fileName))
      .then((res) => {
        if (!res.ok) {
          throw new Error(`No se pudo cargar ${fileName} (HTTP ${res.status})`);
        }
        return res.json();
      })
      .then((data: CameraMovesPlan) => {
        if (!cancelled) {
          setPlan(data);
        }
        continueRender(handle);
      })
      .catch((err) => {
        cancelRender(err);
      });

    return () => {
      cancelled = true;
    };
  }, [fileName]);

  const neutral = { scale: 1, translateXPercent: 0, translateYPercent: 0 };

  if (!fileName || !plan) {
    return neutral;
  }

  const active = plan.beats.find((beat) => {
    const startFrame = Math.round(Math.max(0, beat.startSeconds) * fps);
    const durationFrames = Math.round(Math.max(0, beat.durationSeconds) * fps);
    return frame >= startFrame && frame < startFrame + durationFrames;
  });

  if (!active) {
    return neutral;
  }

  const startFrame = Math.round(Math.max(0, active.startSeconds) * fps);
  const durationFrames = Math.round(Math.max(0, active.durationSeconds) * fps);
  const endFrame = startFrame + durationFrames;
  const easeFrames = Math.min(10, Math.floor(durationFrames / 3));

  const scale = interpolate(
    frame,
    [startFrame, startFrame + easeFrames, endFrame - easeFrames, endFrame],
    [1, active.scale, active.scale, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const panXPercent = active.panXPercent ?? 50;
  const panYPercent = active.panYPercent ?? 50;

  // A escala 1 (sin zoom) no hay margen para panear — el offset crece con
  // la escala, hasta el valor pedido cuando el beat está en su punto
  // máximo, y vuelve a 0 al terminar (mismo ease que la escala).
  const panProgress = interpolate(
    frame,
    [startFrame, startFrame + easeFrames, endFrame - easeFrames, endFrame],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const maxOffsetXPercent = ((50 - panXPercent) / 50) * ((active.scale - 1) / active.scale) * 50;
  const maxOffsetYPercent = ((50 - panYPercent) / 50) * ((active.scale - 1) / active.scale) * 50;

  return {
    scale,
    translateXPercent: maxOffsetXPercent * panProgress,
    translateYPercent: maxOffsetYPercent * panProgress,
  };
};

// Escena de video propio: el archivo subido por el usuario a public/
// (vía el panel "Assets" del Studio), mostrado a pantalla completa, con
// las "instrucciones" de edición (recorte, velocidad, texto) aplicadas.
const UserVideoScene: React.FC<{
  videoFileName: string;
  trimStartSeconds: number;
  playbackRate: number;
  overlayText: string;
  zoomStartSeconds: number;
  zoomDurationSeconds: number;
  zoomScale: number;
  cameraMovesFileName: string;
  calloutType: "arrow" | "circle";
  calloutStartSeconds: number;
  calloutDurationSeconds: number;
  calloutXPercent: number;
  calloutYPercent: number;
  calloutDirection: "up" | "down" | "left" | "right";
  calloutText: string;
  captionsFileName: string;
  editPlanFileName: string;
  colorGrade: "none" | "cinematic" | "warm" | "cool" | "bw";
  brollFileName: string;
}> = ({
  videoFileName,
  trimStartSeconds,
  playbackRate,
  overlayText,
  zoomStartSeconds,
  zoomDurationSeconds,
  zoomScale,
  cameraMovesFileName,
  calloutType,
  calloutStartSeconds,
  calloutDurationSeconds,
  calloutXPercent,
  calloutYPercent,
  calloutDirection,
  calloutText,
  captionsFileName,
  editPlanFileName,
  colorGrade,
  brollFileName,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const textScale = useTextScale();

  const opacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Zoom ("punch-in") manual simple: ease in, se mantiene, ease out.
  // Desactivado cuando la duración es 0 (el estado por defecto), o cuando
  // hay un plan de movimientos de cámara (cameraMovesFileName) — en ese
  // caso el plan manda.
  const zoomStartFrame = Math.round(Math.max(0, zoomStartSeconds) * fps);
  const zoomDurationFrames = Math.round(Math.max(0, zoomDurationSeconds) * fps);
  const zoomEndFrame = zoomStartFrame + zoomDurationFrames;
  const zoomEaseFrames = Math.min(10, Math.floor(zoomDurationFrames / 3));
  const simpleZoomScale =
    zoomDurationFrames > 0
      ? interpolate(
          frame,
          [
            zoomStartFrame,
            zoomStartFrame + zoomEaseFrames,
            zoomEndFrame - zoomEaseFrames,
            zoomEndFrame,
          ],
          [1, zoomScale, zoomScale, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        )
      : 1;

  const cameraMoves = useCameraMoves(cameraMovesFileName);
  const videoScale = cameraMovesFileName ? cameraMoves.scale : simpleZoomScale;
  const videoTranslateXPercent = cameraMovesFileName
    ? cameraMoves.translateXPercent
    : 0;
  const videoTranslateYPercent = cameraMovesFileName
    ? cameraMoves.translateYPercent
    : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: "black", opacity, overflow: "hidden" }}>
      <Video
        src={staticFile(videoFileName)}
        trimBefore={Math.round(Math.max(0, trimStartSeconds) * fps)}
        playbackRate={playbackRate > 0 ? playbackRate : 1}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          transform: `scale(${videoScale}) translate(${videoTranslateXPercent}%, ${videoTranslateYPercent}%)`,
          filter: COLOR_GRADE_FILTERS[colorGrade],
        }}
      />
      {colorGrade === "cinematic" && (
        <AbsoluteFill
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.38) 100%)",
            pointerEvents: "none",
          }}
        />
      )}
      {brollFileName && (
        <BRoll fileName={brollFileName} colorGrade={colorGrade} />
      )}
      {overlayText && (
        <AbsoluteFill
          style={{
            justifyContent: "flex-end",
            alignItems: "center",
            paddingBottom: 48,
          }}
        >
          <div
            style={{
              color: "white",
              fontSize: 44 * textScale,
              fontWeight: "bold",
              fontFamily: "sans-serif",
              textAlign: "center",
              padding: "0 48px",
              textShadow: "0 2px 10px rgba(0,0,0,0.85)",
            }}
          >
            {overlayText}
          </div>
        </AbsoluteFill>
      )}
      <VideoCallout
        type={calloutType}
        startSeconds={calloutStartSeconds}
        durationSeconds={calloutDurationSeconds}
        xPercent={calloutXPercent}
        yPercent={calloutYPercent}
        direction={calloutDirection}
        text={calloutText}
      />
      {captionsFileName && (
        <AnimatedCaptions
          captionsFileName={captionsFileName}
          editPlanFileName={editPlanFileName}
          trimStartSeconds={trimStartSeconds}
          playbackRate={playbackRate > 0 ? playbackRate : 1}
        />
      )}
    </AbsoluteFill>
  );
};

// Flecha o círculo resaltado, activable manualmente en un momento y
// posición del video. Se dibuja fuera del <Video>, así que el zoom no
// lo afecta (siempre queda anclado al cuadro, no al contenido).
const VideoCallout: React.FC<{
  type: "arrow" | "circle";
  startSeconds: number;
  durationSeconds: number;
  xPercent: number;
  yPercent: number;
  direction: "up" | "down" | "left" | "right";
  text: string;
}> = ({
  type,
  startSeconds,
  durationSeconds,
  xPercent,
  yPercent,
  direction,
  text,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const textScale = useTextScale();

  const startFrame = Math.round(Math.max(0, startSeconds) * fps);
  const durationFrames = Math.round(Math.max(0, durationSeconds) * fps);

  if (durationFrames <= 0) {
    return null;
  }

  const endFrame = startFrame + durationFrames;
  if (frame < startFrame || frame > endFrame) {
    return null;
  }

  const localSeconds = (frame - startFrame) / fps;
  const fadeFrames = Math.min(8, Math.floor(durationFrames / 4));
  const opacity = interpolate(
    frame,
    [startFrame, startFrame + fadeFrames, endFrame - fadeFrames, endFrame],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  // Pulso continuo mientras está visible, para llamar la atención.
  const pulse = 1 + 0.08 * Math.sin(localSeconds * Math.PI * 3);

  const rotationByDirection: Record<typeof direction, number> = {
    up: 0,
    right: 90,
    down: 180,
    left: 270,
  };

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: `${xPercent}%`,
          top: `${yPercent}%`,
          transform: "translate(-50%, -50%)",
          opacity,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8 * textScale,
        }}
      >
        {type === "arrow" ? (
          <svg
            width={70 * textScale}
            height={90 * textScale}
            viewBox="0 0 70 90"
            style={{
              transform: `rotate(${rotationByDirection[direction]}deg) scale(${pulse})`,
            }}
          >
            <polygon
              points="35,0 70,40 48,40 48,90 22,90 22,40 0,40"
              fill="#ffd23f"
              stroke="black"
              strokeWidth={3}
            />
          </svg>
        ) : (
          <div
            style={{
              width: 110 * textScale * pulse,
              height: 110 * textScale * pulse,
              borderRadius: "50%",
              border: `${6 * textScale}px solid #ffd23f`,
              boxShadow: "0 0 20px rgba(255,210,63,0.8)",
            }}
          />
        )}
        {text && (
          <div
            style={{
              color: "white",
              backgroundColor: "rgba(0,0,0,0.75)",
              padding: `${6 * textScale}px ${14 * textScale}px`,
              borderRadius: 8,
              fontSize: 28 * textScale,
              fontWeight: "bold",
              fontFamily: "sans-serif",
              whiteSpace: "nowrap",
            }}
          >
            {text}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

type BRollInsertion = {
  assetFileName: string;
  startSeconds: number;
  durationSeconds: number;
  // "full": tapa toda la pantalla (cutaway clásico — el audio del video
  // principal sigue sonando abajo). "pip": recuadro superpuesto en una
  // esquina, mientras se sigue viendo el video principal atrás.
  style: "full" | "pip";
  xPercent?: number;
  yPercent?: number;
  widthPercent?: number;
};
type BRollPlan = { insertions: BRollInsertion[] };

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif"];

// B-roll: clips o imágenes de apoyo propios, insertados en momentos
// puntuales según un archivo <video>.broll.json en public/ (ver README —
// la lista de inserciones se arma a mano, no hay selección automática de
// contenido). Los tiempos son relativos a la escena del video ya recortado
// (igual que zoom/callout), no al archivo original.
const BRoll: React.FC<{
  fileName: string;
  colorGrade: "none" | "cinematic" | "warm" | "cool" | "bw";
}> = ({ fileName, colorGrade }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const [plan, setPlan] = useState<BRollPlan | null>(null);

  useEffect(() => {
    const handle = delayRender(`Cargando plan de B-roll: ${fileName}`);
    let cancelled = false;

    fetch(staticFile(fileName))
      .then((res) => {
        if (!res.ok) {
          throw new Error(`No se pudo cargar ${fileName} (HTTP ${res.status})`);
        }
        return res.json();
      })
      .then((data: BRollPlan) => {
        if (!cancelled) {
          setPlan(data);
        }
        continueRender(handle);
      })
      .catch((err) => {
        cancelRender(err);
      });

    return () => {
      cancelled = true;
    };
  }, [fileName]);

  if (!plan || plan.insertions.length === 0) {
    return null;
  }

  const active = plan.insertions.find((insertion) => {
    const startFrame = Math.round(Math.max(0, insertion.startSeconds) * fps);
    const durationFrames = Math.round(
      Math.max(0, insertion.durationSeconds) * fps,
    );
    return frame >= startFrame && frame < startFrame + durationFrames;
  });

  if (!active) {
    return null;
  }

  const startFrame = Math.round(Math.max(0, active.startSeconds) * fps);
  const durationFrames = Math.round(Math.max(0, active.durationSeconds) * fps);
  const endFrame = startFrame + durationFrames;
  const fadeFrames = Math.min(8, Math.floor(durationFrames / 4));
  const opacity = interpolate(
    frame,
    [startFrame, startFrame + fadeFrames, endFrame - fadeFrames, endFrame],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const isImage = IMAGE_EXTENSIONS.some((ext) =>
    active.assetFileName.toLowerCase().endsWith(ext),
  );

  const mediaStyle = { filter: COLOR_GRADE_FILTERS[colorGrade] };

  const media = isImage ? (
    <Img
      src={staticFile(active.assetFileName)}
      style={{ width: "100%", height: "100%", objectFit: "cover", ...mediaStyle }}
    />
  ) : (
    <Video
      src={staticFile(active.assetFileName)}
      style={{ width: "100%", height: "100%", objectFit: "cover", ...mediaStyle }}
    />
  );

  if (active.style === "full") {
    return (
      <AbsoluteFill style={{ opacity, backgroundColor: "black" }}>
        {media}
      </AbsoluteFill>
    );
  }

  const widthPercent = active.widthPercent ?? 35;
  const xPercent = active.xPercent ?? 72;
  const yPercent = active.yPercent ?? 72;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: `${xPercent}%`,
          top: `${yPercent}%`,
          transform: "translate(-50%, -50%)",
          width: `${widthPercent}%`,
          aspectRatio: "16 / 9",
          opacity,
          borderRadius: 10,
          overflow: "hidden",
          border: "3px solid white",
          boxShadow: "0 6px 24px rgba(0,0,0,0.5)",
        }}
      >
        {media}
      </div>
    </AbsoluteFill>
  );
};

// Subtítulos animados estilo TikTok, generados a partir de un archivo
// <video>.captions.json en public/ (ver scripts/generate-captions.mjs,
// que llama a la API de Whisper de OpenAI). Se agrupan por frase/pausa
// natural y solo aparecen mientras hay voz — no todo el video tiene
// texto encima todo el tiempo.
type EditPlanHighlight = { text: string; startMs: number; endMs: number };
type EditPlan = { highlights: EditPlanHighlight[] };

const AnimatedCaptions: React.FC<{
  captionsFileName: string;
  editPlanFileName: string;
  trimStartSeconds: number;
  playbackRate: number;
}> = ({ captionsFileName, editPlanFileName, trimStartSeconds, playbackRate }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const textScale = useTextScale();
  const [captions, setCaptions] = useState<Caption[] | null>(null);
  const [editPlan, setEditPlan] = useState<EditPlan | null>(null);

  useEffect(() => {
    const handle = delayRender(`Cargando subtítulos: ${captionsFileName}`);
    let cancelled = false;

    fetch(staticFile(captionsFileName))
      .then((res) => {
        if (!res.ok) {
          throw new Error(
            `No se pudo cargar ${captionsFileName} (HTTP ${res.status})`,
          );
        }
        return res.json();
      })
      .then((data: Caption[]) => {
        if (!cancelled) {
          setCaptions(data);
        }
        continueRender(handle);
      })
      .catch((err) => {
        cancelRender(err);
      });

    return () => {
      cancelled = true;
    };
  }, [captionsFileName]);

  // Plan de edición opcional (ver scripts/analyze-video.mjs): si está
  // presente, filtra qué frases de los subtítulos se llegan a mostrar.
  useEffect(() => {
    if (!editPlanFileName) {
      setEditPlan(null);
      return;
    }
    const handle = delayRender(`Cargando plan de edición: ${editPlanFileName}`);
    let cancelled = false;

    fetch(staticFile(editPlanFileName))
      .then((res) => {
        if (!res.ok) {
          throw new Error(
            `No se pudo cargar ${editPlanFileName} (HTTP ${res.status})`,
          );
        }
        return res.json();
      })
      .then((data: EditPlan) => {
        if (!cancelled) {
          setEditPlan(data);
        }
        continueRender(handle);
      })
      .catch((err) => {
        cancelRender(err);
      });

    return () => {
      cancelled = true;
    };
  }, [editPlanFileName]);

  if (!captions || captions.length === 0) {
    return null;
  }

  const { pages } = createTikTokStyleCaptions({
    captions,
    // Corta una página nueva si hay un silencio de 700ms o más entre
    // palabras (así los subtítulos no cubren pausas largas sin voz).
    breakOnSilenceAfterMilliseconds: 700,
    // Techo de seguridad: fuerza un corte si una página lleva más de
    // 4s acumuladas sin encontrar un silencio (frases muy largas).
    combineTokensWithinMilliseconds: 4000,
  });

  // Sin plan de edición: se muestran todas las páginas (comportamiento de
  // siempre). Con plan: solo las páginas que se superponen con alguna
  // frase marcada como importante.
  const visiblePages =
    editPlanFileName && editPlan
      ? pages.filter((page) =>
          editPlan.highlights.some(
            (h) =>
              page.startMs < h.endMs &&
              page.startMs + page.durationMs > h.startMs,
          ),
        )
      : pages;

  // Los timestamps de los subtítulos son del archivo original sin
  // recortar; hay que convertir el frame actual de la escena a "tiempo
  // dentro del archivo original" aplicando el recorte y la velocidad.
  const originalMs =
    trimStartSeconds * 1000 + (frame / fps) * 1000 * playbackRate;

  const activePage = visiblePages.find(
    (page) =>
      originalMs >= page.startMs &&
      originalMs < page.startMs + page.durationMs,
  );

  if (!activePage) {
    return null;
  }

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: 140,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: `${4 * textScale}px ${10 * textScale}px`,
          maxWidth: "85%",
          padding: `${10 * textScale}px ${18 * textScale}px`,
          backgroundColor: "rgba(0,0,0,0.55)",
          borderRadius: 12,
        }}
      >
        {activePage.tokens.map((token, index) => {
          const isActive =
            originalMs >= token.fromMs && originalMs < token.toMs;
          return (
            <span
              key={`${token.fromMs}-${index}`}
              style={{
                fontSize: 40 * textScale,
                fontWeight: "bold",
                fontFamily: "sans-serif",
                color: isActive ? "#ffd23f" : "white",
                transform: isActive ? "scale(1.08)" : "scale(1)",
                display: "inline-block",
                textShadow: "0 2px 8px rgba(0,0,0,0.85)",
              }}
            >
              {token.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// Escena 4: créditos finales, fundido suave sobre fondo oscuro
const CreditsScene: React.FC<{ creditsText: string }> = ({ creditsText }) => {
  const frame = useCurrentFrame();
  const textScale = useTextScale();

  const opacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0b1020",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          opacity,
          color: "#8a93ab",
          fontSize: 36 * textScale,
          fontWeight: 500,
          fontFamily: "sans-serif",
          textAlign: "center",
        }}
      >
        {creditsText}
      </div>
    </AbsoluteFill>
  );
};
