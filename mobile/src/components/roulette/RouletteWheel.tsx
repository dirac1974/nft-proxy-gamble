import React, { forwardRef, memo, useEffect, useImperativeHandle, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, G, Path, RadialGradient, Rect, Stop, Text as SvgText } from "react-native-svg";
import Animated, {
  cancelAnimation,
  Easing,
  runOnUI,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { fonts, palette } from "@/theme";
import { DROP_FRACTION, landingPlan, mod360, pocketColor, pocketIndex, POCKET_DEG, WHEEL_ORDER } from "./rouletteModel";

// All geometry is authored on a 280-unit canvas and scaled to `size`.
const BASE = 280;
const C = BASE / 2;
const R_RIM_OUT = 139;
const R_RIM_IN = 124;
const R_TRACK_BALL = 117;
const R_DEFLECT = 109;
const R_RING_OUT = 104;
const R_NUM_IN = 86;
const R_POCKET_IN = 68;
const R_POCKET_BALL = 77;
const R_CONE = 68;

// deg per ms
const WHEEL_SPEED = 360 / 2600;
const BALL_SPEED = 360 / 650;
const IDLE_MS_PER_TURN = 60000;

const WOOD_LIGHT = "#5A3418";
const WOOD_DARK = "#24130A";
const POCKET_BLACK = "#14161B";
const POCKET_GREEN = "#12844F";
const TRACK = "#0B0E14";

const POCKET_FILL = { red: palette.ruby, black: POCKET_BLACK, green: POCKET_GREEN } as const;

function polar(r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [C + r * Math.sin(rad), C - r * Math.cos(rad)];
}

function wedge(rOut: number, rIn: number, a0: number, a1: number): string {
  const [x0, y0] = polar(rOut, a0);
  const [x1, y1] = polar(rOut, a1);
  const [x2, y2] = polar(rIn, a1);
  const [x3, y3] = polar(rIn, a0);
  return `M${x0} ${y0} A${rOut} ${rOut} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${rIn} ${rIn} 0 0 0 ${x3} ${y3} Z`;
}

const StaticBowl = memo(function StaticBowl({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${BASE} ${BASE}`} style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id="wood" cx="50%" cy="45%" r="55%">
          <Stop offset="0.82" stopColor={WOOD_LIGHT} />
          <Stop offset="1" stopColor={WOOD_DARK} />
        </RadialGradient>
        <RadialGradient id="track" cx="50%" cy="50%" r="50%">
          <Stop offset="0.7" stopColor="#1B2130" />
          <Stop offset="0.9" stopColor={TRACK} />
        </RadialGradient>
      </Defs>
      <Circle cx={C} cy={C} r={R_RIM_OUT} fill="url(#wood)" />
      <Circle cx={C} cy={C} r={R_RIM_OUT - 1} fill="none" stroke={palette.gold} strokeWidth={2} />
      <Circle cx={C} cy={C} r={R_RIM_IN} fill="url(#track)" stroke={palette.goldDeep} strokeWidth={1.5} />
      <Circle cx={C} cy={C} r={R_RIM_IN - 3} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
      {Array.from({ length: 8 }, (_, i) => {
        const a = i * 45 + 22.5;
        const [x, y] = polar(R_DEFLECT + 2, a);
        return (
          <Rect
            key={i}
            x={x - 2.4}
            y={y - 5}
            width={4.8}
            height={10}
            rx={1.2}
            fill={palette.gold}
            rotation={a + 45}
            origin={`${x},${y}`}
            opacity={0.9}
          />
        );
      })}
    </Svg>
  );
});

const RotorArt = memo(function RotorArt({ size }: { size: number }) {
  const pockets = useMemo(
    () =>
      WHEEL_ORDER.map((n, k) => {
        const a = k * POCKET_DEG;
        return { n, a, fill: POCKET_FILL[pocketColor(n)] };
      }),
    [],
  );
  const half = POCKET_DEG / 2;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${BASE} ${BASE}`}>
      <Defs>
        <RadialGradient id="cone" cx="50%" cy="42%" r="55%">
          <Stop offset="0" stopColor="#7A4A22" />
          <Stop offset="0.7" stopColor={WOOD_LIGHT} />
          <Stop offset="1" stopColor={WOOD_DARK} />
        </RadialGradient>
        <RadialGradient id="knob" cx="40%" cy="35%" r="65%">
          <Stop offset="0" stopColor={palette.goldLight} />
          <Stop offset="0.6" stopColor={palette.gold} />
          <Stop offset="1" stopColor={palette.goldDeep} />
        </RadialGradient>
      </Defs>
      {pockets.map((p) => (
        <G key={p.n}>
          <Path d={wedge(R_RING_OUT, R_NUM_IN, p.a - half, p.a + half)} fill={p.fill} />
          <Path d={wedge(R_NUM_IN, R_POCKET_IN, p.a - half, p.a + half)} fill={p.fill} />
          <Path d={wedge(R_NUM_IN, R_POCKET_IN, p.a - half, p.a + half)} fill="rgba(0,0,0,0.38)" />
        </G>
      ))}
      {pockets.map((p) => {
        const [x0, y0] = polar(R_RING_OUT, p.a + half);
        const [x1, y1] = polar(R_POCKET_IN, p.a + half);
        return <Path key={`f${p.n}`} d={`M${x0} ${y0} L${x1} ${y1}`} stroke={palette.gold} strokeWidth={0.9} />;
      })}
      <Circle cx={C} cy={C} r={R_RING_OUT} fill="none" stroke={palette.gold} strokeWidth={1.6} />
      <Circle cx={C} cy={C} r={R_NUM_IN} fill="none" stroke={palette.gold} strokeWidth={1} />
      {pockets.map((p) => (
        <G key={`t${p.n}`} rotation={p.a} origin={`${C},${C}`}>
          <SvgText
            x={C}
            y={C - (R_NUM_IN + 5.5)}
            fill={palette.ivory}
            fontSize={10}
            fontWeight="700"
            fontFamily={fonts.bold}
            textAnchor="middle"
          >
            {p.n}
          </SvgText>
        </G>
      ))}
      <Circle cx={C} cy={C} r={R_CONE} fill="url(#cone)" stroke={palette.gold} strokeWidth={1.6} />
      <Circle cx={C} cy={C} r={44} fill="none" stroke="rgba(233,196,106,0.45)" strokeWidth={1} />
      {[0, 90, 180, 270].map((a) => (
        <G key={`arm${a}`} rotation={a} origin={`${C},${C}`}>
          <Rect x={C - 2.6} y={C - 40} width={5.2} height={40} rx={2.6} fill="url(#knob)" />
          <Circle cx={C} cy={C - 42} r={5.6} fill="url(#knob)" stroke={palette.goldDeep} strokeWidth={0.8} />
        </G>
      ))}
      <Circle cx={C} cy={C} r={13} fill="url(#knob)" stroke={palette.goldDeep} strokeWidth={1} />
      <Circle cx={C - 3} cy={C - 4} r={3.5} fill="rgba(255,255,255,0.55)" />
    </Svg>
  );
});

export interface RouletteWheelHandle {
  /** Launch the ball and spin at constant speed while the server resolves. */
  preSpin(): void;
  /** Decelerate so the ball comes to rest in `winningNumber`'s pocket. Returns drop time (ms). */
  land(winningNumber: number, durationMs: number): number;
  /** Stop without landing (request failed). */
  abort(): void;
}

interface RouletteWheelProps {
  size: number;
  idle?: boolean;
}

function startIdle(rot: SharedValue<number>) {
  "worklet";
  const from = mod360(rot.value);
  rot.value = from;
  rot.value = withRepeat(
    withTiming(from + 360, { duration: IDLE_MS_PER_TURN, easing: Easing.linear }),
    -1,
    false,
  );
}

export const RouletteWheel = forwardRef<RouletteWheelHandle, RouletteWheelProps>(function RouletteWheel(
  { size, idle = true },
  ref,
) {
  const k = size / BASE;
  const wheelRot = useSharedValue(0);
  const ballRot = useSharedValue(0);
  const ballOffset = useSharedValue(0); // ball = wheel + offset while seated in a pocket
  const seated = useSharedValue(1);
  const ballR = useSharedValue(R_POCKET_BALL);
  const idleOn = useSharedValue(idle ? 1 : 0);

  useEffect(() => {
    idleOn.value = idle ? 1 : 0;
    runOnUI((on: boolean) => {
      "worklet";
      if (on) startIdle(wheelRot);
      else cancelAnimation(wheelRot);
    })(idle);
  }, [idle, idleOn, wheelRot]);

  useImperativeHandle(
    ref,
    () => ({
      preSpin() {
        runOnUI(() => {
          "worklet";
          cancelAnimation(wheelRot);
          cancelAnimation(ballRot);
          const bAbs = seated.value >= 0.5 ? wheelRot.value + ballOffset.value : ballRot.value;
          const w = mod360(wheelRot.value);
          const b = mod360(bAbs);
          wheelRot.value = w;
          ballRot.value = b;
          seated.value = 0;
          wheelRot.value = withRepeat(
            withTiming(w + 360, { duration: 360 / WHEEL_SPEED, easing: Easing.linear }),
            -1,
            false,
          );
          ballRot.value = withRepeat(
            withTiming(b - 360, { duration: 360 / BALL_SPEED, easing: Easing.linear }),
            -1,
            false,
          );
          ballR.value = withTiming(R_TRACK_BALL, { duration: 260, easing: Easing.out(Easing.quad) });
        })();
      },
      land(winningNumber: number, durationMs: number) {
        const idx = pocketIndex(winningNumber);
        runOnUI((pIdx: number, T: number) => {
          "worklet";
          cancelAnimation(wheelRot);
          cancelAnimation(ballRot);
          cancelAnimation(ballR);
          const w0 = wheelRot.value;
          const b0 = seated.value >= 0.5 ? wheelRot.value + ballOffset.value : ballRot.value;
          ballRot.value = b0;
          seated.value = 0;
          const plan = landingPlan(w0, b0, pIdx, T, WHEEL_SPEED, BALL_SPEED);
          const d = plan.dropAt;
          ballOffset.value = plan.ballOffset;
          wheelRot.value = withTiming(
            plan.wheelEnd,
            { duration: T, easing: Easing.out(Easing.cubic) },
            (finished) => {
              if (finished && idleOn.value === 1) startIdle(wheelRot);
            },
          );
          ballRot.value = withTiming(plan.ballEnd, { duration: d, easing: Easing.out(Easing.cubic) });
          seated.value = withDelay(d, withTiming(1, { duration: 0 }));
          const lead = Math.min(150, d * 0.15);
          ballR.value = withSequence(
            withTiming(R_TRACK_BALL, { duration: lead }),
            withDelay(d * 0.6 - lead, withTiming(R_DEFLECT - 4, { duration: d * 0.3, easing: Easing.in(Easing.quad) })),
            withTiming(R_POCKET_BALL, { duration: d * 0.1, easing: Easing.out(Easing.quad) }),
            withTiming(R_POCKET_BALL + 3.5, { duration: 90 }),
            withTiming(R_POCKET_BALL, { duration: 140, easing: Easing.in(Easing.quad) }),
          );
        })(idx, durationMs);
        return durationMs * DROP_FRACTION;
      },
      abort() {
        runOnUI(() => {
          "worklet";
          cancelAnimation(wheelRot);
          cancelAnimation(ballRot);
          const w0 = wheelRot.value;
          const b0 = seated.value >= 0.5 ? wheelRot.value + ballOffset.value : ballRot.value;
          ballRot.value = b0;
          seated.value = 0;
          wheelRot.value = withTiming(
            w0 + (WHEEL_SPEED * 900) / 3,
            { duration: 900, easing: Easing.out(Easing.cubic) },
            (finished) => {
              if (finished && idleOn.value === 1) startIdle(wheelRot);
            },
          );
          ballRot.value = withTiming(b0 - (BALL_SPEED * 900) / 3, { duration: 900, easing: Easing.out(Easing.cubic) });
        })();
      },
    }),
    [wheelRot, ballRot, ballOffset, seated, ballR, idleOn],
  );

  const rotorStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${wheelRot.value}deg` }] }));
  const ballOrbitStyle = useAnimatedStyle(() => {
    const a = seated.value >= 0.5 ? wheelRot.value + ballOffset.value : ballRot.value;
    return { transform: [{ rotate: `${a}deg` }] };
  });
  const ballStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -ballR.value * k }] }));

  const ballSize = Math.max(5, 11 * k);
  return (
    <View
      style={{ width: size, height: size }}
      accessibilityRole="image"
      accessibilityLabel="European roulette wheel"
      pointerEvents="none"
    >
      <View style={[styles.shadow, { width: size, height: size, borderRadius: size / 2 }]} />
      <StaticBowl size={size} />
      <Animated.View style={[StyleSheet.absoluteFill, rotorStyle]}>
        <RotorArt size={size} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, ballOrbitStyle]}>
        <Animated.View
          style={[
            styles.ball,
            {
              width: ballSize,
              height: ballSize,
              borderRadius: ballSize / 2,
              left: size / 2 - ballSize / 2,
              top: size / 2 - ballSize / 2,
            },
            ballStyle,
          ]}
        >
          <View
            style={[
              styles.ballShine,
              { width: ballSize * 0.38, height: ballSize * 0.38, borderRadius: ballSize, top: ballSize * 0.14, left: ballSize * 0.18 },
            ]}
          />
        </Animated.View>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  shadow: {
    position: "absolute",
    backgroundColor: palette.black,
    shadowColor: "#000",
    shadowOpacity: 0.6,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 14,
  },
  ball: {
    position: "absolute",
    backgroundColor: palette.ivory,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.35)",
    shadowColor: "#000",
    shadowOpacity: 0.6,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 4,
  },
  ballShine: { position: "absolute", backgroundColor: "#FFFFFF" },
});
