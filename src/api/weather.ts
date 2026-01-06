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

export async function fetchCurrentTemperature(latitude: number, longitude: number): Promise<CurrentTemperature> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(latitude)}` +
    `&longitude=${encodeURIComponent(longitude)}` +
    `&current_weather=true&temperature_unit=fahrenheit&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather API failed (${res.status})`);

  const data = await res.json();
  const temperature = data?.current_weather?.temperature;
  if (typeof temperature !== "number") {
    throw new Error("Current temperature missing from API response");
  }

  const unit = data?.current_weather_units?.temperature ?? data?.current_units?.temperature_2m ?? null;
  const weatherCode = typeof data?.current_weather?.weathercode === "number" ? data.current_weather.weathercode : null;
  const isDay = typeof data?.current_weather?.is_day === "number" ? data.current_weather.is_day === 1 : null;
  return { temperature, unit, weatherCode, isDay };
}

export async function fetchWeeklyForecast(latitude: number, longitude: number): Promise<DailyForecast[]> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(latitude)}` +
    `&longitude=${encodeURIComponent(longitude)}` +
    `&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=auto&forecast_days=7`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather API failed (${res.status})`);

  const data = await res.json();
  const times: unknown = data?.daily?.time;
  const tempsMax: unknown = data?.daily?.temperature_2m_max;
  const tempsMin: unknown = data?.daily?.temperature_2m_min;
  if (!Array.isArray(times) || !Array.isArray(tempsMax) || !Array.isArray(tempsMin)) {
    throw new Error("Forecast missing from API response");
  }

  const unit = data?.daily_units?.temperature_2m_max ?? data?.daily_units?.temperature_2m_min ?? null;

  const days: DailyForecast[] = [];
  for (let i = 0; i < times.length && i < tempsMax.length && i < tempsMin.length; i += 1) {
    const date = times[i];
    const temperatureMax = tempsMax[i];
    const temperatureMin = tempsMin[i];
    if (
      typeof date !== "string" ||
      typeof temperatureMax !== "number" ||
      typeof temperatureMin !== "number"
    )
      continue;
    days.push({ date, temperatureMax, temperatureMin, unit });
  }

  return days;
}

export async function fetchWeatherDetails(latitude: number, longitude: number): Promise<WeatherDetails> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(latitude)}` +
    `&longitude=${encodeURIComponent(longitude)}` +
    `&current_weather=true&hourly=precipitation_probability&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather API failed (${res.status})`);

  const data = await res.json();
  const windSpeed = typeof data?.current_weather?.windspeed === "number" ? data.current_weather.windspeed : null;
  const windUnit = data?.current_weather_units?.windspeed ?? data?.current_units?.windspeed ?? null;

  const hourlyTimes: unknown = data?.hourly?.time;
  const hourlyPrecip: unknown = data?.hourly?.precipitation_probability;
  let precipitationProbability: number | null = null;

  if (Array.isArray(hourlyTimes) && Array.isArray(hourlyPrecip) && hourlyTimes.length) {
    const currentTime = data?.current_weather?.time;
    let index = -1;
    if (typeof currentTime === "string") {
      index = hourlyTimes.indexOf(currentTime);
    }
    const selectedIndex = index >= 0 ? index : 0;
    const candidate = hourlyPrecip[selectedIndex];
    if (typeof candidate === "number") {
      precipitationProbability = candidate;
    }
  }

  return { precipitationProbability, windSpeed, windUnit, airQuality: null };
}

export async function fetchAirQualityIndex(latitude: number, longitude: number): Promise<number | null> {
  const url =
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${encodeURIComponent(latitude)}` +
    `&longitude=${encodeURIComponent(longitude)}` +
    `&current=us_aqi&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Air quality API failed (${res.status})`);

  const data = await res.json();
  const aqi = data?.current?.us_aqi;
  return typeof aqi === "number" ? aqi : null;
}
