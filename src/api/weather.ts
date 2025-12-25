export type CurrentTemperature = {
  temperature: number;
  unit: string | null;
};

export async function fetchCurrentTemperature(latitude: number, longitude: number): Promise<CurrentTemperature> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(latitude)}` +
    `&longitude=${encodeURIComponent(longitude)}` +
    `&current_weather=true&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather API failed (${res.status})`);

  const data = await res.json();
  const temperature = data?.current_weather?.temperature;
  if (typeof temperature !== "number") {
    throw new Error("Current temperature missing from API response");
  }

  const unit = data?.current_weather_units?.temperature ?? data?.current_units?.temperature_2m ?? null;
  return { temperature, unit };
}
