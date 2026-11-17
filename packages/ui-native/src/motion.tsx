import { motion, radius } from "@be-fast/ui-tokens";
import { useEffect, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "./theme";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const pressSpring = { damping: 18, stiffness: 320, mass: 0.6 } as const;

/**
 * A Pressable that sinks slightly while pressed. Interaction props
 * (testID, disabled, onPress, accessibility) stay on the Pressable itself.
 */
export function PressableScale({
  style,
  pressedScale = 0.96,
  children,
  onPressIn,
  onPressOut,
  ...props
}: Omit<PressableProps, "style" | "children"> & {
  style?: StyleProp<ViewStyle>;
  pressedScale?: number;
  children?: ReactNode;
}) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <AnimatedPressable
      {...props}
      onPressIn={(event) => {
        scale.value = withSpring(pressedScale, pressSpring);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.value = withSpring(1, pressSpring);
        onPressOut?.(event);
      }}
      style={[style, animated]}
    >
      {children}
    </AnimatedPressable>
  );
}

/** Entering animation for list rows: rise and fade, staggered by index. */
export function enterUp(index = 0) {
  return FadeInDown.duration(motion.slow)
    .delay(Math.min(index, 8) * motion.stagger)
    .easing(Easing.out(Easing.cubic));
}

export const enterFade = FadeIn.duration(motion.base);
export const exitFade = FadeOut.duration(motion.fast);

/** Wraps a screen so that switching screens cross-fades and rises softly. */
export function ScreenTransition({
  screenKey,
  children,
  style,
}: {
  screenKey: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Animated.View
      key={screenKey}
      style={[styles.fill, style]}
      entering={FadeInDown.duration(motion.slow)
        .withInitialValues({ transform: [{ translateY: 14 }] })
        .easing(Easing.out(Easing.cubic))}
    >
      {children}
    </Animated.View>
  );
}

/** A soft pulsing placeholder block shown while content loads. */
export function Skeleton({
  width = "100%",
  height = 16,
  rounded = radius.sm,
  style,
}: {
  width?: number | `${number}%`;
  height?: number;
  rounded?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { palette } = useTheme();
  const reduced = useReducedMotion();
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (reduced) return;
    opacity.value = withRepeat(
      withTiming(0.45, { duration: 750, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [opacity, reduced]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      accessible={false}
      style={[
        { width, height, borderRadius: rounded, backgroundColor: palette.skeleton },
        style,
        animated,
      ]}
    />
  );
}

/** Pops its child whenever `value` changes, e.g. a cart counter. */
export function PopOnChange({
  value,
  children,
  style,
}: {
  value: unknown;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withSequence(
      withSpring(1.28, { damping: 8, stiffness: 400 }),
      withSpring(1, { damping: 12, stiffness: 260 }),
    );
  }, [scale, value]);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/** Gently breathes (used for the live "new order" indicator). */
export function Pulse({
  active = true,
  children,
  style,
}: {
  active?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = active
      ? withRepeat(
          withTiming(1.06, { duration: 650, easing: Easing.inOut(Easing.quad) }),
          -1,
          true,
        )
      : withTiming(1);
  }, [active, scale]);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
