import React, { useMemo, useState } from "react";
import { SafeAreaView, StyleSheet, Text, View, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

export type OnboardingProps = {
  /** Called when user completes onboarding (Get Started). */
  onDone: () => void | Promise<void>;

  /**
   * Hook into real permission prompts.
   * Return true if enabled/succeeded, false if user denied.
   */
  requestNotifications?: () => boolean | Promise<boolean>;
  requestLocation?: () => boolean | Promise<boolean>;
};

const TOTAL_PAGES = 3;

const ORANGE = "#F97316";
const ORANGE_HOVER = "#EA580C";
const ORANGE_100 = "#FFEDD5";
const ORANGE_200 = "#FED7AA";
const ORANGE_600 = "#EA580C";
const GRAY_300 = "#D1D5DB";
const GRAY_400 = "#9CA3AF";
const GRAY_600 = "#4B5563";
const GRAY_700 = "#374151";

function PillDot({ active, onPress }: { active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Onboarding page"
      style={({ pressed }) => [
        active ? styles.dotActive : styles.dotInactive,
        !active && pressed ? { backgroundColor: "#FDBA74" } : null
      ]}
    />
  );
}

function PrimaryButton({
  title,
  onPress,
  disabled
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!!disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.primaryButton,
        disabled ? styles.primaryButtonDisabled : null,
        !disabled && pressed ? { backgroundColor: ORANGE_HOVER } : null
      ]}
    >
      <Text style={[styles.primaryButtonText, disabled ? { color: GRAY_400 } : null]}>{title}</Text>
    </Pressable>
  );
}

function SetupButton({
  enabled,
  icon,
  title,
  onPress
}: {
  enabled: boolean;
  icon: React.ReactNode;
  title: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.setupButton,
        enabled ? styles.setupButtonEnabled : styles.setupButtonDisabled,
        !enabled && pressed ? { borderColor: ORANGE } : null
      ]}
    >
      <View style={styles.setupButtonInner}>
        {icon}
        <Text style={[styles.setupButtonText, enabled ? styles.setupButtonTextEnabled : null]}>{title}</Text>
      </View>
    </Pressable>
  );
}

export default function Onboarding({ onDone, requestNotifications, requestLocation }: OnboardingProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [locationEnabled, setLocationEnabled] = useState(false);

  const isSetupComplete = notificationsEnabled || locationEnabled;

  const gradientColors = useMemo(() => {
    if (currentPage === 0) return ["#FB923C", "#F472B6"] as const; // orange -> pink
    if (currentPage === 1) return ["#FBBF24", "#FB923C"] as const; // amber -> orange
    return ["#FACC15", "#FB923C"] as const; // yellow -> orange
  }, [currentPage]);

  const goNext = () => {
    if (currentPage < TOTAL_PAGES - 1) setCurrentPage((p) => p + 1);
  };

  const goSkip = () => {
    setCurrentPage(TOTAL_PAGES - 1);
  };

  const handleEnableNotifications = async () => {
    try {
      const ok = requestNotifications ? await requestNotifications() : true;
      setNotificationsEnabled(!!ok);
    } catch {
      setNotificationsEnabled(false);
    }
  };

  const handleSetLocation = async () => {
    try {
      const ok = requestLocation ? await requestLocation() : true;
      // keep MVP forgiving (like your web demo): allow proceed even if location fails
      setLocationEnabled(ok === false ? false : true);
    } catch {
      setLocationEnabled(true);
    }
  };

  const handleGetStarted = async () => {
    if (!isSetupComplete) return;
    await onDone();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.outer}>
        <View style={styles.container}>
          {/* Skip button (pages 1-2 only) */}
          {currentPage < 2 ? (
            <Pressable
              onPress={goSkip}
              accessibilityRole="button"
              accessibilityLabel="Skip onboarding"
              style={({ pressed }) => [
                styles.skipButton,
                pressed ? { backgroundColor: "rgba(255,255,255,1)" } : null
              ]}
            >
              <Ionicons name="close" size={20} color={GRAY_600} />
            </Pressable>
          ) : null}

          {/* Page 1 */}
          {currentPage === 0 ? (
            <View style={styles.page}>
              <LinearGradient colors={gradientColors} style={styles.illustration}>
                <Ionicons name="sunny-outline" size={128} color="#FFFFFF" />
              </LinearGradient>

              <View style={styles.content}>
                <View style={styles.contentTop}>
                  <Text style={styles.title}>Congratulations!</Text>
                  <Text style={styles.body}>
                    Welcome to Sunrise. A simple way to align your mornings with daylight.
                  </Text>
                </View>

                <View style={styles.dotsRow}>
                  {Array.from({ length: TOTAL_PAGES }).map((_, idx) => (
                    <PillDot key={idx} active={idx === currentPage} onPress={() => setCurrentPage(idx)} />
                  ))}
                </View>

                <PrimaryButton title="Next" onPress={goNext} />
              </View>
            </View>
          ) : null}

          {/* Page 2 */}
          {currentPage === 1 ? (
            <View style={styles.page}>
              <LinearGradient colors={gradientColors} style={styles.illustration}>
                <Ionicons name="sunny-outline" size={128} color="#FFFFFF" />
              </LinearGradient>

              <View style={styles.content}>
                <View style={styles.contentTop}>
                  <Text style={styles.title}>Your sunrise routine, simplified</Text>

                  <View style={styles.featureList}>
                    <View style={styles.featureRow}>
                      <View style={styles.featureIconBubble}>
                        <Ionicons name="notifications-outline" size={20} color={ORANGE_600} />
                      </View>
                      <Text style={styles.featureText}>Daily sunrise alert for your location</Text>
                    </View>

                    <View style={styles.featureRow}>
                      <View style={styles.featureIconBubble}>
                        <Ionicons name="thermometer-outline" size={20} color={ORANGE_600} />
                      </View>
                      <Text style={styles.featureText}>Temperature + weekly forecast at a glance</Text>
                    </View>

                    <View style={styles.featureRow}>
                      <View style={styles.featureIconBubble}>
                        <Ionicons name="notifications-off-outline" size={20} color={ORANGE_600} />
                      </View>
                      <Text style={styles.featureText}>Snooze/Stop controls</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.dotsRow}>
                  {Array.from({ length: TOTAL_PAGES }).map((_, idx) => (
                    <PillDot key={idx} active={idx === currentPage} onPress={() => setCurrentPage(idx)} />
                  ))}
                </View>

                <PrimaryButton title="Next" onPress={goNext} />
              </View>
            </View>
          ) : null}

          {/* Page 3 */}
          {currentPage === 2 ? (
            <View style={styles.page}>
              <LinearGradient colors={gradientColors} style={styles.illustration}>
                <View style={styles.page3IconWrap}>
                  <Ionicons name="sunny-outline" size={128} color="#FFFFFF" />
                  <View style={styles.page3Glow} />
                </View>
              </LinearGradient>

              <View style={styles.content}>
                <View style={styles.contentTop}>
                  <Text style={styles.title}>Wake with the sun</Text>
                  <Text style={styles.body}>
                    Morning light helps anchor your daily rhythm. Sunrise helps you start your day with it.
                  </Text>

                  <View style={styles.setupList}>
                    <SetupButton
                      enabled={notificationsEnabled}
                      icon={
                        <Ionicons
                          name="notifications-outline"
                          size={20}
                          color={notificationsEnabled ? ORANGE_600 : GRAY_700}
                        />
                      }
                      title={notificationsEnabled ? "Notifications Enabled ✓" : "Enable Notifications"}
                      onPress={handleEnableNotifications}
                    />

                    <SetupButton
                      enabled={locationEnabled}
                      icon={
                        <Ionicons
                          name="location-outline"
                          size={20}
                          color={locationEnabled ? ORANGE_600 : GRAY_700}
                        />
                      }
                      title={locationEnabled ? "Location Set ✓" : "Set Location"}
                      onPress={handleSetLocation}
                    />
                  </View>
                </View>

                <View style={styles.primaryCtaBlock}>
                  <PrimaryButton title="Get Started" onPress={handleGetStarted} disabled={!isSetupComplete} />
                  <Text style={styles.helperText}>
                    {!isSetupComplete ? "Complete at least one setup step to continue" : ""}
                  </Text>
                </View>
              </View>
            </View>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFFFFF" },
  outer: { flex: 1, alignItems: "center", justifyContent: "center" },

  // matches web max-w-md feel (centers on iPad)
  container: { flex: 1, width: "100%", maxWidth: 420, position: "relative" },
  page: { flex: 1 },

  skipButton: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3
  },

  illustration: { flex: 1, alignItems: "center", justifyContent: "center" },

  content: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 32,
    paddingTop: 32,
    paddingBottom: 48
  },

  contentTop: { minHeight: 180 },

  title: { fontSize: 30, fontWeight: "600", marginBottom: 16, color: "#111827" },
  body: { fontSize: 18, lineHeight: 26, color: "#6B7280" },

  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 24
  },

  dotActive: { width: 32, height: 8, borderRadius: 999, backgroundColor: ORANGE },
  dotInactive: { width: 8, height: 8, borderRadius: 999, backgroundColor: ORANGE_200 },

  primaryButton: {
    width: "100%",
    backgroundColor: ORANGE,
    paddingVertical: 16,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center"
  },
  primaryButtonDisabled: { backgroundColor: "#E5E7EB" },
  primaryButtonText: { fontSize: 18, fontWeight: "600", color: "#FFFFFF" },

  featureList: { marginTop: 6, gap: 22 },
  featureRow: { flexDirection: "row", alignItems: "flex-start", gap: 16 },
  featureIconBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: ORANGE_100,
    alignItems: "center",
    justifyContent: "center"
  },
  featureText: {
    flex: 1,
    fontSize: 18,
    lineHeight: 26,
    color: "#6B7280",
    paddingTop: 4
  },

  page3IconWrap: { position: "relative", alignItems: "center", justifyContent: "center" },
  page3Glow: {
    position: "absolute",
    right: -8,
    bottom: -8,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.25)"
  },

  setupList: { marginTop: 24, gap: 12 },

  setupButton: { width: "100%", paddingVertical: 16, borderRadius: 999, borderWidth: 2 },
  setupButtonInner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },

  setupButtonEnabled: { backgroundColor: ORANGE_100, borderColor: ORANGE },
  setupButtonDisabled: { backgroundColor: "#FFFFFF", borderColor: GRAY_300 },

  setupButtonText: { fontSize: 18, fontWeight: "600", color: GRAY_700 },
  setupButtonTextEnabled: { color: "#C2410C" },

  primaryCtaBlock: { marginTop: 14 },

  helperText: {
    textAlign: "center",
    fontSize: 12,
    color: GRAY_400,
    marginTop: 12,
    minHeight: 16
  }
});
