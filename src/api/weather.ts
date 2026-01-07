import AsyncStorage from "@react-native-async-storage/async-storage";

export type CurrentTemperature = {
  temperature: number;
  unit: string | null;
  weatherCode: number | null;
  isDay: boolean | null;
};

export type DailyForecast = {
  date: string; // YYYY-MM-DD
  temperatureMin: number;
  temperatureMax: number;
  unit: string | null;
};

export type WeatherDetails = {
  precipitationProbability: number | null;
  windSpeed: number | null;
  windUnit: string | null;
  airQuality: number | null;
};

/**
 * Combined weather payload for the Weather screen.
 *
 * NOTE: This is still Open-Meteo + a separate Air Quality call.
 * We combine the 3 Open-Meteo forecast calls (current + daily + hourly) into 1.
 */
export type WeatherBundle = {
  current: CurrentTemperature;
  forecast: DailyForecast[];
  details: Omit<WeatherDetails, "airQuality">;
  fetchedAtMs: number;
};

export type FetchOptions = {
  signal?: AbortSignal;
};

const CACHE_KEY = "sunriseAlarm.weatherCache.v1";
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

type CachedEntry = {
  key: string;
  fetchedAtMs: number;
  bundle: WeatherBundle;
  airQuality: number | null;
};

let memoryCache: CachedEntry | null = null;

function makeCacheKey(latitude: number, longitude: number) {
  // Keep key stable without over-precision.
  return `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
}

function isFresh(fetchedAtMs: number, ttlMs: number) {
  return Date.now() - fetchedAtMs < ttlMs;
}

async function readPersistentCache(): Promise<CachedEntry | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedEntry;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.key !== "string" || typeof parsed.fetchedAtMs !== "number") return null;
    if (!parsed.bundle || typeof parsed.bundle !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writePersistentCache(entry: CachedEntry) {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // best-effort cache
  }
}

export async function getCachedWeather(
  latitude: number,
  longitude: number,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<{
  bundle: WeatherBundle | null;
  airQuality: number | null;
  isFresh: boolean;
}> {
  const key = makeCacheKey(latitude, longitude);

  // 1) memory cache
  if (memoryCache?.key === key) {
    return {
      bundle: memoryCache.bundle,
      airQuality: memoryCache.airQuality,
      isFresh: isFresh(memoryCache.fetchedAtMs, ttlMs)
    };
  }

  // 2) persistent cache
  const persisted = await readPersistentCache();
  if (persisted?.key === key) {
    memoryCache = persisted;
    return {
      bundle: persisted.bundle,
      airQuality: persisted.airQuality,
      isFresh: isFresh(persisted.fetchedAtMs, ttlMs)
    };
  }

  return { bundle: null, airQuality: null, isFresh: false };
}

function floorToHourIso(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  d.setMinutes(0, 0, 0);

  // Return naive local YYYY-MM-DDTHH:00 (matches Open-Meteo hourly timestamps with timezone=auto)
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:00`;
}

function pickPrecipAtCurrentHour(data: any): number | null {
  const hourlyTimes: unknown = data?.hourly?.time;
  const hourlyPrecip: unknown = data?.hourly?.precipitation_probability;
  if (!Array.isArray(hourlyTimes) || !Array.isArray(hourlyPrecip) || !hourlyTimes.length) return null;

  const currentTime = data?.current_weather?.time;
  let idx = -1;

  if (typeof currentTime === "string") {
    idx = hourlyTimes.indexOf(currentTime);
    if (idx < 0) {
      const floored = floorToHourIso(currentTime);
      if (floored) idx = hourlyTimes.indexOf(floored);
    }
  }

  const selected = idx >= 0 ? idx : 0;
  const candidate = hourlyPrecip[selected];
  return typeof candidate === "number" ? candidate : null;
}

export async function fetchWeatherBundle(
  latitude: number,
  longitude: number,
  opts: FetchOptions = {}
): Promise<WeatherBundle> {
  // Combine current + daily + hourly in a single Open-Meteo call.
  // Reduce payload: limit hourly range to 24 hours.
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(latitude)}` +
    `&longitude=${encodeURIComponent(longitude)}` +
    `&current_weather=true` +
    `&daily=temperature_2m_max,temperature_2m_min` +
    `&hourly=precipitation_probability` +
    `&forecast_days=7&forecast_hours=24` +
    `&temperature_unit=fahrenheit&timezone=auto`;

  const res = await fetch(url, { signal: opts.signal });
  if (!res.ok) throw new Error(`Weather API failed (${res.status})`);

  const data = await res.json();

  // current
  const temperature = data?.current_weather?.temperature;
  if (typeof temperature !== "number") {
    throw new Error("Current temperature missing from API response");
  }

  const unit = data?.current_weather_units?.temperature ?? data?.current_units?.temperature_2m ?? null;
  const weatherCode = typeof data?.current_weather?.weathercode === "number" ? data.current_weather.weathercode : null;
  const isDay = typeof data?.current_weather?.is_day === "number" ? data.current_weather.is_day === 1 : null;
  const current: CurrentTemperature = { temperature, unit, weatherCode, isDay };

  // daily forecast
  const times: unknown = data?.daily?.time;
  const tempsMax: unknown = data?.daily?.temperature_2m_max;
  const tempsMin: unknown = data?.daily?.temperature_2m_min;
  if (!Array.isArray(times) || !Array.isArray(tempsMax) || !Array.isArray(tempsMin)) {
    throw new Error("Forecast missing from API response");
  }
  const dailyUnit = data?.daily_units?.temperature_2m_max ?? data?.daily_units?.temperature_2m_min ?? null;
  const forecast: DailyForecast[] = [];
  for (let i = 0; i < times.length && i < tempsMax.length && i < tempsMin.length; i += 1) {
    const date = times[i];
    const temperatureMax = tempsMax[i];
    const temperatureMin = tempsMin[i];
    if (typeof date !== "string" || typeof temperatureMax !== "number" || typeof temperatureMin !== "number")
      continue;
    forecast.push({ date, temperatureMax, temperatureMin, unit: dailyUnit });
  }

  // details (precip + wind)
  const windSpeed = typeof data?.current_weather?.windspeed === "number" ? data.current_weather.windspeed : null;
  const windUnit = data?.current_weather_units?.windspeed ?? data?.current_units?.windspeed ?? null;
  const precipitationProbability = pickPrecipAtCurrentHour(data);

  return {
    current,
    forecast,
    details: { precipitationProbability, windSpeed, windUnit },
    fetchedAtMs: Date.now()
  };
}

export async function fetchAirQualityIndex(
  latitude: number,
  longitude: number,
  opts: FetchOptions = {}
): Promise<number | null> {
  const url =
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${encodeURIComponent(latitude)}` +
    `&longitude=${encodeURIComponent(longitude)}` +
    `&current=us_aqi&timezone=auto`;

  const res = await fetch(url, { signal: opts.signal });
  if (!res.ok) throw new Error(`Air quality API failed (${res.status})`);

  const data = await res.json();
  const aqi = data?.current?.us_aqi;
  return typeof aqi === "number" ? aqi : null;
}

export async function updateWeatherCache(
  latitude: number,
  longitude: number,
  bundle: WeatherBundle,
  airQuality: number | null
) {
  const key = makeCacheKey(latitude, longitude);
  const entry: CachedEntry = { key, fetchedAtMs: Date.now(), bundle, airQuality };
  memoryCache = entry;
  await writePersistentCache(entry);
}
