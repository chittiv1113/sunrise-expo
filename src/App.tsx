import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";

import { fetchSunTimes } from "./api/sunrise";
import {
  fetchAirQualityIndex,
  fetchCurrentTemperature,
  fetchWeatherDetails,
  fetchWeeklyForecast,
  type DailyForecast,
  type WeatherDetails
} from "./api/weather";
import { cancelSunriseAlarm, ensureNotificationPermissions, scheduleSunriseAlarm } from "./services/alarm";
import { loadSettings, saveSettings, type SavedLocation } from "./services/storage";
import { addMinutes, formatTime, formatTimeLabel, formatTimeRange } from "./utils/time";

const DEFAULT_LOCATION: SavedLocation = {
  latitude: 37.7749,
  longitude: -122.4194,
  label: "San Francisco"
};

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
const WEEKDAYS_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

const WEATHER_ICON_SIZE = 110;
const SUN_DOT_SIZE = 14;
const COMPASS_OFFSET_X = 0;
const COMPASS_TICK_RADIUS = 0.88;
const COMPASS_LABEL_RADIUS = 0.78;
const COMPASS_CARDINAL_GAP = 100;
const COMPASS_CARDINAL_SIZE = 15;


type Screen = "main" | "weather" | "sun";

export default function App() {
  const [location, setLocation] = useState<SavedLocation>(DEFAULT_LOCATION);
  const [sunriseTime, setSunriseTime] = useState<Date | null>(null);
  const [sunsetTime, setSunsetTime] = useState<Date | null>(null);
  const [todaySunrise, setTodaySunrise] = useState<Date | null>(null);
  const [todaySunset, setTodaySunset] = useState<Date | null>(null);
  const [alarmEnabled, setAlarmEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState<Screen>("main");
  const [sunArcWidth, setSunArcWidth] = useState(0);
  const [sunArcHeight, setSunArcHeight] = useState(0);
  const [sunNow, setSunNow] = useState(() => new Date());
  const [heading, setHeading] = useState<number | null>(null);
  const [compassSize, setCompassSize] = useState(0);
  const [temperature, setTemperature] = useState<number | null>(null);
  const [temperatureUnit, setTemperatureUnit] = useState<string | null>(null);
  const [temperatureUnitPreference, setTemperatureUnitPreference] = useState<"C" | "F">("F");
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [weeklyForecast, setWeeklyForecast] = useState<DailyForecast[]>([]);
  const [weatherDetails, setWeatherDetails] = useState<WeatherDetails | null>(null);
  const [weatherCode, setWeatherCode] = useState<number | null>(null);
  const [weatherIsDay, setWeatherIsDay] = useState<boolean | null>(null);
  const [bgMode, setBgMode] = useState<"bg1" | "bg2">("bg1");
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [customLocationQuery, setCustomLocationQuery] = useState("");
  const [customLocationError, setCustomLocationError] = useState<string | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationSuggestions, setLocationSuggestions] = useState<SavedLocation[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const canToggle = !!sunriseTime && !loading;
  const canApplyCustom = customLocationQuery.trim().length > 0 && !locationBusy;
  const bgColors = useMemo<readonly [string, string, ...string[]]>(() => {
    return bgMode === "bg1"
      ? (["#FFD980", "#FF8A2A"] as const)
      : (["#38BDF8", "#4F46E5", "#312E81"] as const);
  }, [bgMode]);
  const uiColors = useMemo(
    () => ({
      primary: bgMode === "bg2" ? "#F8FAFC" : "#111111",
      secondary: bgMode === "bg2" ? "#E2E8F0" : "#374151",
      muted: bgMode === "bg2" ? "#CBD5F5" : "#6B7280",
      icon: bgMode === "bg2" ? "#F8FAFC" : "#111111",
      iconMuted: bgMode === "bg2" ? "#E2E8F0" : "#374151",
      compassMinor: bgMode === "bg2" ? "rgba(56, 189, 248, 0.35)" : "rgba(14, 116, 144, 0.3)",
      compassMajor: bgMode === "bg2" ? "rgba(94, 234, 212, 0.9)" : "rgba(14, 116, 144, 0.85)",
      compassBeam: bgMode === "bg2" ? "rgba(56, 189, 248, 0.22)" : "rgba(14, 116, 144, 0.18)",
    }),
    [bgMode]
  );

  const display = useMemo(() => (sunriseTime ? formatTime(sunriseTime) : null), [sunriseTime]);

  const sunDetails = useMemo(() => {
    if (!sunriseTime || !sunsetTime) return null;

    const goldenEvening = formatTimeRange(addMinutes(sunsetTime, -60), sunsetTime);
    const blueEvening = formatTimeRange(sunsetTime, addMinutes(sunsetTime, 30));

    return {
      sunrise: formatTimeLabel(sunriseTime),
      sunset: formatTimeLabel(sunsetTime),
      goldenHour: goldenEvening,
      blueHour: blueEvening
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

  const todayLabel = useMemo(() => WEEKDAYS_FULL[new Date().getDay()], []);

  const forecastItems = useMemo(() => {
    if (!weeklyForecast.length) return [];

    const sourceUnit = weeklyForecast[0]?.unit && weeklyForecast[0].unit.toUpperCase().includes("F") ? "F" : "C";

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return weeklyForecast
      .map((day) => {
        const date = new Date(`${day.date}T00:00:00`);
        const avg = (day.temperatureMax + day.temperatureMin) / 2;
        let temperature = avg;
        if (sourceUnit !== temperatureUnitPreference) {
          temperature = sourceUnit === "C" ? (temperature * 9) / 5 + 32 : ((temperature - 32) * 5) / 9;
        }
        return {
          key: day.date,
          dayLabel: WEEKDAYS[date.getDay()],
          date,
          temperature: Math.round(temperature)
        };
      })
      .filter((item) => item.date.getTime() > today.getTime())
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(0, 6);
  }, [weeklyForecast, temperatureUnitPreference]);

  const weatherIcon = useMemo(() => {
    if (weatherCode === null) {
      return { name: "cloud" as const, label: "Weather" };
    }

    const isDay = weatherIsDay !== false;

    if (weatherCode === 0 || weatherCode === 1) {
      return { name: isDay ? "sunny" : "moon", label: "Clear" } as const;
    }

    if (weatherCode === 2) {
      return { name: isDay ? "partly-sunny" : "cloudy-night", label: "Partly cloudy" } as const;
    }

    if (weatherCode === 3 || weatherCode === 45 || weatherCode === 48) {
      return { name: "cloud" as const, label: "Cloudy" };
    }

    if (
      (weatherCode >= 51 && weatherCode <= 67) ||
      (weatherCode >= 80 && weatherCode <= 82)
    ) {
      return { name: "rainy" as const, label: "Rain" };
    }

    if ((weatherCode >= 71 && weatherCode <= 77) || (weatherCode >= 85 && weatherCode <= 86)) {
      return { name: "snow" as const, label: "Snow" };
    }

    if (weatherCode >= 95 && weatherCode <= 99) {
      return { name: "thunderstorm" as const, label: "Thunderstorm" };
    }

    return { name: "cloud" as const, label: "Weather" };
  }, [weatherCode, weatherIsDay]);

  const weatherDetailLabels = useMemo(() => {
    const precip = weatherDetails?.precipitationProbability;
    const wind = weatherDetails?.windSpeed;
    const windUnit = weatherDetails?.windUnit ?? "km/h";
    const airQuality = weatherDetails?.airQuality;

    return {
      precipitation: typeof precip === "number" ? `${Math.round(precip)}%` : "--",
      wind: typeof wind === "number" ? `${Math.round(wind)} ${windUnit}` : "--",
      airQuality: typeof airQuality === "number" ? `${Math.round(airQuality)} AQI` : "--"
    };
  }, [weatherDetails]);

  const compassRotation = useMemo(() => {
    if (heading === null) return 0;
    return (90 - heading + 360) % 360;
  }, [heading]);

  const compassCenterStyle = useMemo(() => {
    if (!compassSize) return null;
    const size = compassSize * 0.62;
    const offset = (compassSize - size) / 2;
    return {
      width: size,
      height: size,
      borderRadius: size / 2,
      left: offset + COMPASS_OFFSET_X,
      top: offset
    };
  }, [compassSize]);

  const compassMarks = useMemo(() => {
    if (!compassSize) return { ticks: [], labels: [] as Array<{ deg: number; left: number; top: number }> };
    const radius = compassSize / 2;
    const tickRadius = radius * COMPASS_TICK_RADIUS;
    const labelRadius = radius * COMPASS_LABEL_RADIUS;
    const ticks: Array<{ key: string; left: number; top: number; size: number; major: boolean }> = [];
    const labels: Array<{ deg: number; left: number; top: number }> = [];

    for (let deg = 0; deg < 360; deg += 10) {
      const isMajor = deg % 30 === 0;
      const size = isMajor ? 4 : 2;
      const angle = ((deg - 90) * Math.PI) / 180;
      const x = radius + tickRadius * Math.cos(angle);
      const y = radius + tickRadius * Math.sin(angle);
      ticks.push({ key: `tick-${deg}`, left: x - size / 2, top: y - size / 2, size, major: isMajor });
    }

    for (let deg = 0; deg < 360; deg += 30) {
      const angle = ((deg - 90) * Math.PI) / 180;
      const x = radius + labelRadius * Math.cos(angle);
      const y = radius + labelRadius * Math.sin(angle);
      labels.push({ deg, left: x, top: y });
    }

    return { ticks, labels };
  }, [compassSize]);

  const compassCardinalStyle = useMemo(() => {
    if (!compassSize) return null;
    const radius = compassSize / 2;
    const tickRadius = radius * COMPASS_TICK_RADIUS;
    const halfSize = COMPASS_CARDINAL_SIZE / 2;
    const maxRadius = radius - halfSize - 2;
    const cardinalRadius = Math.min(tickRadius + COMPASS_CARDINAL_GAP, maxRadius);
    const center = radius - halfSize;
    return {
      east: { left: center, top: radius - cardinalRadius - halfSize },
      west: { left: center, top: radius + cardinalRadius - halfSize },
      north: { left: radius - cardinalRadius - halfSize, top: center },
      south: { left: radius + cardinalRadius - halfSize, top: center }
    };
  }, [compassSize]);

  const compassBeamStyle = useMemo(() => {
    if (!compassSize) return null;
    const radius = compassSize / 2;
    const beamHeight = Math.max(0, radius * 0.7 - 6);
    const halfWidth = beamHeight * 0.45;
    return {
      borderLeftWidth: halfWidth,
      borderRightWidth: halfWidth,
      borderBottomWidth: beamHeight,
      marginLeft: -halfWidth + COMPASS_OFFSET_X,
      marginTop: -beamHeight
    };
  }, [compassSize]);


  function getSunAltitude(timeMs: number) {
    if (!todaySunrise || !todaySunset) return null;
    const sunriseMs = todaySunrise.getTime();
    const sunsetMs = todaySunset.getTime();
    if (sunsetMs <= sunriseMs) return null;

    if (timeMs >= sunriseMs && timeMs <= sunsetMs) {
      const daySpan = sunsetMs - sunriseMs;
      const dayProgress = (timeMs - sunriseMs) / daySpan;
      return Math.sin(Math.PI * dayProgress);
    }

    let nightStart: number;
    let nightEnd: number;
    if (timeMs < sunriseMs) {
      nightEnd = sunriseMs;
      nightStart = sunsetMs - 24 * 60 * 60 * 1000;
    } else {
      nightStart = sunsetMs;
      const nextSunrise = sunriseTime
        ? sunriseTime.getTime()
        : sunriseMs + 24 * 60 * 60 * 1000;
      nightEnd = nextSunrise;
    }

    const nightSpan = nightEnd - nightStart;
    if (nightSpan <= 0) return null;
    const nightProgress = (timeMs - nightStart) / nightSpan;
    return -Math.sin(Math.PI * nightProgress);
  }

  const dayProgress = useMemo(() => {
    const start = new Date(sunNow);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    const total = end.getTime() - start.getTime();
    if (total <= 0) return null;
    const raw = (sunNow.getTime() - start.getTime()) / total;
    return Math.max(0, Math.min(1, raw));
  }, [sunNow]);

  const sunAltitude = useMemo(() => getSunAltitude(sunNow.getTime()), [
    sunNow,
    todaySunrise,
    todaySunset,
    sunriseTime
  ]);

  const sunDotStyle = useMemo(() => {
    if (!sunArcWidth || !sunArcHeight || dayProgress === null || sunAltitude === null) return null;
    const horizonY = sunArcHeight / 2;
    const amplitude = Math.max(0, horizonY - SUN_DOT_SIZE);
    const x = dayProgress * sunArcWidth;
    const y = horizonY - sunAltitude * amplitude;
    return { left: x - SUN_DOT_SIZE / 2, top: y - SUN_DOT_SIZE / 2 };
  }, [sunArcWidth, sunArcHeight, dayProgress, sunAltitude]);

  const sunPathPoints = useMemo(() => {
    if (!sunArcWidth || !sunArcHeight || !todaySunrise || !todaySunset) return [];
    const start = new Date(sunNow);
    start.setHours(0, 0, 0, 0);
    const dayMs = 24 * 60 * 60 * 1000;
    const horizonY = sunArcHeight / 2;
    const amplitude = Math.max(0, horizonY - 4);
    const steps = 24;
    const points: Array<{ x: number; y: number; key: string }> = [];

    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const timeMs = start.getTime() + t * dayMs;
      const altitude = getSunAltitude(timeMs);
      if (altitude === null) continue;
      const x = t * sunArcWidth;
      const y = horizonY - altitude * amplitude;
      points.push({ x, y, key: `sunpath-${i}` });
    }

    return points;
  }, [sunArcWidth, sunArcHeight, todaySunrise, todaySunset, sunriseTime, sunNow]);

  async function resolveLocationLabel(
    coords: { latitude: number; longitude: number },
    fallbackLabel: string
  ) {
    try {
      const results = await Location.reverseGeocodeAsync(coords);
      const first = results?.[0];
      if (!first) return fallbackLabel;
      const city = first.city || first.subregion || first.region || "";
      const region = first.region || "";
      return city ? (region && city !== region ? `${city}, ${region}` : city) : fallbackLabel;
    } catch {
      return fallbackLabel;
    }
  }

  async function getCurrentLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return null;

    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    const label = await resolveLocationLabel(coords, "Your Location");
    return { ...coords, label };
  }

  function parseCoordinatesQuery(value: string) {
    const parts = value.split(",");
    if (parts.length !== 2) return null;
    const latitude = Number(parts[0].trim());
    const longitude = Number(parts[1].trim());
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
    return { latitude, longitude };
  }

  async function applyLocation(nextLocation: SavedLocation) {
    try {
      setLocation(nextLocation);
      const { sunrise } = await refreshSunTimes(nextLocation);

      if (alarmEnabled && sunrise) {
        await ensureNotificationPermissions();
        await scheduleSunriseAlarm(sunrise);
      }

      await saveSettings({ alarmEnabled, location: nextLocation });
      return true;
    } catch (e: any) {
      Alert.alert("Location Error", e?.message ?? "Failed to update location.");
      return false;
    }
  }

  function openLocationModal() {
    setCustomLocationQuery("");
    setCustomLocationError(null);
    setLocationSuggestions([]);
    setSuggestionsLoading(false);
    setLocationModalOpen(true);
  }

  async function refreshSunTimes(loc: SavedLocation) {
    const { today, tomorrow } = await fetchSunTimes(loc.latitude, loc.longitude);
    setSunriseTime(tomorrow.sunrise);
    setSunsetTime(tomorrow.sunset);
    setTodaySunrise(today.sunrise);
    setTodaySunset(today.sunset);
    return { sunrise: tomorrow.sunrise, sunset: tomorrow.sunset };
  }

  async function hydrate() {
    setLoading(true);
    try {
      const saved = await loadSettings();
      const nextAlarmEnabled = !!saved?.alarmEnabled;
      setAlarmEnabled(nextAlarmEnabled);

      let loc: SavedLocation = saved?.location ?? DEFAULT_LOCATION;
      if (!saved?.location) {
        let current: SavedLocation | null = null;
        let currentError: string | null = null;
        try {
          current = await getCurrentLocation();
        } catch (e: any) {
          currentError = e?.message ?? "Failed to get current location.";
        }

        if (current) {
          loc = current;
        } else {
          loc = { ...DEFAULT_LOCATION, label: "Location Off" };
          if (currentError) {
            Alert.alert("Location Error", currentError);
          } else {
            Alert.alert(
              "Location Off",
              "Enable location to get sunrise for your area. Using default location for now."
            );
          }
        }

        await saveSettings({ alarmEnabled: nextAlarmEnabled, location: loc });
      }

      setLocation(loc);
      const { sunrise } = await refreshSunTimes(loc);

      // If alarm was enabled previously, re-schedule to ensure it's up to date
      if (nextAlarmEnabled) {
        await ensureNotificationPermissions();
        await scheduleSunriseAlarm(sunrise);
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to load app");
    } finally {
      setLoading(false);
    }
  }

  async function handleUseCurrentLocation() {
    setCustomLocationError(null);
    setLocationBusy(true);
    try {
      const current = await getCurrentLocation();
      if (!current) {
        Alert.alert("Location Off", "Enable location to get sunrise for your area.");
        return;
      }

      const applied = await applyLocation(current);
      if (applied) setLocationModalOpen(false);
    } catch (e: any) {
      Alert.alert("Location Error", e?.message ?? "Failed to get current location.");
    } finally {
      setLocationBusy(false);
    }
  }

  async function handleApplyCustomLocation() {
    const query = customLocationQuery.trim();
    if (!query) {
      setCustomLocationError("Enter a city, address, or coordinates.");
      return;
    }

    setLocationBusy(true);
    setCustomLocationError(null);

    try {
      let coords = parseCoordinatesQuery(query);
      if (!coords) {
        const results = await Location.geocodeAsync(query);
        const first = results?.[0];
        if (!first) {
          setCustomLocationError("Location not found.");
          return;
        }
        coords = { latitude: first.latitude, longitude: first.longitude };
      }

      const label = await resolveLocationLabel(coords, query);
      const applied = await applyLocation({ ...coords, label });
      if (applied) {
        setLocationModalOpen(false);
        setCustomLocationQuery("");
        setLocationSuggestions([]);
      }
    } catch (e: any) {
      setCustomLocationError(e?.message ?? "Failed to set location.");
    } finally {
      setLocationBusy(false);
    }
  }

  async function handleSelectSuggestion(suggestion: SavedLocation) {
    setLocationBusy(true);
    setCustomLocationError(null);
    try {
      const applied = await applyLocation(suggestion);
      if (applied) {
        setLocationModalOpen(false);
        setCustomLocationQuery("");
        setLocationSuggestions([]);
      }
    } finally {
      setLocationBusy(false);
    }
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
    setWeeklyForecast([]);
    setWeatherDetails(null);
    setWeatherCode(null);
    setWeatherIsDay(null);

    Promise.allSettled([
      fetchCurrentTemperature(location.latitude, location.longitude),
      fetchWeeklyForecast(location.latitude, location.longitude),
      fetchWeatherDetails(location.latitude, location.longitude),
      fetchAirQualityIndex(location.latitude, location.longitude)
    ])
      .then(([currentResult, forecastResult, detailsResult, airQualityResult]) => {
        if (!active) return;

        if (currentResult.status === "fulfilled") {
          setTemperature(currentResult.value.temperature);
          setTemperatureUnit(currentResult.value.unit);
          setWeatherCode(currentResult.value.weatherCode);
          setWeatherIsDay(currentResult.value.isDay);
        } else {
          setWeatherError(currentResult.reason?.message ?? "Failed to load temperature.");
          setTemperature(null);
          setTemperatureUnit(null);
          setWeatherCode(null);
          setWeatherIsDay(null);
        }

        if (forecastResult.status === "fulfilled") {
          setWeeklyForecast(forecastResult.value);
        } else {
          setWeeklyForecast([]);
        }

        const nextDetails: WeatherDetails = {
          precipitationProbability: null,
          windSpeed: null,
          windUnit: null,
          airQuality: null
        };

        let hasDetails = false;

        if (detailsResult.status === "fulfilled") {
          nextDetails.precipitationProbability = detailsResult.value.precipitationProbability;
          nextDetails.windSpeed = detailsResult.value.windSpeed;
          nextDetails.windUnit = detailsResult.value.windUnit;
          hasDetails = true;
        }

        if (airQualityResult.status === "fulfilled") {
          nextDetails.airQuality = airQualityResult.value;
          hasDetails = true;
        }

        setWeatherDetails(hasDetails ? nextDetails : null);
      })
      .finally(() => {
        if (!active) return;
        setWeatherLoading(false);
      });

    return () => {
      active = false;
    };
  }, [screen, location.latitude, location.longitude]);

  useEffect(() => {
    if (screen !== "main") return;
    let active = true;
    let subscription: Location.LocationSubscription | null = null;

    const start = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!active || status !== "granted") return;
      subscription = await Location.watchHeadingAsync((data) => {
        if (!active) return;
        const next = data.trueHeading >= 0 ? data.trueHeading : data.magHeading;
        setHeading(next);
      });
    };

    start();

    return () => {
      active = false;
      if (subscription) subscription.remove();
    };
  }, [screen]);


  useEffect(() => {
    if (!todaySunrise || !todaySunset) return;

    const updateBg = () => {
      const now = Date.now();
      const sunriseMs = todaySunrise.getTime();
      const sunsetMs = todaySunset.getTime();
      const isNight = now >= sunsetMs || now < sunriseMs;
      setBgMode(isNight ? "bg2" : "bg1");
    };

    updateBg();
    const id = setInterval(updateBg, 60000);
    return () => clearInterval(id);
  }, [todaySunrise, todaySunset]);

  useEffect(() => {
    if (screen !== "sun") return;
    setSunNow(new Date());
    const id = setInterval(() => setSunNow(new Date()), 60000);
    return () => clearInterval(id);
  }, [screen]);

  useEffect(() => {
    if (!locationModalOpen) {
      setLocationSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }

    const query = customLocationQuery.trim();
    if (query.length < 3 || parseCoordinatesQuery(query)) {
      setLocationSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }

    let active = true;
    setLocationSuggestions([]);

    const handle = setTimeout(() => {
      setSuggestionsLoading(true);
      Location.geocodeAsync(query)
        .then(async (results) => {
          if (!active) return;
          const limited = results.slice(0, 3);
          const labeled = await Promise.all(
            limited.map(async (result) => {
              const coords = { latitude: result.latitude, longitude: result.longitude };
              const label = await resolveLocationLabel(coords, query);
              return { ...coords, label };
            })
          );
          if (!active) return;
          setLocationSuggestions(labeled);
        })
        .catch(() => {
          if (!active) return;
          setLocationSuggestions([]);
        })
        .finally(() => {
          if (!active) return;
          setSuggestionsLoading(false);
        });
    }, 350);

    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [customLocationQuery, locationModalOpen]);

  function renderMain() {
    return (
      <View style={styles.center}>
        <View style={styles.labelRow}>
          <Ionicons name="sunny-outline" size={20} color={uiColors.iconMuted} />
          <Text style={[styles.labelText, { color: uiColors.secondary }]}>Sunrise Tomorrow</Text>
        </View>

        <View
          style={styles.timeCircleWrap}
          onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            setCompassSize(Math.min(width, height));
          }}
        >
          <View style={[styles.compassFace, { transform: [{ rotate: `${compassRotation}deg` }] }]}>
            <View style={styles.compassRing} />

            {compassMarks.ticks.map((tick) => (
              <View
                key={tick.key}
                style={[
                  styles.compassTickDot,
                  {
                    left: tick.left,
                    top: tick.top,
                    width: tick.size,
                    height: tick.size,
                    backgroundColor: tick.major ? uiColors.compassMajor : uiColors.compassMinor
                  }
                ]}
              />
            ))}

            {compassMarks.labels.map((label) => (
              <Text
                key={`deg-${label.deg}`}
                style={[
                  styles.compassDegree,
                  {
                    left: label.left - 14,
                    top: label.top - 8,
                    color: uiColors.muted
                  }
                ]}
              >
                {label.deg}
              </Text>
            ))}

            <Text
              style={[
                styles.compassLabel,
                compassCardinalStyle?.east ?? styles.compassLabelTop,
                { color: "#EF4444", fontSize: 15 }
              ]}
            >
              E
            </Text>
          </View>

          <View style={[styles.timeCircleBackground, compassCenterStyle]} />
          <View style={[styles.timeOverlay, compassCenterStyle]}>
            <Text style={[styles.timeText, { color: uiColors.primary }]}>
              {display ? display.time : loading ? "--:--" : "N/A"}
            </Text>
            <Text style={[styles.periodText, { color: uiColors.secondary }]}>{display ? display.period : ""}</Text>
          </View>
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

        <Text style={[styles.helper, { color: uiColors.muted }]}>
          {alarmEnabled ? "Alarm enabled - we'll notify you at sunrise." : "Enable to schedule a sunrise notification."}
        </Text>
      </View>
    );
  }

  function renderWeather() {
    return (
      <View style={styles.weatherScreen}>
        <View style={styles.weatherMain}>
          <View style={styles.weatherIconWrap} accessibilityLabel={weatherIcon.label}>
            <Ionicons name={weatherIcon.name} size={WEATHER_ICON_SIZE} color={uiColors.primary} />
          </View>
          {weatherLoading ? (
            <View style={styles.weatherStack}>
              <Text style={[styles.tempText, { color: uiColors.primary }]}>--</Text>
              <Text style={[styles.weatherDayText, { color: uiColors.secondary }]}>{todayLabel}</Text>
            </View>
          ) : weatherError ? (
            <Text style={[styles.helper, { color: uiColors.muted }]}>{weatherError}</Text>
          ) : (
            <View style={styles.weatherStack}>
              <Pressable
                onPress={() => setTemperatureUnitPreference((prev) => (prev === "C" ? "F" : "C"))}
                accessibilityRole="button"
                accessibilityLabel={`Temperature ${temperatureLabel}. Tap to switch to ${
                  temperatureUnitPreference === "C" ? "F" : "C"
                }.`}
              >
                <Text style={[styles.tempText, { color: uiColors.primary }]}>{temperatureLabel}</Text>
              </Pressable>
              <Text style={[styles.weatherDayText, { color: uiColors.secondary }]}>{todayLabel}</Text>
            </View>
          )}
        </View>

        <View style={styles.weatherForecastWrap}>
          {forecastItems.length ? (
            <>
              <View style={styles.forecastRow}>
                {forecastItems.map((item) => (
                  <View key={item.key} style={styles.forecastItem}>
                    <Text style={[styles.forecastDay, { color: uiColors.muted }]}>{item.dayLabel}</Text>
                    <Text style={[styles.forecastTemp, { color: uiColors.primary }]}>{item.temperature}°</Text>
                  </View>
                ))}
              </View>
              <View style={styles.weatherStatsRow}>
                <View style={styles.weatherStatItem}>
                  <Text style={[styles.weatherStatLabel, { color: uiColors.muted }]}>Precip</Text>
                  <Text style={[styles.weatherStatValue, { color: uiColors.primary }]}>
                    {weatherDetailLabels.precipitation}
                  </Text>
                </View>
                <View style={styles.weatherStatItem}>
                  <Text style={[styles.weatherStatLabel, { color: uiColors.muted }]}>Air Quality</Text>
                  <Text style={[styles.weatherStatValue, { color: uiColors.primary }]}>
                    {weatherDetailLabels.airQuality}
                  </Text>
                </View>
                <View style={styles.weatherStatItem}>
                  <Text style={[styles.weatherStatLabel, { color: uiColors.muted }]}>Wind</Text>
                  <Text style={[styles.weatherStatValue, { color: uiColors.primary }]}>
                    {weatherDetailLabels.wind}
                  </Text>
                </View>
              </View>
            </>
          ) : null}
        </View>
      </View>
    );
  }

  function renderSunDetails() {
    const sunriseLabel = sunDetails?.sunrise ?? "N/A";
    const sunsetLabel = sunDetails?.sunset ?? "N/A";
    const goldenLabel = sunDetails?.goldenHour ?? "N/A";
    const blueLabel = sunDetails?.blueHour ?? "N/A";
    const todaySunriseLabel = todaySunrise ? formatTimeLabel(todaySunrise) : "N/A";
    const todaySunsetLabel = todaySunset ? formatTimeLabel(todaySunset) : "N/A";

    return (
      <View style={styles.center}>
        <View style={styles.labelRow}>
          <Ionicons name="sunny-outline" size={20} color={uiColors.iconMuted} />
          <Text style={[styles.labelText, { color: uiColors.secondary }]}>Sun Details</Text>
        </View>

        <View style={styles.trackerCard}>
          <View style={styles.trackerHeader}>
            <Ionicons name="sunny-outline" size={18} color="#374151" />
            <Text style={styles.trackerTitle}>Today's Sun Path</Text>
          </View>

          <View
            style={styles.arcWrapper}
            onLayout={(event) => {
              const { width, height } = event.nativeEvent.layout;
              setSunArcWidth(width);
              setSunArcHeight(height);
            }}
          >
            {sunPathPoints.map((point) => (
              <View
                key={point.key}
                style={[styles.sunPathPoint, { left: point.x - 1.5, top: point.y - 1.5 }]}
              />
            ))}
            <View style={styles.arcHorizon} />
            {sunDotStyle ? <View style={[styles.sunDot, sunDotStyle]} /> : null}
            <View pointerEvents="none" style={styles.horizonLabels}>
              <Text style={styles.horizonLabelText}>12:00 AM</Text>
              <Text style={styles.horizonLabelText}>11:59 PM</Text>
            </View>
          </View>

          <View style={styles.trackerFooter}>
            <Text style={styles.trackerLabel}>Sunrise {todaySunriseLabel}</Text>
            <Text style={styles.trackerLabel}>Sunset {todaySunsetLabel}</Text>
          </View>
        </View>

        <View style={styles.detailsGrid}>
          <View style={styles.detailCardRow}>
            <Text style={styles.detailLabel}>Sunrise</Text>
            <Text style={styles.detailValue}>{sunriseLabel}</Text>
          </View>
          <View style={styles.detailCardRow}>
            <Text style={styles.detailLabel}>Sunset</Text>
            <Text style={styles.detailValue}>{sunsetLabel}</Text>
          </View>
          <View style={styles.detailCardRow}>
            <Text style={styles.detailLabel}>Golden Hour</Text>
            <Text style={styles.detailValue}>{goldenLabel}</Text>
          </View>
          <View style={styles.detailCardRow}>
            <Text style={styles.detailLabel}>Blue Hour</Text>
            <Text style={styles.detailValue}>{blueLabel}</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <LinearGradient
      colors={bgColors}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.safe}>
        {/* Top row */}
        <View style={styles.topRow}>
          <Pressable onPress={openLocationModal} style={styles.locationPill} accessibilityLabel="Update location">
            <Ionicons name="location-outline" size={18} color={uiColors.icon} />
            <Text style={[styles.locationText, { color: uiColors.primary }]} numberOfLines={1}>
              {location.label}
            </Text>
          </Pressable>
        </View>

        <Modal
          visible={locationModalOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setLocationModalOpen(false)}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setLocationModalOpen(false)}>
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
              style={styles.modalKeyboard}
            >
              <Pressable style={styles.modalCard} onPress={() => {}}>
                <Text style={styles.modalTitle}>Location</Text>
                <Text style={styles.modalSubtitle} numberOfLines={1}>
                  Current: {location.label}
                </Text>

                <Text style={styles.modalSection}>Current location</Text>
                <Pressable
                  style={[styles.modalPrimaryBtn, locationBusy && styles.modalBtnDisabled]}
                  onPress={handleUseCurrentLocation}
                  disabled={locationBusy}
                  accessibilityLabel="Use current location"
                >
                  <Ionicons name="locate-outline" size={18} color="#111111" />
                  <Text style={styles.modalPrimaryText}>
                    {locationBusy ? "Working..." : "Use current location"}
                  </Text>
                </Pressable>

                <View style={styles.modalDivider} />

                <Text style={styles.modalSection}>Custom location</Text>
                <TextInput
                  value={customLocationQuery}
                  onChangeText={(value) => {
                    setCustomLocationQuery(value);
                    if (customLocationError) setCustomLocationError(null);
                  }}
                  placeholder="City, address, or lat, lon"
                  placeholderTextColor="#9CA3AF"
                  style={styles.modalInput}
                  autoCapitalize="words"
                  autoCorrect={false}
                  editable={!locationBusy}
                  returnKeyType="done"
                  onSubmitEditing={handleApplyCustomLocation}
                />
                {customLocationError ? <Text style={styles.modalError}>{customLocationError}</Text> : null}
                {suggestionsLoading ? <Text style={styles.modalHint}>Searching...</Text> : null}
                {!suggestionsLoading && locationSuggestions.length > 0 ? (
                  <View style={styles.suggestionList}>
                    {locationSuggestions.map((item, index) => (
                      <Pressable
                        key={`${item.latitude}-${item.longitude}-${index}`}
                        style={[
                          styles.suggestionRow,
                          index === locationSuggestions.length - 1 && styles.suggestionRowLast
                        ]}
                        onPress={() => handleSelectSuggestion(item)}
                        disabled={locationBusy}
                        accessibilityLabel={`Select ${item.label}`}
                      >
                        <Text style={styles.suggestionText}>{item.label}</Text>
                        <Text style={styles.suggestionSub}>
                          {item.latitude.toFixed(3)}, {item.longitude.toFixed(3)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}

                <View style={styles.modalActions}>
                  <Pressable
                    style={styles.modalBtn}
                    onPress={() => setLocationModalOpen(false)}
                    accessibilityLabel="Cancel location update"
                  >
                    <Text style={styles.modalBtnText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.modalBtn,
                      styles.modalBtnPrimary,
                      !canApplyCustom && styles.modalBtnDisabled
                    ]}
                    onPress={handleApplyCustomLocation}
                    disabled={!canApplyCustom}
                    accessibilityLabel="Save custom location"
                  >
                    <Text style={[styles.modalBtnText, styles.modalBtnTextPrimary]}>Save</Text>
                  </Pressable>
                </View>
              </Pressable>
            </KeyboardAvoidingView>
          </Pressable>
        </Modal>

        {screen === "main" ? renderMain() : screen === "weather" ? renderWeather() : renderSunDetails()}

        {/* Bottom nav placeholder */}
        <View style={styles.bottomNav}>
          <Pressable
            style={[styles.navBtn, screen === "weather" && styles.navBtnActive]}
            onPress={() => setScreen("weather")}
            accessibilityLabel="Weather"
          >
            <Ionicons name="cloud-outline" size={26} color={uiColors.icon} />
          </Pressable>
          <Pressable
            style={[styles.navBtn, screen === "main" && styles.navBtnActive]}
            onPress={() => setScreen("main")}
            accessibilityLabel="Alarm"
          >
            <Ionicons name="time-outline" size={26} color={uiColors.icon} />
          </Pressable>
          <Pressable
            style={[styles.navBtn, screen === "sun" && styles.navBtnActive]}
            onPress={() => setScreen("sun")}
            accessibilityLabel="Sun details"
          >
            <Ionicons name="sunny-outline" size={26} color={uiColors.icon} />
          </Pressable>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },

  safe: { flex: 1, backgroundColor: "transparent" },

  topRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  locationPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(17, 24, 39, 0.06)"
  },
  locationText: { color: "#111111", fontSize: 14, fontWeight: "600", maxWidth: 240 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(17, 24, 39, 0.35)",
    padding: 18
  },
  modalKeyboard: { flex: 1, justifyContent: "center" },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 18
  },
  modalTitle: { color: "#111111", fontSize: 18, fontWeight: "700" },
  modalSubtitle: { color: "#6B7280", fontSize: 13, marginTop: 4, marginBottom: 16 },
  modalSection: {
    color: "#374151",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.6,
    marginBottom: 8,
    textTransform: "uppercase"
  },
  modalPrimaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255, 149, 0, 0.18)"
  },
  modalPrimaryText: { color: "#111111", fontSize: 15, fontWeight: "600" },
  modalDivider: { height: 1, backgroundColor: "rgba(17, 24, 39, 0.08)", marginVertical: 16 },
  modalInput: {
    borderWidth: 1,
    borderColor: "rgba(17, 24, 39, 0.12)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#111111",
    fontSize: 15,
    backgroundColor: "#FFFFFF"
  },
  modalError: { marginTop: 8, color: "#B91C1C", fontSize: 13 },
  modalHint: { marginTop: 8, color: "#6B7280", fontSize: 12 },
  suggestionList: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "rgba(17, 24, 39, 0.08)",
    borderRadius: 12,
    overflow: "hidden"
  },
  suggestionRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(17, 24, 39, 0.02)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(17, 24, 39, 0.06)"
  },
  suggestionRowLast: { borderBottomWidth: 0 },
  suggestionText: { color: "#111111", fontSize: 14, fontWeight: "600" },
  suggestionSub: { color: "#6B7280", fontSize: 12, marginTop: 2 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 16 },
  modalBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "rgba(17, 24, 39, 0.08)"
  },
  modalBtnPrimary: { backgroundColor: "#111111" },
  modalBtnText: { color: "#111111", fontSize: 14, fontWeight: "600" },
  modalBtnTextPrimary: { color: "#FFFFFF" },
  modalBtnDisabled: { opacity: 0.6 },

  trackerCard: {
    width: "100%",
    maxWidth: 340,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.5)",
    marginBottom: 16
  },
  trackerHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  trackerTitle: { color: "#374151", fontSize: 14, fontWeight: "700" },
  arcWrapper: { width: "100%", aspectRatio: 2, overflow: "hidden" },
  sunPathPoint: {
    position: "absolute",
    width: 3,
    height: 3,
    borderRadius: 999,
    backgroundColor: "rgba(17, 24, 39, 0.25)"
  },
  arcHorizon: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "50%",
    height: 2,
    marginTop: -1,
    backgroundColor: "rgba(17, 24, 39, 0.12)"
  },
  horizonLabels: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "50%",
    marginTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 2
  },
  horizonLabelText: { color: "#6B7280", fontSize: 10, fontWeight: "600" },
  sunDot: {
    position: "absolute",
    width: SUN_DOT_SIZE,
    height: SUN_DOT_SIZE,
    borderRadius: SUN_DOT_SIZE / 2,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "rgba(255, 149, 0, 0.9)"
  },
  trackerFooter: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  trackerLabel: { color: "#374151", fontSize: 12, fontWeight: "600" },

  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 18 },
  labelText: { color: "#374151", fontSize: 16, fontWeight: "600", letterSpacing: 0.2 },
  timeCircleWrap: {
    width: "78%",
    maxWidth: 260,
    aspectRatio: 1,
    borderRadius: 999,
    marginBottom: 22,
    position: "relative",
    overflow: "hidden",
    alignSelf: "center"
  },
  compassFace: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    borderRadius: 999
  },
  compassRing: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    borderRadius: 999,
    backgroundColor: "transparent"
  },
  compassTickDot: {
    position: "absolute",
    borderRadius: 999
  },
  compassDegree: {
    position: "absolute",
    width: 28,
    textAlign: "center",
    fontSize: 10,
    fontWeight: "600"
  },
  compassLabel: {
    position: "absolute",
    width: COMPASS_CARDINAL_SIZE,
    height: COMPASS_CARDINAL_SIZE,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: COMPASS_CARDINAL_SIZE,
    textAlign: "center",
    textAlignVertical: "center"
  },
  compassLabelTop: { top: 8, left: "50%", marginLeft: -9 },
  compassLabelRight: { right: 14, top: "50%", marginTop: -9 },
  compassLabelBottom: { bottom: 14, left: "50%", marginLeft: -9 },
  compassLabelLeft: { left: 14, top: "50%", marginTop: -9 },
  compassBeam: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 0,
    height: 0,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "rgba(56, 189, 248, 0.2)"
  },
  timeCircleBackground: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "transparent"
  },
  timeOverlay: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center"
  },
  timeText: { color: "#111111", fontSize: 56, fontWeight: "700", letterSpacing: -1 },
  periodText: { color: "#111111", fontSize: 18, fontWeight: "700", marginTop: 4 },

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
  weatherScreen: {
    flex: 1,
    alignItems: "center",
    width: "100%",
    paddingHorizontal: 16,
    paddingTop: 12,
    position: "relative"
  },
  weatherMain: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    transform: [{ translateY: -24 }],
    position: "relative"
  },
  weatherIconWrap: {
    position: "absolute",
    top: "25%",
    transform: [{ translateY: -(WEATHER_ICON_SIZE / 2) }]
  },
  weatherStack: { alignItems: "center" },
  weatherDayText: { marginTop: 6, fontSize: 14, fontWeight: "700", letterSpacing: 2 },
  weatherForecastWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "62%",
    bottom: 0,
    justifyContent: "space-evenly",
    alignItems: "center",
    paddingHorizontal: 16
  },
  forecastRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    maxWidth: 360,
    alignSelf: "center",
    flexWrap: "nowrap"
  },
  forecastItem: { alignItems: "center", minWidth: 44, flex: 1 },
  forecastDay: { fontSize: 12, fontWeight: "700", letterSpacing: 1.6 },
  forecastTemp: { marginTop: 6, fontSize: 18, fontWeight: "700" },
  weatherStatsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    maxWidth: 360,
    alignSelf: "center"
  },
  weatherStatItem: { alignItems: "center", flex: 1 },
  weatherStatLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1.2 },
  weatherStatValue: { marginTop: 4, fontSize: 14, fontWeight: "700" },

  detailsGrid: {
    width: "100%",
    maxWidth: 340,
    gap: 12
  },
  detailCardRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.5)"
  },
  detailLabel: { color: "#374151", fontSize: 13, fontWeight: "700" },
  detailValue: { color: "#111111", fontSize: 16, fontWeight: "500", textAlign: "right" },

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
