import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

/**
 * MVP "alarm-like" notifications
 * - Still a local notification (NOT a true iOS system alarm)
 * - Adds actions (Stop / Snooze), stronger Android channel settings, and iOS time-sensitive hints.
 */

// Storage now supports multiple IDs (sunrise + snoozes, etc.)
const STORAGE_KEY_IDS = "sunriseAlarm.notificationIds";

// Legacy (single-id) storage key used in earlier versions. Keep for migration.
const STORAGE_KEY_LEGACY = "sunriseAlarm.notificationId";

// Bump the channel id so Android creates a fresh channel with our newer settings.
// (Android can't change some channel behaviors after the channel is created.)
export const ANDROID_CHANNEL_ID = "sunrise_alarm";
export const ALARM_CATEGORY_ID = "SUNRISE_ALARM";
export const ALARM_ACTION_STOP = "STOP_ALARM";
export const ALARM_ACTION_SNOOZE_10 = "SNOOZE_10";

const ALARM_DATA_KIND = "sunrise_alarm";

// Basic notification behavior (foreground handling)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true
  })
});

function safeParseIdArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) return parsed;
    return [];
  } catch {
    return [];
  }
}

async function getStoredIds(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY_IDS);
  return safeParseIdArray(raw);
}

async function setStoredIds(ids: string[]): Promise<void> {
  const uniq = Array.from(new Set(ids)).filter(Boolean);
  await AsyncStorage.setItem(STORAGE_KEY_IDS, JSON.stringify(uniq));
}

async function addStoredId(id: string): Promise<void> {
  const ids = await getStoredIds();
  ids.push(id);
  await setStoredIds(ids);
}

async function clearStoredIds(): Promise<string[]> {
  const ids = await getStoredIds();
  const legacy = await AsyncStorage.getItem(STORAGE_KEY_LEGACY);

  await AsyncStorage.removeItem(STORAGE_KEY_IDS);
  await AsyncStorage.removeItem(STORAGE_KEY_LEGACY);

  const all = legacy ? [...ids, legacy] : ids;
  return Array.from(new Set(all)).filter(Boolean);
}

async function ensureAndroidChannel() {
  if (Platform.OS !== "android") return;

  // Android: channel settings control sound/vibration/importance for *all* notifications in the channel.
  // Users can still override this in Settings.
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: "Sunrise Alarm",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
    vibrationPattern: [0, 800, 250, 800, 250, 800]
  });
}

async function ensureAlarmCategory() {
  // Both iOS + Android support interactive categories
  await Notifications.setNotificationCategoryAsync(ALARM_CATEGORY_ID, [
    {
      identifier: ALARM_ACTION_SNOOZE_10,
      buttonTitle: "Snooze 10m",
      options: { opensAppToForeground: false }
    },
    {
      identifier: ALARM_ACTION_STOP,
      buttonTitle: "Stop",
      options: { opensAppToForeground: false, isDestructive: true }
    }
  ]);
}

export async function initAlarmNotifications() {
  await Promise.all([ensureAndroidChannel(), ensureAlarmCategory()]);
}

export async function ensureNotificationPermissions() {
  const settings = await Notifications.getPermissionsAsync();
  if (settings.status === "granted") return;

  const req = await Notifications.requestPermissionsAsync();
  if (req.status !== "granted") {
    throw new Error("Notifications permission is required to enable the sunrise alarm.");
  }
}

function buildAlarmContent(body: string): Notifications.NotificationContentInput {
  const base: Notifications.NotificationContentInput = {
    title: "Sunrise Alarm",
    body,
    sound: "default",
    categoryIdentifier: ALARM_CATEGORY_ID,
    data: { kind: ALARM_DATA_KIND }
  };

  if (Platform.OS === "android") {
    return {
      ...base,
      channelId: ANDROID_CHANNEL_ID,
      priority: Notifications.AndroidNotificationPriority.MAX,
      sticky: true
    } as Notifications.NotificationContentInput;
  }

  // iOS: "timeSensitive" raises prominence, but the user can still disable it.
  // (Critical alerts require a special Apple entitlement and are out of scope.)
  return {
    ...base,
    interruptionLevel: "timeSensitive"
  } as Notifications.NotificationContentInput;
}

export async function scheduleSunriseAlarm(when: Date) {
  // Avoid duplicates: always cancel whatever we previously scheduled.
  await cancelSunriseAlarm();
  await initAlarmNotifications();

  const id = await Notifications.scheduleNotificationAsync({
    content: buildAlarmContent("Good morning — the sun is up ☀️"),
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: when
    }
  });

  await addStoredId(id);
  return id;
}

export async function scheduleSnooze(minutes: number) {
  await initAlarmNotifications();

  const seconds = Math.max(1, Math.round(minutes * 60));
  const id = await Notifications.scheduleNotificationAsync({
    content: buildAlarmContent(`Snoozed — ringing again in ${minutes} min ⏰`),
    trigger: { seconds }
  });

  await addStoredId(id);
  return id;
}

export async function cancelSunriseAlarm() {
  const ids = await clearStoredIds();
  if (!ids.length) return;

  // Cancel scheduled + dismiss delivered (best-effort).
  await Promise.all(
    ids.map(async (id) => {
      await Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined);
      await Notifications.dismissNotificationAsync(id).catch(() => undefined);
    })
  );
}

/**
 * Registers handlers for notification actions.
 *
 * NOTE: In Expo, action handling is JS-driven. This is "good enough" for MVP,
 * but it is not equivalent to a true system alarm service.
 */
export function registerAlarmActionListener(handlers: {
  onStop?: () => void | Promise<void>;
  onSnooze?: (minutes: number) => void | Promise<void>;
}): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener(async (response) => {
    const action = response.actionIdentifier;
    const content = response.notification.request.content;
    const data = (content.data ?? {}) as any;

    // Only handle our alarm notifications.
    if (data?.kind !== ALARM_DATA_KIND && content.categoryIdentifier !== ALARM_CATEGORY_ID) return;

    // Try to remove the notification the user acted on.
    await Notifications.dismissNotificationAsync(response.notification.request.identifier).catch(() => undefined);

    if (action === ALARM_ACTION_STOP) {
      await cancelSunriseAlarm();
      await Promise.resolve(handlers.onStop?.()).catch(() => undefined);
      return;
    }

    if (action === ALARM_ACTION_SNOOZE_10) {
      await scheduleSnooze(10);
      await Promise.resolve(handlers.onSnooze?.(10)).catch(() => undefined);
    }
  });

  return () => sub.remove();
}
