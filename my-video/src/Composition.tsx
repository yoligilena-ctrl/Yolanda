import {
  CalculateMetadataFunction,
  Composition,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  AbsoluteFill,
} from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";

type Props = {
  titleText: string;
  subtitleText: string;
  outroText: string;
};

const calculateMetadata: CalculateMetadataFunction<Props> = () => {
  return {};
};

// Duración de cada escena, en frames (30 fps)
const INTRO_DURATION = 60; // 2s
const SUBTITLE_DURATION = 90; // 3s
const OUTRO_DURATION = 60; // 2s
// Cada crossfade "muerde" frames de las dos escenas que une
const TRANSITION_DURATION = 15; // 0.5s
const TOTAL_DURATION =
  INTRO_DURATION +
  SUBTITLE_DURATION +
  OUTRO_DURATION -
  2 * TRANSITION_DURATION; // 6s

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
        titleText: "Mi Video con Remotion",
        subtitleText: "Creado 100% con código",
        outroText: "¡Gracias por ver!",
      }}
      calculateMetadata={calculateMetadata}
    />
  );
};

export const MyVideo: React.FC<Props> = ({
  titleText,
  subtitleText,
  outroText,
}) => {
  return (
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
    </TransitionSeries>
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
