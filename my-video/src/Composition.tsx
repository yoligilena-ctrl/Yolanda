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
  staticFile,
} from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { getVideoMetadata } from "@remotion/media-utils";

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
  // Calculado automáticamente en calculateMetadata a partir del archivo real
  // y las instrucciones de recorte/velocidad; no se edita a mano.
  userVideoDurationInFrames: number;
  // Formato de salida. "vertical" (9:16) es el que suele importarse a
  // CapCut para TikTok/Reels/Shorts; "square" (1:1) para feed de
  // Instagram; "landscape" (16:9, por defecto) para YouTube/web.
  aspectRatio: "landscape" | "vertical" | "square";
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

  const { durationInSeconds } = await getVideoMetadata(
    staticFile(props.videoFileName),
  );

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
        videoCalloutType: "arrow",
        videoCalloutStartSeconds: 0,
        videoCalloutDurationSeconds: 0,
        videoCalloutXPercent: 50,
        videoCalloutYPercent: 50,
        videoCalloutDirection: "up",
        videoCalloutText: "",
        userVideoDurationInFrames: 0,
        aspectRatio: "landscape",
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
  videoCalloutType,
  videoCalloutStartSeconds,
  videoCalloutDurationSeconds,
  videoCalloutXPercent,
  videoCalloutYPercent,
  videoCalloutDirection,
  videoCalloutText,
  userVideoDurationInFrames,
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
          presentation={slide({ direction: "from-left" })}
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
                calloutType={videoCalloutType}
                calloutStartSeconds={videoCalloutStartSeconds}
                calloutDurationSeconds={videoCalloutDurationSeconds}
                calloutXPercent={videoCalloutXPercent}
                calloutYPercent={videoCalloutYPercent}
                calloutDirection={videoCalloutDirection}
                calloutText={videoCalloutText}
              />
            </TransitionSeries.Sequence>
            <TransitionSeries.Transition
              presentation={slide({ direction: "from-left" })}
              timing={linearTiming({ durationInFrames: TRANSITION_DURATION })}
            />
          </>
        )}
        <TransitionSeries.Sequence durationInFrames={SUBTITLE_DURATION}>
          <SubtitleScene subtitleText={subtitleText} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-left" })}
          timing={linearTiming({ durationInFrames: TRANSITION_DURATION })}
        />
        <TransitionSeries.Sequence durationInFrames={OUTRO_DURATION}>
          <OutroScene outroText={outroText} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-left" })}
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
  calloutType: "arrow" | "circle";
  calloutStartSeconds: number;
  calloutDurationSeconds: number;
  calloutXPercent: number;
  calloutYPercent: number;
  calloutDirection: "up" | "down" | "left" | "right";
  calloutText: string;
}> = ({
  videoFileName,
  trimStartSeconds,
  playbackRate,
  overlayText,
  zoomStartSeconds,
  zoomDurationSeconds,
  zoomScale,
  calloutType,
  calloutStartSeconds,
  calloutDurationSeconds,
  calloutXPercent,
  calloutYPercent,
  calloutDirection,
  calloutText,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const textScale = useTextScale();

  const opacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Zoom ("punch-in") manual: ease in, se mantiene, ease out. Desactivado
  // cuando la duración es 0 (el estado por defecto).
  const zoomStartFrame = Math.round(Math.max(0, zoomStartSeconds) * fps);
  const zoomDurationFrames = Math.round(Math.max(0, zoomDurationSeconds) * fps);
  const zoomEndFrame = zoomStartFrame + zoomDurationFrames;
  const zoomEaseFrames = Math.min(10, Math.floor(zoomDurationFrames / 3));
  const videoScale =
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
          transform: `scale(${videoScale})`,
        }}
      />
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
