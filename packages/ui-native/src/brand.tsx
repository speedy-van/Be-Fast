import { brandMark, fontSize, motion } from "@be-fast/ui-tokens";
import { useEffect, useState } from "react";
import { StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, G, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { fonts } from "./theme";

// Visual centre of the composed mark inside its 512 viewBox.
const center = { x: 273, y: 271 };
// The splash image is the mark at this scale inside a 1024 canvas.
const splashScale = 2.6;
const splashTransform = `translate(${512 - center.x * splashScale} ${512 - center.y * splashScale}) scale(${splashScale})`;
// The wing pivots around its root, at the right edge of the bag.
const wingPivot = {
  x: ((512 - center.x * splashScale + 302 * splashScale) / 1024) * 100,
  y: ((512 - center.y * splashScale + 272 * splashScale) / 1024) * 100,
};

interface MarkColors {
  body: string;
  bolt: string;
  gap: string;
}

function Feathers({ body, gap }: MarkColors) {
  return (
    <>
      {[...brandMark.wing].reverse().map((d) => (
        <Path
          key={d}
          d={d}
          fill={body}
          stroke={gap}
          strokeWidth={10}
          strokeLinejoin="round"
        />
      ))}
    </>
  );
}

function Bag({ body, bolt }: MarkColors) {
  return (
    <>
      <Path
        d={brandMark.handle}
        fill={bolt}
        fillOpacity={0}
        stroke={body}
        strokeWidth={brandMark.handleWidth}
        strokeLinecap="round"
      />
      <Path d={brandMark.bag} fill={body} />
      <Path d={brandMark.bolt} fill={bolt} />
    </>
  );
}

/** The Be Fast mark (delivery bag with a speed wing) at any size. */
export function BrandMark({
  size,
  body,
  bolt,
  gap,
}: { size: number } & MarkColors) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024" accessible={false}>
      <G transform={splashTransform}>
        <Feathers body={body} bolt={bolt} gap={gap} />
        <Bag body={body} bolt={bolt} gap={gap} />
      </G>
    </Svg>
  );
}

/** A full-size two-stop diagonal gradient, placed behind content. */
export function GradientFill({
  from,
  to,
  style,
  id = "fill",
}: {
  from: string;
  to: string;
  style?: StyleProp<ViewStyle>;
  id?: string;
}) {
  return (
    <Svg
      style={[StyleSheet.absoluteFill, style]}
      width="100%"
      height="100%"
      preserveAspectRatio="none"
      viewBox="0 0 100 100"
      accessible={false}
      pointerEvents="none"
    >
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={from} />
          <Stop offset="1" stopColor={to} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100" height="100" fill={`url(#${id})`} />
    </Svg>
  );
}

const markSize = 200;

/**
 * Animated launch sequence. It starts on the exact frame the native splash
 * shows (same background and mark), so hiding the native splash is seamless:
 * the bag pops, the wing flaps, speed lines streak in, the name rises, then
 * the mark zooms through the screen to reveal the app.
 */
export function AnimatedSplash({
  background,
  gradientTo,
  colors: markColors,
  title,
  tagline,
  textColor,
  onReady,
  onFinish,
}: {
  background: string;
  gradientTo: string;
  colors: MarkColors;
  title: string;
  tagline: string;
  textColor: string;
  onReady?: () => void;
  onFinish: () => void;
}) {
  const reduced = useReducedMotion();
  const bag = useSharedValue(1);
  const wing = useSharedValue(0);
  const lines = useSharedValue(0);
  const words = useSharedValue(0);
  const exit = useSharedValue(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    onReady?.();
    if (reduced) {
      words.value = withTiming(1, { duration: motion.base });
      exit.value = withDelay(500, withTiming(1, { duration: motion.base }));
      const timer = setTimeout(() => setDone(true), 500 + motion.base);
      return () => clearTimeout(timer);
    }
    const out = Easing.out(Easing.cubic);
    bag.value = withSequence(
      withTiming(0.9, { duration: 140, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 7, stiffness: 220, mass: 0.7 }),
    );
    wing.value = withDelay(
      90,
      withSequence(
        withTiming(-28, { duration: 170, easing: out }),
        withTiming(10, { duration: 160 }),
        withTiming(-16, { duration: 150 }),
        withSpring(0, { damping: 9, stiffness: 200 }),
      ),
    );
    lines.value = withDelay(220, withTiming(1, { duration: 420, easing: out }));
    words.value = withDelay(420, withTiming(1, { duration: 480, easing: out }));
    exit.value = withDelay(
      motion.splash - 420,
      withTiming(1, { duration: 420, easing: Easing.in(Easing.cubic) }),
    );
    const timer = setTimeout(() => setDone(true), motion.splash + 20);
    return () => clearTimeout(timer);
    // The sequence runs once, on mount.
  }, []);

  useEffect(() => {
    if (done) onFinish();
  }, [done, onFinish]);

  const overlay = useAnimatedStyle(() => ({ opacity: 1 - exit.value }));
  const markStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -40 * words.value },
      { scale: bag.value * (1 + exit.value * 7) },
    ],
  }));
  const wingStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${wing.value}deg` }],
  }));
  const lineStyle = (offset: number) =>
    useAnimatedStyle(() => {
      const progress = Math.max(0, Math.min(1, lines.value * 1.4 - offset));
      return {
        opacity: progress * (1 - exit.value) * 0.85,
        transform: [{ translateX: (1 - progress) * 40 }, { scaleX: 0.4 + progress * 0.6 }],
      };
    });
  const speed = [lineStyle(0), lineStyle(0.2), lineStyle(0.4)];
  const wordStyle = useAnimatedStyle(() => ({
    opacity: words.value * Math.max(0, 1 - exit.value * 2),
    transform: [{ translateY: (1 - words.value) * 18 }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      accessible
      accessibilityLabel={title}
      style={[StyleSheet.absoluteFill, styles.splash, { backgroundColor: background }, overlay]}
    >
      <GradientFill from={background} to={gradientTo} id="splash" />
      <Animated.View style={[styles.mark, markStyle]}>
        {speed.map((style, index) => (
          <Animated.View
            key={index}
            style={[
              styles.speedLine,
              { top: 78 + index * 22, width: 34 - index * 8, backgroundColor: markColors.body },
              style,
            ]}
          />
        ))}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { transformOrigin: `${wingPivot.x}% ${wingPivot.y}%` },
            wingStyle,
          ]}
        >
          <Svg width={markSize} height={markSize} viewBox="0 0 1024 1024">
            <G transform={splashTransform}>
              <Feathers {...markColors} />
            </G>
          </Svg>
        </Animated.View>
        <Svg
          style={StyleSheet.absoluteFill}
          width={markSize}
          height={markSize}
          viewBox="0 0 1024 1024"
        >
          <G transform={splashTransform}>
            <Bag {...markColors} />
          </G>
        </Svg>
      </Animated.View>
      <Animated.View style={[styles.words, wordStyle]}>
        <Text style={[styles.title, { color: textColor }]}>{title}</Text>
        <Text style={[styles.tagline, { color: textColor }]}>{tagline}</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  splash: { alignItems: "center", justifyContent: "center", zIndex: 100, elevation: 100 },
  mark: { width: markSize, height: markSize },
  speedLine: { position: "absolute", start: -6, height: 7, borderRadius: 4 },
  words: { position: "absolute", top: "58%", alignItems: "center", gap: 4 },
  title: { fontFamily: fonts.bold, fontSize: fontSize.display, letterSpacing: 0.5 },
  tagline: { fontFamily: fonts.medium, fontSize: fontSize.body },
});
