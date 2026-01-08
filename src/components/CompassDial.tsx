import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

type CompassColors = {
  minorTick: string;
  majorTick: string;
  degreeText: string;
  cardinalText: string;
  northText: string;
  beam: string;
};

export type CompassDialProps = {
  /** Pixel size of the square compass dial. */
  size: number;
  /** Extra padding around the dial to prevent clipping. */
  outerPadding?: number;
  /** Device heading in degrees, 0 = North. If null, dial stays unrotated. */
  heading: number | null;
  colors: CompassColors;
  /** Show degree numbers (0..330). Default: true */
  showDegrees?: boolean;
  /** Show N/E/S/W labels. Default: true */
  showCardinals?: boolean;
};

const DEG_STEP = 10;
const MAJOR_STEP = 30;

export function CompassDial({
  size,
  heading,
  colors,
  showDegrees = true,
  showCardinals = true,
  outerPadding = 22
}: CompassDialProps) {
  const dialSize = Number.isFinite(size) ? Math.max(0, size) : 0;
  if (!dialSize) return null;

  const pad = Number.isFinite(outerPadding) ? Math.max(0, outerPadding) : 0;
  const rootSize = dialSize + pad * 2;

  const rotation = useMemo(() => {
    // Rotate the dial opposite the device heading.
    // If the phone points East (90 deg), we rotate the dial -90 deg so "E" moves to the top.
    const h = typeof heading === "number" && Number.isFinite(heading) ? heading : 0;
    return (-h + 360) % 360;
  }, [heading]);

  const inverseRotation = useMemo(() => {
    // Used to keep text upright while the dial rotates.
    return (360 - rotation) % 360;
  }, [rotation]);

  const marks = useMemo(() => {
    if (!dialSize) {
      return {
        ticks: [] as Array<{ key: string; left: number; top: number; size: number; major: boolean }>,
        degreeLabels: [] as Array<{ key: string; deg: number; left: number; top: number }>,
        cardinals: [] as Array<{ key: string; label: "N" | "E" | "S" | "W"; left: number; top: number }>
      };
    }

    const radius = dialSize / 2;
    // ticks on the ring
    const tickRadius = radius * 0.92;

    // degree numbers inside (so they don't collide with N/E/S/W)
    const degreeRadius = radius * 0.74;

    // N/E/S/W near the outer edge (outside the tick ring)
    const cardinalRadius = radius * 0.99;

    const ticks: Array<{ key: string; left: number; top: number; size: number; major: boolean }> = [];
    const degreeLabels: Array<{ key: string; deg: number; left: number; top: number }> = [];
    const cardinals: Array<{ key: string; label: "N" | "E" | "S" | "W"; left: number; top: number }> = [];

    for (let deg = 0; deg < 360; deg += DEG_STEP) {
      const major = deg % MAJOR_STEP === 0;
      const dot = major ? 4 : 2;

      // deg=0 at the top
      const angle = ((deg - 90) * Math.PI) / 180;
      const x = radius + tickRadius * Math.cos(angle);
      const y = radius + tickRadius * Math.sin(angle);

      ticks.push({ key: `tick-${deg}`, left: x - dot / 2, top: y - dot / 2, size: dot, major });
    }

    const ZERO_AT_POS_DEG = 90; // East position

    if (showDegrees) {
      for (let posDeg = 0; posDeg < 360; posDeg += MAJOR_STEP) {
        const angle = ((posDeg - 90) * Math.PI) / 180;
        const x = radius + degreeRadius * Math.cos(angle);
        const y = radius + degreeRadius * Math.sin(angle);

        // relabel so East (posDeg=90) shows 0
        const labelDeg = (posDeg - ZERO_AT_POS_DEG + 360) % 360;

        degreeLabels.push({
          key: `deg-${posDeg}`,
          deg: labelDeg,
          left: x,
          top: y
        });
      }
    }

    if (showCardinals) {
      const defs: Array<{ deg: number; label: "N" | "E" | "S" | "W" }> = [
        { deg: 0, label: "N" },
        { deg: 90, label: "E" },
        { deg: 180, label: "S" },
        { deg: 270, label: "W" }
      ];

      for (const c of defs) {
        const angle = ((c.deg - 90) * Math.PI) / 180;
        const x = radius + cardinalRadius * Math.cos(angle);
        const y = radius + cardinalRadius * Math.sin(angle);
        cardinals.push({ key: `card-${c.label}`, label: c.label, left: x, top: y });
      }
    }

    return { ticks, degreeLabels, cardinals };
  }, [dialSize, showDegrees, showCardinals]);

  const beamStyle = useMemo(() => {
    if (!dialSize) return null;
    const radius = dialSize / 2;
    const beamHeight = Math.max(0, radius * 0.72);
    const halfWidth = Math.max(8, beamHeight * 0.42);
    return {
      borderLeftWidth: halfWidth,
      borderRightWidth: halfWidth,
      borderBottomWidth: beamHeight,
      marginLeft: -halfWidth,
      marginTop: -beamHeight
    };
  }, [dialSize]);

  return (
    <View
      style={[styles.root, { width: rootSize, height: rootSize, top: -pad, left: -pad }]}
      pointerEvents="none"
    >
      {/* Rotating dial */}
      <View
        style={[
          styles.dial,
          {
            width: dialSize,
            height: dialSize,
            left: pad,
            top: pad,
            transform: [{ rotate: `${rotation}deg` }]
          }
        ]}
      >
        {marks.ticks.map((tick) => (
          <View
            key={tick.key}
            style={[
              styles.tick,
              {
                left: tick.left,
                top: tick.top,
                width: tick.size,
                height: tick.size,
                backgroundColor: tick.major ? colors.majorTick : colors.minorTick
              }
            ]}
          />
        ))}

        {marks.degreeLabels.map((d) => (
          <Text
            key={d.key}
            style={[
              styles.degree,
              {
                left: d.left - 14,
                top: d.top - 8,
                color: d.deg === 0 ? colors.northText : colors.degreeText,
                transform: [{ rotate: `${inverseRotation}deg` }]
              }
            ]}
          >
            {d.deg}
          </Text>
        ))}

        {marks.cardinals.map((c) => (
          <Text
            key={c.key}
            style={[
              styles.cardinal,
              {
                left: c.left - 10,
                top: c.top - 10,
                color: c.label === "E" ? colors.northText : colors.cardinalText,
                transform: [{ rotate: `${inverseRotation}deg` }]
              }
            ]}
          >
            {c.label}
          </Text>
        ))}
      </View>

      {/* Stationary pointer/beam */}
      <View style={[styles.beam, beamStyle, { borderBottomColor: colors.beam }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    overflow: "visible"
  },
  dial: {
    position: "absolute",
    borderRadius: 999
  },
  tick: {
    position: "absolute",
    borderRadius: 999
  },
  degree: {
    position: "absolute",
    width: 28,
    textAlign: "center",
    fontSize: 10,
    fontWeight: "600"
  },
  cardinal: {
    position: "absolute",
    width: 20,
    height: 20,
    textAlign: "center",
    textAlignVertical: "center",
    fontSize: 14,
    fontWeight: "800"
  },
  beam: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 0,
    height: 0,
    borderLeftColor: "transparent",
    borderRightColor: "transparent"
  }
});
