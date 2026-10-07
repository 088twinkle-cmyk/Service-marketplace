/**
 * BookScreen — customer booking flow.
 *
 * Step 1 · choose an available slot from the provider's calendar
 * Step 2 · review the request and confirm it
 *
 * Everything else (price negotiation, payment and completion) happens on the
 * booking itself and is explained in the "what happens next" rail, so the flow
 * never promises something the backend does not support.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import axios from "axios";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";

import BookingCalendar from "../../components/BookingCalendar";
import FeedbackModal, { type FeedbackType } from "../../components/FeedbackModal";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card, { Divider } from "../../components/ui/Card";
import Icon from "../../components/ui/Icon";
import { Container, StepTrail } from "../../components/ui/Layout";
import PageHeader from "../../components/ui/PageHeader";
import { EmptyState } from "../../components/ui/States";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import { bookingsApi, type AvailabilitySlot } from "../../services/api/bookingsApi";
import { getApiErrorMessage } from "../../services/api/client";
import { getAuth } from "../../auth/auth";
import { colors, radius, spacing, typography, weight } from "../../theme/tokens";
import { useResponsive } from "../../theme/responsive";

type Step = 1 | 2;

const FLOW_LIFECYCLE = [
  "Request sent",
  "Provider confirms",
  "Price agreed",
  "Payment",
  "Service delivered",
  "Completed & reviewed",
];

export default function BookScreen() {
  const router = useRouter();
  const { isDesktop } = useResponsive();
  const params = useLocalSearchParams<{
    serviceId?: string;
    title?: string;
    price?: string;
    provider?: string;
    providerId?: string;
  }>();

  const [step, setStep] = useState<Step>(1);
  const [month, setMonth] = useState(new Date());
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [popup, setPopup] = useState({
    visible: false,
    type: "info" as FeedbackType,
    title: "",
    message: "",
    onConfirm: undefined as (() => void) | undefined,
  });

  const monthKey = useMemo(
    () => `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`,
    [month]
  );

  const missingParams = !params.serviceId || !params.providerId;
  const priceNum = params.price ? Number.parseFloat(params.price) : 0;

  useEffect(() => {
    (async () => {
      const auth = await getAuth();
      if (
        auth.role?.toLowerCase() === "provider" &&
        auth.username &&
        params.provider &&
        params.provider === auth.username
      ) {
        router.replace("/provider-services");
      }
    })();
  }, [router, params.provider]);

  const showPopup = (
    type: FeedbackType,
    title: string,
    message: string,
    onConfirm?: () => void
  ) => setPopup({ visible: true, type, title, message, onConfirm });

  const closePopup = () => {
    const cb = popup.onConfirm;
    setPopup((p) => ({ ...p, visible: false, onConfirm: undefined }));
    cb?.();
  };

  const loadSlots = useCallback(async () => {
    if (!params.serviceId || !params.providerId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await bookingsApi.listAvailability({
        provider: Number(params.providerId),
        service: Number(params.serviceId),
        month: monthKey,
      });
      setSlots(data);
    } catch (err) {
      // If the backend requires auth (or the token is stale), show a friendly message.
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        showPopup("info", "Sign in required", "Please sign in to view availability.", () =>
          router.push("/login")
        );
        setSlots([]);
        return;
      }
      showPopup("error", "Could not load slots", getApiErrorMessage(err, "Try again."));
      setSlots([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey, params.serviceId, params.providerId]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  useFocusEffect(
    useCallback(() => {
      loadSlots();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadSlots])
  );

  const onSelectSlot = (slot: AvailabilitySlot) => {
    if (slot.status !== "available") return;
    setSelectedSlot(slot);
  };

  const goToConfirm = () => {
    if (!selectedSlot) {
      showPopup("error", "Select a slot", "Pick an available date and time first.");
      return;
    }
    setStep(2);
  };

  const confirmBooking = async () => {
    const auth = await getAuth();
    if (!auth.token) {
      showPopup("info", "Sign in required", "Please sign in to book a service.", () =>
        router.push("/login")
      );
      return;
    }
    if (!selectedSlot || !params.serviceId) return;

    setBooking(true);
    try {
      await bookingsApi.createBooking({
        service: Number(params.serviceId),
        slot_id: selectedSlot.id,
      });
      showPopup(
        "success",
        "Booking request sent",
        "Your request is pending until the provider confirms it. You can follow every status change from your dashboard.",
        () => router.replace("/dashboard")
      );
      setSelectedSlot(null);
      loadSlots();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        showPopup("info", "Session expired", "Please sign in again to confirm your booking.", () =>
          router.push("/login")
        );
        return;
      }
      if (axios.isAxiosError(err) && err.response?.status === 403) {
        showPopup(
          "error",
          "Booking not allowed",
          getApiErrorMessage(err, "You cannot book this listing.")
        );
        return;
      }
      showPopup("error", "Booking failed", getApiErrorMessage(err, "Try another slot."));
      await loadSlots();
    } finally {
      setBooking(false);
    }
  };

  if (missingParams) {
    return (
      <Container style={styles.content}>
        <EmptyState
          icon="calendar"
          title="Booking unavailable"
          description="Open a service from the marketplace and choose “Continue to booking” to pick a time slot."
          actionLabel="Browse services"
          onAction={() => router.replace("/")}
        />
      </Container>
    );
  }

  const summary = (
    <Card padding="lg" style={styles.summaryCard}>
      <Text style={styles.summaryEyebrow}>Booking request</Text>
      <Text style={styles.summaryTitle}>{params.title}</Text>

      <View style={styles.summaryRows}>
        <SummaryRow label="Provider" value={params.provider || "—"} />
        <SummaryRow
          label="Date & time"
          value={
            selectedSlot
              ? `${selectedSlot.date} · ${selectedSlot.start_time.slice(0, 5)}–${selectedSlot.end_time.slice(0, 5)}`
              : "Not selected yet"
          }
        />
        <SummaryRow
          label="Starting price"
          value={Number.isFinite(priceNum) && priceNum > 0 ? `Rs ${priceNum.toFixed(0)}` : "—"}
          bold
        />
      </View>

      <Badge
        label={selectedSlot ? "Slot selected" : "Choose a slot"}
        tone={selectedSlot ? "success" : "warning"}
        icon={selectedSlot ? "check" : "clock"}
      />

      <Divider style={{ marginVertical: spacing.lg }} />

      <Button
        label={step === 1 ? "Continue to review" : "Confirm booking request"}
        size="lg"
        fullWidth
        trailingIcon="arrow-right"
        loading={booking}
        disabled={step === 1 && !selectedSlot}
        onPress={step === 1 ? goToConfirm : confirmBooking}
      />

      {step === 2 ? (
        <Button
          label="Change slot"
          variant="ghost"
          size="sm"
          fullWidth
          style={{ marginTop: spacing.sm }}
          onPress={() => setStep(1)}
        />
      ) : null}

      <View style={styles.lifecycle}>
        <Text style={styles.lifecycleTitle}>What happens next</Text>
        {FLOW_LIFECYCLE.map((label, index) => (
          <View key={label} style={styles.lifecycleRow}>
            <View style={styles.lifecycleDot}>
              <Text style={styles.lifecycleDotText}>{index + 1}</Text>
            </View>
            <Text style={styles.lifecycleText}>{label}</Text>
          </View>
        ))}
      </View>
    </Card>
  );

  return (
    <View style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Container style={styles.content}>
          <PageHeader
            eyebrow="Booking"
            title="Choose a time that works"
            subtitle="Availability comes straight from the provider's calendar — green days have open slots."
            onBack={() => router.back()}
          />

          <View style={styles.stepsWrap}>
            <StepTrail steps={["Choose a slot", "Review request", "Provider confirms"]} current={step - 1} />
          </View>

          <Animated.View
            entering={FadeInDown.duration(400)}
            style={[styles.layout, isDesktop ? styles.layoutDesktop : null]}
          >
            <View style={styles.main}>
              {loading ? (
                <View style={styles.skeletonWrap}>
                  <SkeletonBlock height={340} radiusValue={radius.xl} />
                </View>
              ) : (
                <BookingCalendar
                  month={month}
                  slots={slots}
                  selectedDate={selectedDate}
                  onSelectDate={(date) => {
                    setSelectedDate(date);
                    setSelectedSlot(null);
                  }}
                  onChangeMonth={(delta) =>
                    setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1))
                  }
                  onToggleSlot={onSelectSlot}
                  selectedSlotId={selectedSlot?.id}
                  bookingMode
                />
              )}

              {!loading && slots.length === 0 ? (
                <View style={styles.emptyNotice}>
                  <Icon name="info" size={16} color={colors.primary} />
                  <Text style={styles.emptyNoticeText}>
                    No slots are published for this month yet. Try the next month, or check back
                    once the provider updates their calendar.
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={[styles.rail, isDesktop ? styles.railDesktop : null]}>{summary}</View>
          </Animated.View>
        </Container>
      </ScrollView>

      {/* Mobile sticky action */}
      {!isDesktop ? (
        <View style={styles.stickyBar}>
          <View style={styles.stickyInfo}>
            <Text style={styles.stickyLabel}>
              {selectedSlot ? selectedSlot.date : "No slot selected"}
            </Text>
            <Text style={styles.stickyValue}>
              {selectedSlot
                ? `${selectedSlot.start_time.slice(0, 5)}–${selectedSlot.end_time.slice(0, 5)}`
                : "Pick a date above"}
            </Text>
          </View>
          <Button
            label={step === 1 ? "Continue" : "Confirm"}
            size="lg"
            loading={booking}
            disabled={step === 1 && !selectedSlot}
            onPress={step === 1 ? goToConfirm : confirmBooking}
          />
        </View>
      ) : null}

      <FeedbackModal
        visible={popup.visible}
        type={popup.type}
        title={popup.title}
        message={popup.message}
        onClose={closePopup}
        confirmLabel={popup.type === "success" ? "View dashboard" : "OK"}
      />
    </View>
  );
}

function SummaryRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, bold ? styles.summaryValueBold : null]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingTop: spacing.xl, paddingBottom: spacing.giant },
  stepsWrap: { marginBottom: spacing.xxl },
  layout: { gap: spacing.xxl },
  layoutDesktop: { flexDirection: "row", alignItems: "flex-start" },
  main: { flex: 1, gap: spacing.lg },
  rail: { width: "100%" },
  railDesktop: { width: 380, flexShrink: 0 },
  skeletonWrap: { width: "100%" },

  summaryCard: { gap: spacing.md },
  summaryEyebrow: {
    ...typography.label,
    color: colors.primary,
    textTransform: "uppercase",
  },
  summaryTitle: { ...typography.h3, color: colors.text },
  summaryRows: { gap: spacing.sm, marginTop: spacing.xs },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  summaryLabel: { ...typography.small, color: colors.textMuted },
  summaryValue: { ...typography.smallStrong, color: colors.text, flexShrink: 1, textAlign: "right" },
  summaryValueBold: { ...typography.bodyStrong, color: colors.text },

  lifecycle: { marginTop: spacing.xxl, gap: spacing.sm },
  lifecycleTitle: { ...typography.caption, color: colors.textSubtle, textTransform: "uppercase" },
  lifecycleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  lifecycleDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  lifecycleDotText: { fontSize: 10.5, fontWeight: weight.bold, color: colors.primaryDark },
  lifecycleText: { ...typography.small, color: colors.textMuted },

  emptyNotice: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primarySoftBorder,
  },
  emptyNoticeText: { flex: 1, ...typography.small, color: colors.primaryDark },

  stickyBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  stickyInfo: { flexShrink: 1 },
  stickyLabel: { fontSize: 11, color: colors.textSubtle, textTransform: "uppercase", letterSpacing: 0.5 },
  stickyValue: { ...typography.bodyStrong, color: colors.text },
});
