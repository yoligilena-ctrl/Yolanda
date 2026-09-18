import {
  CalculateMetadataFunction,
  Composition,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  AbsoluteFill,
  Audio,
  staticFile,
} from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";

type Props = {
  titleText: string;
  subtitleText: string;
  outroText: string;
  creditsText: string;
};

const calculateMetadata: CalculateMetadataFunction<Props> = () => {
  return {};
};

// Duración de cada escena, en frames (30 fps)
const INTRO_DURATION = 90; // 3s
const SUBTITLE_DURATION = 105; // 3.5s
const OUTRO_DURATION = 90; // 3s
const CREDITS_DURATION = 90; // 3s
// Cada crossfade "muerde" frames de las dos escenas que une
const TRANSITION_DURATION = 15; // 0.5s
const TOTAL_DURATION =
  INTRO_DURATION +
  SUBTITLE_DURATION +
  OUTRO_DURATION +
  CREDITS_DURATION -
  3 * TRANSITION_DURATION; // 11s

export const MyComposition = () => {
  return (
    <Composition
      id="MyComp"
      component={MyVideo}
      durationInFrames={TOTAL_DURATION}
      fps={30}
      width={1280}
      height={720}
      defaultProps={{
        titleText: "Generador de Videos",
        subtitleText: "Hecho 100% con código",
        outroText: "¡Hasta la próxima!",
        creditsText: "Hecho con Remotion",
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
}) => {
  return (
    <AbsoluteFill>
      <Audio
        src={staticFile("music.mp3")}
        volume={(frame) =>
          // Sube poco a poco durante casi todo el video y se
          // desvanece rápido en los últimos frames para evitar un corte seco.
          interpolate(frame, [0, TOTAL_DURATION - 10, TOTAL_DURATION], [0, 0.6, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
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
          fontSize: 70,
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
          fontSize: 46,
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
          fontSize: 60,
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

// Escena 4: créditos finales, fundido suave sobre fondo oscuro
const CreditsScene: React.FC<{ creditsText: string }> = ({ creditsText }) => {
  const frame = useCurrentFrame();

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
          fontSize: 36,
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
