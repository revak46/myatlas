// MyAtlas Mobile — Splash Screen
// Mirrors landing.html exactly: wordmark, orbital dial, tagline, Enter button

import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Platform,
  Dimensions,
} from "react-native";
import Svg, {
  Circle,
  G,
  Line,
} from "react-native-svg";

const { width } = Dimensions.get("window");
const DIAL = Math.min(220, width * 0.55);
const C   = DIAL / 2; // centre = 110 scaled to viewBox 100

// ── Colours from landing.html ──────────────────────────────
const PAPER    = "#f1efe9";
const GRAPHITE = "#141312";

// ── Lane arcs (match landing.html exactly) ─────────────────
const LANES = [
  { r: 64, color: "#4f6eb0", dash: "67 335",  offset: "0"    },
  { r: 54, color: "#c07840", dash: "57 282",  offset: "-90"  },
  { r: 44, color: "#4d9e6a", dash: "46 230",  offset: "-180" },
  { r: 34, color: "#7c5cb5", dash: "36 178",  offset: "-265" },
  { r: 24, color: "#a08c2a", dash: "25 126",  offset: "-350" },
  { r: 14, color: "#b84060", dash: "15 73",   offset: "-430" },
];

// ── Tick positions (match landing.html) ────────────────────
const TICKS = [
  { x1: 100, y1: 14,    x2: 100, y2: 25,    heavy: true  },
  { x1: 139.6, y1: 23.3,  x2: 133.2, y2: 33.5,  heavy: false },
  { x1: 166.7, y1: 50.4,  x2: 158.5, y2: 57.0,  heavy: false },
  { x1: 175,   y1: 100,   x2: 164,   y2: 100,   heavy: true  },
  { x1: 166.7, y1: 149.6, x2: 158.5, y2: 143.0, heavy: false },
  { x1: 139.6, y1: 176.7, x2: 133.2, y2: 166.5, heavy: false },
  { x1: 100,   y1: 186,   x2: 100,   y2: 175,   heavy: true  },
  { x1: 60.4,  y1: 176.7, x2: 66.8,  y2: 166.5, heavy: false },
  { x1: 33.3,  y1: 149.6, x2: 41.5,  y2: 143.0, heavy: false },
  { x1: 25,    y1: 100,   x2: 36,    y2: 100,   heavy: true  },
  { x1: 33.3,  y1: 50.4,  x2: 41.5,  y2: 57.0,  heavy: false },
  { x1: 60.4,  y1: 23.3,  x2: 66.8,  y2: 33.5,  heavy: false },
];

export default function SplashScreen({ onEnter }: { onEnter: () => void }) {
  // Staggered fade-in animations
  const splashAnim   = useRef(new Animated.Value(0)).current;
  const wordmarkAnim = useRef(new Animated.Value(0)).current;
  const dialAnim     = useRef(new Animated.Value(0)).current;
  const taglineAnim  = useRef(new Animated.Value(0)).current;
  const btnAnim      = useRef(new Animated.Value(0)).current;

  // Dial spin (rotate from -90 to 270 deg = full 360 spin in)
  const dialRotate   = useRef(new Animated.Value(-90)).current;

  useEffect(() => {
    Animated.sequence([
      // splash container fades in
      Animated.timing(splashAnim, {
        toValue: 1, duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true, delay: 100,
      }),
    ]).start();

    // Wordmark reveal
    Animated.timing(wordmarkAnim, {
      toValue: 1, duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true, delay: 300,
    }).start();

    // Dial spin + fade
    Animated.parallel([
      Animated.timing(dialAnim, {
        toValue: 1, duration: 1500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true, delay: 500,
      }),
      Animated.timing(dialRotate, {
        toValue: 0, duration: 1500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true, delay: 500,
      }),
    ]).start();

    // Tagline
    Animated.timing(taglineAnim, {
      toValue: 1, duration: 700,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true, delay: 1700,
    }).start();

    // Button
    Animated.timing(btnAnim, {
      toValue: 1, duration: 700,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true, delay: 2000,
    }).start();
  }, []);

  const dialSpin = dialRotate.interpolate({
    inputRange: [-90, 0],
    outputRange: ["-90deg", "270deg"],
  });

  const taglineY = taglineAnim.interpolate({
    inputRange: [0, 1], outputRange: [8, 0],
  });
  const btnY = btnAnim.interpolate({
    inputRange: [0, 1], outputRange: [8, 0],
  });

  return (
    <View style={s.root}>
      <Animated.View style={[s.splash, { opacity: splashAnim }]}>

        {/* Wordmark */}
        <Animated.View style={{ opacity: wordmarkAnim }}>
          <Text style={s.wordmark}>
            <Text style={s.wordmarkLight}>my</Text>
            <Text style={s.wordmarkBold}>ATLAS</Text>
          </Text>
          <Text style={s.wordmarkSub}>by A.Kembi</Text>
        </Animated.View>

        {/* Dial */}
        <Animated.View style={[
          s.dialWrap,
          { opacity: dialAnim, transform: [{ rotate: dialSpin }] }
        ]}>
          <Svg width={DIAL} height={DIAL} viewBox="0 0 200 200">
            {/* Accent halo */}
            <Circle cx="100" cy="100" r="94"
              fill="none" stroke="rgba(80,110,140,0.50)"
              strokeWidth="1.2" opacity={0.4} />

            {/* Outer ring */}
            <Circle cx="100" cy="100" r="80"
              fill="none" stroke={GRAPHITE} strokeWidth="1.4" />

            {/* Inner ring */}
            <Circle cx="100" cy="100" r="66"
              fill="none" stroke="rgba(20,19,18,0.06)" strokeWidth="1" />

            {/* Lane arcs */}
            {LANES.map((lane, i) => (
              <Circle
                key={i}
                cx="100" cy="100" r={lane.r}
                fill="none"
                stroke={lane.color}
                strokeWidth="5"
                opacity={0.35}
                strokeDasharray={lane.dash}
                strokeDashoffset={lane.offset}
                strokeLinecap="round"
              />
            ))}

            {/* Tick ring */}
            <G>
              {TICKS.map((t, i) => (
                <Line
                  key={i}
                  x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
                  stroke="rgba(20,19,18,0.22)"
                  strokeWidth={t.heavy ? 2.0 : 1.2}
                  strokeLinecap="round"
                />
              ))}
            </G>

            {/* Centre dot */}
            <Circle cx="100" cy="100" r="5"
              fill={GRAPHITE} opacity={0.85} />
          </Svg>
        </Animated.View>

        {/* Tagline */}
        <Animated.Text style={[
          s.tagline,
          { opacity: taglineAnim, transform: [{ translateY: taglineY }] }
        ]}>
          PLAN YOUR LIFE. ONE ORBIT AT A TIME.
        </Animated.Text>

        {/* Enter button */}
        <Animated.View style={[
          { opacity: btnAnim, transform: [{ translateY: btnY }] }
        ]}>
          <TouchableOpacity style={s.enterBtn} onPress={onEnter} activeOpacity={0.7}>
            <Text style={s.enterBtnText}>Enter →</Text>
          </TouchableOpacity>
        </Animated.View>

      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: PAPER,
    alignItems: "center",
    justifyContent: "center",
  },
  splash: {
    alignItems: "center",
    gap: 28,
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  wordmark: {
    fontSize: 48,
    letterSpacing: 10,
    textAlign: "center",
    color: GRAPHITE,
  },
  wordmarkLight: {
    fontWeight: "300",
  },
  wordmarkBold: {
    fontWeight: "600",
  },
  wordmarkSub: {
    fontSize: 11,
    letterSpacing: 4,
    textTransform: "uppercase",
    color: "rgba(20,19,18,0.42)",
    textAlign: "center",
    marginTop: 6,
  },
  dialWrap: {
    width: DIAL,
    height: DIAL,
  },
  tagline: {
    fontSize: 11,
    letterSpacing: 3,
    textTransform: "uppercase",
    color: "rgba(20,19,18,0.48)",
    textAlign: "center",
  },
  enterBtn: {
    borderWidth: 1,
    borderColor: "rgba(20,19,18,0.10)",
    borderRadius: 999,
    paddingHorizontal: 22,
    paddingVertical: 10,
  },
  enterBtnText: {
    fontSize: 13,
    letterSpacing: 1.5,
    color: GRAPHITE,
    fontWeight: "400",
  },
});
