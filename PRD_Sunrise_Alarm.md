# Sunrise Alarm App — PRD

## Project Overview
Build a minimalist mobile app that:
1) Gets the user’s current location,  
2) Fetches the next sunrise time for that location, and  
3) Schedules a local “alarm” (notification) at sunrise.

The UI should match the provided Figma template: a clean single screen with location at the top, a large sunrise time display, an enable/disable toggle, and a simple bottom icon row.

## Level
Easy → Medium (location permissions + scheduling local notifications)

## Type of Project
Mobile App, Utilities, Location-based scheduling

## Skills Required
- React Native + Expo (TypeScript)
- Location permissions and reverse geocoding (expo-location)
- Local notifications scheduling (expo-notifications)
- Simple API integration (Open-Meteo sunrise endpoint)
- Basic UI layout & styling

## Target Platforms
- iOS (primary, tested via Expo Go and EAS Dev Client if needed)
- Android (secondary)

## Problem Statement
Users want a frictionless way to wake up at sunrise without manually looking up sunrise times or setting alarms every day.

## Goals
- Automatically detect location (with user consent).
- Display “Sunrise Tomorrow” time in large type.
- One-tap toggle to enable/disable sunrise alarm.
- When enabled: schedule a local notification at tomorrow’s sunrise.
- Persist toggle state and last-known location.

## Non‑Goals (v1)
- Full-featured alarm audio that bypasses Silent/Focus modes.
- Background continuous tracking.
- Weather forecasts and sunrise visualizations.
- Multiple alarms, smart wake window, or reminders.

## User Stories
1. As a user, I can allow location access so the app can find my sunrise time.
2. As a user, I can see tomorrow’s sunrise time clearly.
3. As a user, I can enable a sunrise alarm with one toggle.
4. As a user, I can disable the alarm and it cancels any scheduled notifications.
5. As a user, my preference persists if I close/reopen the app.

## Functional Requirements
### Location
- Request foreground location permission on first run.
- On success: fetch GPS coordinates and reverse geocode a display label (city/region).
- On denial/failure: show a fallback label (“Location Off”) and use a default lat/lon (San Francisco) until user grants permission.

### Sunrise time retrieval
- Use Open-Meteo:
  - `GET https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&daily=sunrise&timezone=auto`
- Read `daily.sunrise[1]` as “tomorrow sunrise” (ISO string) and parse to Date.

### Alarm scheduling
- Use expo-notifications local scheduling:
  - Request notification permission when the user enables the alarm.
  - Schedule a notification at tomorrow’s sunrise time.
  - Store the scheduled notification id in local storage.
  - On disable: cancel the scheduled notification id and clear storage.
- Re-schedule whenever location changes or app starts and alarm is enabled (to keep sunrise time updated).

### Persistence
- Store:
  - `alarmEnabled` boolean
  - `scheduledNotificationId` string (if any)
  - last known `{lat, lon, label}`

## UX / UI Requirements (from Figma intent)
Single screen:
- White background.
- Top: status-safe area, then a “location pill” with a pin icon + city name.
- Center: “Sunrise Tomorrow” label with a sunrise icon.
- Large time display: `h:mm` and `AM/PM` next to it.
- Toggle below: orange when enabled, gray when disabled.
- Bottom: 3 icon buttons (placeholders for future sections).

Accessibility:
- Dynamic text support (avoid fixed pixel-perfect constraints).
- Buttons have labels (accessibilityLabel).

## Technical Design
### Architecture
- `App.tsx` is the single screen (v1).
- `src/api/sunrise.ts` fetches sunrise from Open-Meteo.
- `src/services/alarm.ts` schedules/cancels notifications.
- `src/services/storage.ts` persists settings via AsyncStorage.

### Libraries
- `expo-location`
- `expo-notifications`
- `@react-native-async-storage/async-storage`
- `@expo/vector-icons`

## Milestones
1. UI skeleton matching Figma (static time)  
2. Location permission + reverse geocode  
3. Sunrise API integration  
4. Toggle scheduling + persistence  
5. QA: permission denied, airplane mode, timezones

## Acceptance Criteria
- On first open, the app asks for location permission (or shows fallback if denied).
- The screen displays a valid “Sunrise Tomorrow” time for the current (or default) location.
- Enabling toggle schedules exactly one notification at tomorrow’s sunrise and persists across app restarts.
- Disabling toggle cancels the scheduled notification.
