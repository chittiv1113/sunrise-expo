export type SunTimes = {
  sunrise: Date;
  sunset: Date;
};

export type SunTimesBundle = {
  today: SunTimes;
  tomorrow: SunTimes;
};

export async function fetchSunTimes(latitude: number, longitude: number): Promise<SunTimesBundle> {
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

  // Index 0 = today, index 1 = tomorrow
  const sunriseTodayIso = sunriseList[0];
  const sunsetTodayIso = sunsetList[0];
  const sunriseTomorrowIso = sunriseList[1];
  const sunsetTomorrowIso = sunsetList[1];

  const today: SunTimes = {
    sunrise: new Date(sunriseTodayIso),
    sunset: new Date(sunsetTodayIso)
  };
  const tomorrow: SunTimes = {
    sunrise: new Date(sunriseTomorrowIso),
    sunset: new Date(sunsetTomorrowIso)
  };

  if (
    Number.isNaN(today.sunrise.getTime()) ||
    Number.isNaN(today.sunset.getTime()) ||
    Number.isNaN(tomorrow.sunrise.getTime()) ||
    Number.isNaN(tomorrow.sunset.getTime())
  ) {
    throw new Error("Failed to parse sunrise/sunset time");
  }

  return { today, tomorrow };
}

export async function fetchTomorrowSunTimes(latitude: number, longitude: number): Promise<SunTimes> {
  const { tomorrow } = await fetchSunTimes(latitude, longitude);
  return tomorrow;
}

export async function fetchTomorrowSunrise(latitude: number, longitude: number): Promise<Date> {
  const { sunrise } = await fetchTomorrowSunTimes(latitude, longitude);
  return sunrise;
}
