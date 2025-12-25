export type SunTimes = {
  sunrise: Date;
  sunset: Date;
};

export async function fetchTomorrowSunTimes(latitude: number, longitude: number): Promise<SunTimes> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(latitude)}` +
    `&longitude=${encodeURIComponent(longitude)}` +
    `&daily=sunrise,sunset&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sunrise API failed (${res.status})`);

  const data = await res.json();
  const sunriseList: string[] | undefined = data?.daily?.sunrise;
  const sunsetList: string[] | undefined = data?.daily?.sunset;

  if (!sunriseList || sunriseList.length < 2 || !sunsetList || sunsetList.length < 2) {
    throw new Error("Sunrise/sunset data missing from API response");
  }

  // Index 1 = tomorrow (index 0 is today)
  const sunriseIso = sunriseList[1];
  const sunsetIso = sunsetList[1];
  const sunrise = new Date(sunriseIso);
  const sunset = new Date(sunsetIso);

  if (Number.isNaN(sunrise.getTime()) || Number.isNaN(sunset.getTime())) {
    throw new Error("Failed to parse sunrise/sunset time");
  }

  return { sunrise, sunset };
}

export async function fetchTomorrowSunrise(latitude: number, longitude: number): Promise<Date> {
  const { sunrise } = await fetchTomorrowSunTimes(latitude, longitude);
  return sunrise;
}
