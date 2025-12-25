import React, { useEffect, useMemo, useState } from "react";
import { SafeAreaView, StyleSheet, Text, View, Pressable, Alert } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";

import { fetchTomorrowSunTimes } from "./api/sunrise";
import { fetchCurrentTemperature } from "./api/weather";
import { cancelSunriseAlarm, ensureNotificationPermissions, scheduleSunriseAlarm } from "./services/alarm";
import { loadSettings, saveSettings, type SavedLocation } from "./services/storage";
import { addMinutes, formatTime, formatTimeLabel, formatTimeRange } from "./utils/time";

const DEFAULT_LOCATION: SavedLocation = {
  latitude: 37.7749,
  longitude: -122.4194,
  label: "San Francisco"
};

type Screen = "main" | "weather" | "sun";

export default function App() {
  const [location, setLocation] = useState<SavedLocation>(DEFAULT_LOCATION);
  const [sunriseTime, setSunriseTime] = useState<Date | null>(null);
  const [sunsetTime, setSunsetTime] = useState<Date | null>(null);
  const [alarmEnabled, setAlarmEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState<Screen>("main");
  const [temperature, setTemperature] = useState<number | null>(null);
  const [temperatureUnit, setTemperatureUnit] = useState<string | null>(null);
  const [temperatureUnitPreference, setTemperatureUnitPreference] = useState<"C" | "F">("C");
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const canToggle = !!sunriseTime && !loading;

  const display = useMemo(() => (sunriseTime ? formatTime(sunriseTime) : null), [sunriseTime]);

  const sunDetails = useMemo(() => {
    if (!sunriseTime || !sunsetTime) return null;

    const goldenMorning = formatTimeRange(sunriseTime, addMinutes(sunriseTime, 60));
    const goldenEvening = formatTimeRange(addMinutes(sunsetTime, -60), sunsetTime);
    const blueMorning = formatTimeRange(addMinutes(sunriseTime, -30), sunriseTime);
    const blueEvening = formatTimeRange(sunsetTime, addMinutes(sunsetTime, 30));

    return {
      sunrise: formatTimeLabel(sunriseTime),
      sunset: formatTimeLabel(sunsetTime),
      goldenHour: `${goldenMorning} / ${goldenEvening}`,
      blueHour: `${blueMorning} / ${blueEvening}`
    };
  }, [sunriseTime, sunsetTime]);

  const temperatureLabel = useMemo(() => {
    if (temperature === null) return "--";
    const baseUnit = temperatureUnit && temperatureUnit.toUpperCase().includes("F") ? "F" : "C";
    let value = temperature;
    if (baseUnit !== temperatureUnitPreference) {
      value = baseUnit === "C" ? (temperature * 9) / 5 + 32 : ((temperature - 32) * 5) / 9;
    }
    return `${Math.round(value)}°${temperatureUnitPreference}`;
  }, [temperature, temperatureUnit, temperatureUnitPreference]);

  async function refreshSunTimes(loc: SavedLocation) {
    const { sunrise, sunset } = await fetchTomorrowSunTimes(loc.latitude, loc.longitude);
    setSunriseTime(sunrise);
    setSunsetTime(sunset);
    return { sunrise, sunset };
  }

  async function hydrate() {
    setLoading(true);
    try {
      const saved = await loadSettings();
      if (saved?.location) setLocation(saved.location);
      if (saved?.alarmEnabled) setAlarmEnabled(true);

      const loc = saved?.location ?? DEFAULT_LOCATION;
      const { sunrise } = await refreshSunTimes(loc);

      // If alarm was enabled previously, re-schedule to ensure it's up to date
      if (saved?.alarmEnabled) {
        await ensureNotificationPermissions();
        await scheduleSunriseAlarm(sunrise);
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to load app");
    } finally {
      setLoading(false);
    }
  }

  async function requestAndSetLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      setLocation((prev) => ({ ...prev, label: "Location Off" }));
      Alert.alert("Location Off", "Enable location to get sunrise for your area. Using default location for now.");
      return;
    }

    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };

    let label = "Your Location";
    try {
      const results = await Location.reverseGeocodeAsync(coords);
      const first = results?.[0];
      if (first) {
        const city = first.city || first.subregion || first.region || "";
        const region = first.region || "";
        label = city ? (region && city !== region ? `${city}, ${region}` : city) : "Your Location";
      }
    } catch {
      // ignore reverse geocode failures
    }

    const newLoc: SavedLocation = { ...coords, label };
    setLocation(newLoc);

    const { sunrise } = await refreshSunTimes(newLoc);

    // If alarm enabled, re-schedule for the new location's sunrise
    if (alarmEnabled && sunrise) {
      await ensureNotificationPermissions();
      await scheduleSunriseAlarm(sunrise);
    }

    await saveSettings({ alarmEnabled, location: newLoc });
  }

  async function onToggle() {
    if (!sunriseTime) {
      Alert.alert("Sunrise Unavailable", "Wait for the sunrise time to load, then try again.");
      return;
    }

    const nextEnabled = !alarmEnabled;
    setAlarmEnabled(nextEnabled);

    try {
      if (nextEnabled) {
        // enabling
        await ensureNotificationPermissions();
        await scheduleSunriseAlarm(sunriseTime);
      } else {
        // disabling
        await cancelSunriseAlarm();
      }
      await saveSettings({ alarmEnabled: nextEnabled, location });
    } catch (e: any) {
      setAlarmEnabled(!nextEnabled);
      Alert.alert("Alarm Error", e?.message ?? "Failed to update the sunrise alarm.");
    }
  }

  useEffect(() => {
    hydrate();
  }, []);

  useEffect(() => {
    if (screen !== "weather") return;
    let active = true;

    setWeatherLoading(true);
    setWeatherError(null);

    fetchCurrentTemperature(location.latitude, location.longitude)
      .then((result) => {
        if (!active) return;
        setTemperature(result.temperature);
        setTemperatureUnit(result.unit);
      })
      .catch((e: any) => {
        if (!active) return;
        setWeatherError(e?.message ?? "Failed to load temperature.");
        setTemperature(null);
        setTemperatureUnit(null);
      })
      .finally(() => {
        if (!active) return;
        setWeatherLoading(false);
      });

    return () => {
      active = false;
    };
  }, [screen, location.latitude, location.longitude]);

  function renderMain() {
    return (
      <View style={styles.center}>
        <View style={styles.labelRow}>
          <Ionicons name="sunny-outline" size={20} color="#374151" />
          <Text style={styles.labelText}>Sunrise Tomorrow</Text>
        </View>

        <View style={styles.timeRow}>
          <Text style={styles.timeText}>{display ? display.time : loading ? "--:--" : "N/A"}</Text>
          <Text style={styles.periodText}>{display ? display.period : ""}</Text>
        </View>

        <Pressable
          onPress={onToggle}
          disabled={!canToggle}
          style={[
            styles.toggle,
            { backgroundColor: alarmEnabled ? "#FF9500" : "#E5E7EB" },
            !canToggle && { opacity: 0.6 }
          ]}
          accessibilityLabel={alarmEnabled ? "Disable alarm" : "Enable alarm"}
          accessibilityState={{ disabled: !canToggle }}
        >
          <View style={[styles.toggleKnob, { alignSelf: alarmEnabled ? "flex-end" : "flex-start" }]} />
        </Pressable>

        <Text style={styles.helper}>
          {alarmEnabled ? "Alarm enabled - we'll notify you at sunrise." : "Enable to schedule a sunrise notification."}
        </Text>
      </View>
    );
  }

  function renderWeather() {
    return (
      <View style={styles.center}>
        <View style={styles.labelRow}>
          <Ionicons name="cloud-outline" size={20} color="#374151" />
          <Text style={styles.labelText}>Current Temperature</Text>
        </View>

        {weatherLoading ? (
          <Text style={styles.tempText}>--</Text>
        ) : weatherError ? (
          <Text style={styles.helper}>{weatherError}</Text>
        ) : (
          <Pressable
            onPress={() => setTemperatureUnitPreference((prev) => (prev === "C" ? "F" : "C"))}
            accessibilityRole="button"
            accessibilityLabel={`Temperature ${temperatureLabel}. Tap to switch to ${
              temperatureUnitPreference === "C" ? "F" : "C"
            }.`}
          >
            <Text style={styles.tempText}>{temperatureLabel}</Text>
          </Pressable>
        )}
      </View>
    );
  }

  function renderSunDetails() {
    const sunriseLabel = sunDetails?.sunrise ?? "N/A";
    const sunsetLabel = sunDetails?.sunset ?? "N/A";
    const goldenLabel = sunDetails?.goldenHour ?? "N/A";
    const blueLabel = sunDetails?.blueHour ?? "N/A";

    return (
      <View style={styles.center}>
        <View style={styles.labelRow}>
          <Ionicons name="sunny-outline" size={20} color="#374151" />
          <Text style={styles.labelText}>Sun Details</Text>
        </View>

        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Sunrise</Text>
            <Text style={styles.detailValue}>{sunriseLabel}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Sunset</Text>
            <Text style={styles.detailValue}>{sunsetLabel}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Golden Hour</Text>
            <Text style={styles.detailValue}>{goldenLabel}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Blue Hour</Text>
            <Text style={styles.detailValue}>{blueLabel}</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <LinearGradient
      colors={["#FF8A2A", "#FFD980"]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.safe}>
        {/* Top row */}
        <View style={styles.topRow}>
          <Pressable onPress={requestAndSetLocation} style={styles.locationPill} accessibilityLabel="Update location">
            <Ionicons name="location-outline" size={18} color="#111111" />
            <Text style={styles.locationText} numberOfLines={1}>
              {location.label}
            </Text>
          </Pressable>
        </View>

        {screen === "main" ? renderMain() : screen === "weather" ? renderWeather() : renderSunDetails()}

        {/* Bottom nav placeholder */}
        <View style={styles.bottomNav}>
          <Pressable
            style={[styles.navBtn, screen === "weather" && styles.navBtnActive]}
            onPress={() => setScreen("weather")}
            accessibilityLabel="Weather"
          >
            <Ionicons name="cloud-outline" size={26} color="#111111" />
          </Pressable>
          <Pressable
            style={[styles.navBtn, screen === "main" && styles.navBtnActive]}
            onPress={() => setScreen("main")}
            accessibilityLabel="Alarm"
          >
            <Ionicons name="time-outline" size={26} color="#111111" />
          </Pressable>
          <Pressable
            style={[styles.navBtn, screen === "sun" && styles.navBtnActive]}
            onPress={() => setScreen("sun")}
            accessibilityLabel="Sun details"
          >
            <Ionicons name="sunny-outline" size={26} color="#111111" />
          </Pressable>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },

  safe: { flex: 1, backgroundColor: "transparent" },

  topRow: { paddingHorizontal: 16, paddingTop: 8 },
  locationPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(17, 24, 39, 0.06)"
  },
  locationText: { color: "#111111", fontSize: 14, fontWeight: "600", maxWidth: 240 },

  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 18 },
  labelText: { color: "#374151", fontSize: 16, fontWeight: "600", letterSpacing: 0.2 },

  timeRow: { flexDirection: "row", alignItems: "flex-end", gap: 10, marginBottom: 22 },
  timeText: { color: "#111111", fontSize: 72, fontWeight: "700", letterSpacing: -1 },
  periodText: { color: "#111111", fontSize: 22, fontWeight: "700", marginBottom: 10 },

  toggle: {
    width: 72,
    height: 40,
    borderRadius: 999,
    padding: 4,
    justifyContent: "center"
  },
  toggleKnob: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: "#FFFFFF"
  },

  tempText: { color: "#111111", fontSize: 56, fontWeight: "700" },

  detailsCard: {
    width: "100%",
    maxWidth: 340,
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.5)"
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8
  },
  detailLabel: { color: "#374151", fontSize: 14, fontWeight: "600" },
  detailValue: { color: "#111111", fontSize: 14, fontWeight: "700", textAlign: "right", flex: 1, marginLeft: 12 },

  helper: { marginTop: 14, color: "#6B7280", fontSize: 14, textAlign: "center" },

  bottomNav: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "rgba(17, 24, 39, 0.06)"
  },
  navBtn: {
    width: 56,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: "rgba(17, 24, 39, 0.04)"
  },
  navBtnActive: {
    backgroundColor: "rgba(17, 24, 39, 0.12)"
  }
});
