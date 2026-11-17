// Inert stand-in for react-native-reanimated in unit tests (see vitest.config.ts).
function builder(): unknown {
  const target = () => proxy;
  const proxy: unknown = new Proxy(target, {
    get: () => proxy,
    apply: () => proxy,
  });
  return proxy;
}

const Animated = {
  View: "View",
  Text: "Text",
  ScrollView: "ScrollView",
  createAnimatedComponent: <T,>(component: T) => component,
};
const value = <T,>(next: T) => next;

export default Animated;
export const View = Animated.View;
export const Text = Animated.Text;
export const ScrollView = Animated.ScrollView;
export const createAnimatedComponent = Animated.createAnimatedComponent;
export const Easing = new Proxy({}, { get: () => () => () => 0 });
export const useSharedValue = <T,>(initial: T) => ({ value: initial });
export const useAnimatedStyle = () => ({});
export const useAnimatedProps = () => ({});
export const useReducedMotion = () => false;
export const withTiming = value;
export const withSpring = value;
export const withRepeat = value;
export const withDelay = (_delay: number, next: unknown) => next;
export const withSequence = (...steps: unknown[]) => steps.at(-1);
export const cancelAnimation = () => undefined;
export const interpolate = () => 0;
export const FadeIn = builder();
export const FadeInDown = builder();
export const FadeInUp = builder();
export const FadeOut = builder();
export const ZoomIn = builder();
export const LinearTransition = builder();
