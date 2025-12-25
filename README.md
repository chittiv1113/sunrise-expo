# Sunrise Alarm (Expo)

A minimalist mobile app that automatically detects your location, fetches **tomorrow’s sunrise time**, and lets you toggle a **sunrise alarm** (implemented as a scheduled local notification). The UI is based on the Figma concept: a clean single-screen experience with a location pill, sunrise time, and a simple on/off toggle.

---

## What the app does

- **Gets your location** (foreground permission)
- **Fetches tomorrow’s sunrise time** for your coordinates
- **Displays sunrise time** in a simple, readable layout
- **Schedules a local notification** at sunrise when the alarm is enabled
- **Persists alarm state** so your preference survives app restarts

> v1 uses notifications as the “alarm” because true system alarms (that bypass silent/focus reliably) require deeper native integration.

---

## Tech Stack

- **Expo (Managed Workflow)**
- **React Native**
- **TypeScript**
- **expo-location** — location permission + GPS coordinates + reverse geocoding
- **expo-notifications** — schedule/cancel local notifications (“sunrise alarm”)
- **AsyncStorage** (`@react-native-async-storage/async-storage`) — persist alarm state + scheduled notification id
- **@expo/vector-icons** — icons for the Figma-like UI
- **Open-Meteo API** — sunrise times

---

## High-level flow

1. **On app launch**
   - Load saved settings from AsyncStorage (`alarmEnabled`, last location, scheduled notification id).
   - Request location (if permission is granted).
   - Fetch tomorrow’s sunrise time via Open-Meteo.
   - Display: location label + “Sunrise Tomorrow” time.

2. **When user toggles alarm ON**
   - Request notification permission (if not already granted).
   - Schedule a local notification at tomorrow’s sunrise time.
   - Save `alarmEnabled=true` and the scheduled notification id.

3. **When user toggles alarm OFF**
   - Cancel the scheduled notification using stored id.
   - Save `alarmEnabled=false` and clear the notification id.

4. **When location changes / refresh happens**
   - Re-fetch sunrise time.
   - If alarm is enabled, re-schedule so the alarm matches the correct sunrise time.

---

## API used (Sunrise)

Open-Meteo endpoint:

---

## Setup & Run (Windows + iPhone with Expo Go)

### Prerequisites
- Node.js (LTS recommended)
- Expo Go installed on your iPhone
- Same Wi-Fi network for PC + phone (best experience)

### Install dependencies
```bash
npm install

**Roadmap (nice-to-have)**

“Tomorrow” vs “Next sunrise” logic (handle late night edge cases)

Manual location override (search city)

Alarm sound customization (within notification limits)

Widgets / complications (future)

EAS build for background tasks/native modules if needed

