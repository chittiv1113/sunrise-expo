import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "sunriseAlarm.hasOnboarded";

export async function loadHasOnboarded(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw === "true";
}

export async function saveHasOnboarded(value: boolean) {
  await AsyncStorage.setItem(KEY, value ? "true" : "false");
}
