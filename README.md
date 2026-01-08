# Sunrise Alarm

A minimalist **Expo / React Native** app that shows **tomorrow’s sunrise time** for your current (or chosen) location and lets you enable a **sunrise alarm** (implemented as a scheduled local notification). It also includes a lightweight **Weather** tab and a **Sun Details** tab.

---

## Features

### Sunrise Alarm tab (clock icon)
- **Location-aware sunrise**: fetches tomorrow’s **sunrise + sunset** for your coordinates.
- **Compass-style dial** that rotates with device heading and is referenced to the sunrise direction:
  - **0° is at East (E)** so the dial “points” toward sunrise.
  - **E is highlighted in red** to emphasize sunrise direction.
- **One-tap alarm toggle**:
  - ON → requests notification permission → schedules a local notification at tomorrow’s sunrise.
  - OFF → cancels the scheduled notification.
- **Persists settings** across launches (alarm state + chosen location).

### Weather tab (cloud icon)
- Current condition icon + **temperature** (tap temp to toggle **°F / °C**).
- **6-day forecast** (displayed as daily average temp).
- Quick stats: **precipitation probability**, **wind**, and **US AQI** (when available).

### Sun Details tab (sun icon)
- Tomorrow’s: **sunrise**, **sunset**, **golden hour**, **blue hour**.
- “Today’s Sun Path” tracker:
  - draws a simple arc path with a live “sun” dot
  - updates once per minute.

### Location controls
Tap the location pill to open a modal that lets you:
- Use **current device location**
- Enter a **city/address**
- Enter **coordinates** (`lat, lon`)
- Select from lightweight **suggestions** (best-effort)

### Dynamic theme
Background gradient switches between day/night palettes based on **today’s** sunrise/sunset (updates every minute).

---

## Tech Stack

- **Expo (managed)** `~54`
- **React Native** `0.81.x`
- **React** `19.x`
- **TypeScript**
- **expo-location** — location permission, GPS coords, reverse geocoding, and heading updates (`watchHeadingAsync`)
- **expo-notifications** — schedule/cancel local notifications (the “sunrise alarm”)
- **expo-linear-gradient** — full-screen gradient background
- **AsyncStorage** (`@react-native-async-storage/async-storage`) — persists settings + scheduled notification id
- **@expo/vector-icons (Ionicons)** — icons used throughout UI
- **Open-Meteo APIs** — sunrise/sunset, weather, and air quality

---

## User Flow

1) **App launch**
- Load saved settings from AsyncStorage (alarmEnabled + saved location).
- If no saved location exists:
  - request foreground location permission
  - get coordinates + reverse geocode a friendly label
  - fall back to a default location if permission is denied
- Fetch **today + tomorrow** sunrise/sunset.
- If alarm was enabled previously, re-schedule notification to ensure it matches the latest sunrise time.

2) **Sunrise Alarm tab**
- Display sunrise time at center of dial.
- Compass ring rotates using heading updates.
- Dial labels are referenced so **0° is East** and **E is highlighted**.
- Toggle alarm:
  - ON → request notification permission (if needed) → schedule at tomorrow’s sunrise
  - OFF → cancel scheduled notification

3) **Weather tab**
- On entry, fetch current temperature, forecast, details (precip/wind), and AQI in parallel.
- Tap temperature to toggle °F/°C.

4) **Sun Details tab**
- Show sunrise/sunset + golden/blue hour.
- Update the sun path indicator periodically (once per minute).

5) **Change location**
- Tap location pill → choose current or enter custom location.
- Refresh sun times.
- If alarm is enabled, re-schedule for the new location.

---

## APIs Used

All data is sourced from **Open-Meteo**.

### Sunrise / Sunset (daily)
```txt
https://api.open-meteo.com/v1/forecast?latitude=<LAT>&longitude=<LON>&daily=sunrise,sunset&timezone=auto
```
