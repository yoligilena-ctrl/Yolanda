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
}> = ({ videoFileName, trimStartSeconds, playbackRate, overlayText }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const textScale = useTextScale();

  const opacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "black", opacity }}>
      <Video
        src={staticFile(videoFileName)}
        trimBefore={Math.round(Math.max(0, trimStartSeconds) * fps)}
        playbackRate={playbackRate > 0 ? playbackRate : 1}
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
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
