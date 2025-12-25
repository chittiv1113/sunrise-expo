import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "sunriseAlarm.settings";

export type SavedLocation = {
  latitude: number;
  longitude: number;
  label: string;
};

export type Settings = {
  alarmEnabled: boolean;
  location: SavedLocation;
};

export async function saveSettings(settings: Settings) {
  await AsyncStorage.setItem(KEY, JSON.stringify(settings));
}

export async function loadSettings(): Promise<Settings | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Settings;
  } catch {
    return null;
  }
}
