import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import Animated, { FadeInDown, FadeInRight } from "react-native-reanimated";
import { kycApi } from "../../services/api/kycApi";
import { servicesApi } from "../../services/api/servicesApi";
import { bookingsApi } from "../../services/api/bookingsApi";
import { getAuth } from "../../auth/auth";
import {
  PRIMARY,
  PROVIDER_BACKGROUND,
  CARD,
  TEXT,
  TEXT_MUTED,
  BORDER,
} from "../../theme/colors";

export default function ProviderHomeScreen() {
  const router = useRouter();

  const [kycStatus, setKycStatus] = useState("pending");
  const [verified, setVerified] = useState(false);
  const [serviceCount, setServiceCount] = useState(0);
  const [bookingCount, setBookingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const auth = await getAuth();

      const [profile, services, bookings] = await Promise.all([
        kycApi
          .getProfile()
          .catch(() => ({
            kyc_status: "pending",
            is_verified: false,
          })),

        servicesApi.listMine().catch(() => []),

        bookingsApi.listBookings().catch(() => []),
      ]);

      setKycStatus(profile.kyc_status || "pending");
      setVerified(!!profile.is_verified);

      setServiceCount(services.length);

      const active = bookings.filter(
        (b) => b.status !== "cancelled"
      );

      setBookingCount(active.length);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = () => {
    setRefreshing(true);
    load();
  };

  const handleKyc = () => {
    router.push("/provider-kyc");
  };

  const getKycButtonText = () => {
    if (verified || kycStatus === "approved") {
      return "KYC Approved ✓";
    }

    if (kycStatus === "submitted") {
      return "View / Update KYC";
    }

    if (kycStatus === "rejected") {
      return "Resubmit KYC";
    }

    return "Submit KYC";
  };

  const isKycApproved =
    verified || kycStatus === "approved";

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={PRIMARY}
          />
        }
      >
        {/* Header */}
        <Animated.View entering={FadeInDown.duration(450)}>
          <Text style={styles.step}>
            Provider dashboard
          </Text>

          <Text style={styles.title}>
            Welcome back{verified ? " ✓" : ""}
          </Text>

          <View style={styles.kycBadge}>
            <Text style={styles.kycText}>
              KYC: {kycStatus}
              {kycStatus === "submitted"
                ? " · awaiting approval"
                : ""}
            </Text>
          </View>
        </Animated.View>

        {/* Stats */}
        {loading ? (
          <ActivityIndicator
            color={PRIMARY}
            style={{ marginTop: 32 }}
          />
        ) : (
          <Animated.View
            entering={FadeInRight.delay(120).duration(400)}
            style={styles.statsRow}
          >
            {[
              {
                label: String(serviceCount),
                sub: "Active services",
              },
              {
                label: String(bookingCount),
                sub: "Bookings",
              },
            ].map((stat, i) => (
              <View
                key={stat.sub}
                style={[
                  styles.statCard,
                  i === 0 && styles.statGap,
                ]}
              >
                <Text style={styles.statValue}>
                  {stat.label}
                </Text>

                <Text style={styles.statLabel}>
                  {stat.sub}
                </Text>
              </View>
            ))}
          </Animated.View>
        )}

        {/* Dashboard Actions */}
        <Animated.View
          entering={FadeInDown.delay(200).duration(400)}
        >
          {/* KYC */}
          <TouchableOpacity
            style={[
              styles.kycBtn,
              isKycApproved && styles.kycApprovedBtn,
            ]}
            onPress={handleKyc}
            disabled={isKycApproved}
          >
            <Text
              style={[
                styles.kycBtnText,
                isKycApproved && styles.kycApprovedText,
              ]}
            >
              {getKycButtonText()}
            </Text>
          </TouchableOpacity>

          {/* Calendar */}
          <TouchableOpacity
            style={styles.outlineBtn}
            onPress={() =>
              router.push("/provider-availability")
            }
          >
            <Text style={styles.outlineText}>
              Manage calendar & availability
            </Text>
          </TouchableOpacity>

          {/* Services */}
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() =>
              router.push("/provider-services")
            }
          >
            <Text style={styles.primaryText}>
              Create / manage services
            </Text>
          </TouchableOpacity>

          {/* Bookings */}
          <TouchableOpacity
            style={styles.outlineBtn}
            onPress={() =>
              router.push("/provider-bookings")
            }
          >
            <Text style={styles.outlineText}>
              View & cancel bookings
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: PROVIDER_BACKGROUND,
  },

  content: {
    padding: 20,
    paddingBottom: 40,
  },

  step: {
    fontSize: 12,
    color: TEXT_MUTED,
    fontWeight: "600",
  },

  title: {
    fontSize: 26,
    fontWeight: "800",
    color: PRIMARY,
    marginTop: 6,
    marginBottom: 10,
  },

  kycBadge: {
    alignSelf: "flex-start",
    backgroundColor: CARD,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 20,
  },

  kycText: {
    color: TEXT_MUTED,
    fontSize: 13,
  },

  statsRow: {
    flexDirection: "row",
    marginBottom: 24,
  },

  statCard: {
    flex: 1,
    backgroundColor: CARD,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
  },

  statGap: {
    marginRight: 12,
  },

  statValue: {
    fontSize: 24,
    fontWeight: "800",
    color: TEXT,
  },

  statLabel: {
    color: TEXT_MUTED,
    fontSize: 13,
    marginTop: 4,
  },

  /* KYC button */
  kycBtn: {
    backgroundColor: PRIMARY,
    padding: 16,
    borderRadius: 4,
    marginBottom: 10,
    alignItems: "center",
  },

  kycBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
  },

  kycApprovedBtn: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
  },

  kycApprovedText: {
    color: TEXT_MUTED,
  },

  /* Other buttons */
  outlineBtn: {
    backgroundColor: CARD,
    padding: 16,
    borderRadius: 4,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: PRIMARY,
    alignItems: "center",
  },

  outlineText: {
    color: PRIMARY,
    fontWeight: "700",
    fontSize: 15,
  },

  primaryBtn: {
    backgroundColor: PRIMARY,
    padding: 16,
    borderRadius: 4,
    marginBottom: 10,
    alignItems: "center",
  },

  primaryText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
});