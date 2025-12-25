import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "sunriseAlarm.notificationId";

// Basic notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false
  })
});

async function ensureAndroidChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("sunrise", {
    name: "Sunrise",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default"
  });
}


export async function ensureNotificationPermissions() {
  const settings = await Notifications.getPermissionsAsync();
  if (settings.status === "granted") return;

  const req = await Notifications.requestPermissionsAsync();
  if (req.status !== "granted") {
    throw new Error("Notifications permission is required to enable the sunrise alarm.");
  }
}

export async function scheduleSunriseAlarm(when: Date) {
  // Cancel any existing one first
  await cancelSunriseAlarm();
  await ensureAndroidChannel();

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: "Sunrise Alarm",
      body: "Good morning — the sun is up ☀️",
      sound: "default"
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: when
    }
  });

  await AsyncStorage.setItem(STORAGE_KEY, id);
  return id;
}

export async function cancelSunriseAlarm() {
  const existing = await AsyncStorage.getItem(STORAGE_KEY);
  if (existing) {
    try {
      await Notifications.cancelScheduledNotificationAsync(existing);
    } finally {
      await AsyncStorage.removeItem(STORAGE_KEY);
    }
  }
}
