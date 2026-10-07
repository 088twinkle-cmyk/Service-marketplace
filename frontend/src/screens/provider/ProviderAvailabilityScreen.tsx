/**
 * ProviderAvailabilityScreen — the provider calendar.
 *
 * Same behaviour as before: pick a service, tap a day, block/unblock slots and
 * add a new time slot from presets. The redesign adds slot counters, a clearer
 * month view and a guided empty state for providers without published services.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import axios from "axios";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";

import BookingCalendar from "../../components/BookingCalendar";
import FeedbackModal, { type FeedbackType } from "../../components/FeedbackModal";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Icon from "../../components/ui/Icon";
import { Chip, Container, StatCard } from "../../components/ui/Layout";
import PageHeader from "../../components/ui/PageHeader";
import { EmptyState } from "../../components/ui/States";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import { bookingsApi, type AvailabilitySlot } from "../../services/api/bookingsApi";
import { servicesApi, type ServiceItem } from "../../services/api/servicesApi";
import { getApiErrorMessage } from "../../services/api/client";
import { getAuth, logout } from "../../auth/auth";
import { TIME_PRESETS } from "../../utils/bookingHelpers";
import { colors, radius, spacing, typography, weight } from "../../theme/tokens";
import { useResponsive } from "../../theme/responsive";

export default function ProviderAvailabilityScreen() {
  const router = useRouter();
  const { isDesktop } = useResponsive();

  const [month, setMonth] = useState(new Date());
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [myServices, setMyServices] = useState<ServiceItem[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState(TIME_PRESETS[0]);
  const [popup, setPopup] = useState({
    visible: false,
    type: "info" as FeedbackType,
    title: "",
    message: "",
  });

  const monthKey = useMemo(
    () => `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`,
    [month]
  );

  const load = useCallback(async () => {
    const auth = await getAuth();
    if (!auth.token) {
      router.replace("/login");
      return;
    }
    setLoading(true);
    try {
      const mine = await servicesApi.listMine();
      setMyServices(mine);
      if (mine.length && !selectedServiceId) setSelectedServiceId(mine[0].id);

      const svcId = selectedServiceId ?? mine[0]?.id;
      const data = await bookingsApi.listAvailability({
        month: monthKey,
        ...(svcId ? { service: svcId } : {}),
      });
      setSlots(data);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, [monthKey, router, selectedServiceId]);

  useEffect(() => {
    load();
  }, [load]);

  const showPopup = (type: FeedbackType, title: string, message: string) =>
    setPopup({ visible: true, type, title, message });

  const onToggle = async (slot: AvailabilitySlot) => {
    if (slot.status === "booked") {
      showPopup(
        "info",
        "Slot already booked",
        "Cancel the booking from your bookings list (24+ hours before) to release this time."
      );
      return;
    }
    try {
      await bookingsApi.toggleBlock(slot.id);
      await load();
      showPopup("success", "Slot updated", "The slot status has been updated.");
    } catch (err) {
      showPopup("error", "Update failed", getApiErrorMessage(err, "Could not update the slot."));
    }
  };

  const addTimeSlot = async () => {
    if (!selectedDate) {
      showPopup("info", "Select a date", "Tap a day on the calendar first.");
      return;
    }
    const serviceId = selectedServiceId ?? myServices[0]?.id;
    if (!serviceId) {
      showPopup("info", "No service yet", "Publish a service before adding availability.");
      router.push("/provider-services");
      return;
    }
    setAdding(true);
    try {
      await bookingsApi.createAvailability({
        service: serviceId,
        date: selectedDate,
        start_time: selectedPreset.start,
        end_time: selectedPreset.end,
      });
      await load();
      showPopup(
        "success",
        "Slot added",
        `${selectedDate} · ${selectedPreset.label} is now open for booking. Add more times on the same day if needed.`
      );
    } catch (err) {
      showPopup(
        "error",
        "Could not add slot",
        getApiErrorMessage(err, "Times may overlap with an existing slot.")
      );
    } finally {
      setAdding(false);
    }
  };

  const counts = useMemo(() => {
    const available = slots.filter((slot) => slot.status === "available").length;
    const booked = slots.filter((slot) => slot.status === "booked").length;
    const blocked = slots.filter((slot) => slot.status === "blocked").length;
    return { available, booked, blocked };
  }, [slots]);

  const selectedService = myServices.find((service) => service.id === selectedServiceId);

  if (!loading && myServices.length === 0) {
    return (
      <View style={styles.screen}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <Container width="narrow" style={styles.content}>
            <PageHeader
              eyebrow="Provider calendar"
              title="Manage availability"
              subtitle="Customers can only book the time slots you publish here."
              onBack={() => router.push("/provider-home")}
            />
            <EmptyState
              icon="calendar"
              title="Publish a service first"
              description="Availability is attached to a service, so add a listing before opening time slots."
              actionLabel="Go to my services"
              onAction={() => router.push("/provider-services")}
            />
          </Container>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Container style={styles.content}>
          <PageHeader
            eyebrow="Provider calendar"
            title="Manage availability"
            subtitle="Green slots are open for booking, grey slots are already booked and red slots are blocked by you."
            onBack={() => router.push("/provider-home")}
            actions={<Badge label={`${counts.available} open slots`} tone="success" size="md" dot />}
          />

          <View style={styles.statsRow}>
            <StatCard label="Open" value={counts.available} icon="calendar" tone="success" hint="Bookable now" />
            <StatCard label="Booked" value={counts.booked} icon="clock" tone="neutral" hint="Customer appointments" />
            <StatCard label="Blocked" value={counts.blocked} icon="close" tone="warning" hint="Hidden from customers" />
          </View>

          <View style={[styles.layout, isDesktop ? styles.layoutDesktop : null]}>
            <View style={styles.main}>
              {loading ? (
                <SkeletonBlock height={380} radiusValue={radius.xl} />
              ) : (
                <Animated.View entering={FadeInDown.duration(380)}>
                  <BookingCalendar
                    month={month}
                    slots={slots}
                    selectedDate={selectedDate}
                    onSelectDate={setSelectedDate}
                    onChangeMonth={(delta) =>
                      setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1))
                    }
                    onToggleSlot={onToggle}
                  />
                </Animated.View>
              )}
            </View>

            <View style={[styles.rail, isDesktop ? styles.railDesktop : null]}>
              {myServices.length > 0 ? (
                <Card padding="lg" style={styles.railCard}>
                  <Text style={styles.railTitle}>Service</Text>
                  <Text style={styles.railHint}>
                    Availability is stored per service.
                  </Text>
                  <View style={styles.chipRow}>
                    {myServices.map((service) => (
                      <Chip
                        key={service.id}
                        label={service.title}
                        size="sm"
                        active={selectedServiceId === service.id}
                        onPress={() => setSelectedServiceId(service.id)}
                      />
                    ))}
                  </View>
                  {selectedService ? (
                    <Text style={styles.railMeta}>
                      Rs {Number.parseFloat(String(selectedService.price ?? "0")).toFixed(0)} ·{" "}
                      {selectedService.location}
                    </Text>
                  ) : null}
                </Card>
              ) : null}

              <Card padding="lg" style={styles.railCard}>
                <Text style={styles.railTitle}>Add a time slot</Text>
                <Text style={styles.railHint}>
                  {selectedDate
                    ? `Selected day: ${selectedDate}`
                    : "Tap a day on the calendar to choose when the slot starts."}
                </Text>

                <View style={styles.chipRow}>
                  {TIME_PRESETS.map((preset) => (
                    <Chip
                      key={preset.label}
                      label={preset.label}
                      size="sm"
                      active={selectedPreset.label === preset.label}
                      onPress={() => setSelectedPreset(preset)}
                    />
                  ))}
                </View>

                <Button
                  label="Add slot on selected day"
                  icon="plus"
                  fullWidth
                  loading={adding}
                  disabled={!selectedDate}
                  style={{ marginTop: spacing.lg }}
                  onPress={addTimeSlot}
                />
              </Card>

              <Card padding="lg" style={styles.railCard} tone="primary">
                <Text style={styles.railTitle}>Good to know</Text>
                <View style={styles.notes}>
                  {[
                    "Tap an open slot in the calendar to block it, and tap again to reopen it.",
                    "Booked slots cannot be blocked — cancel the booking first to free the time.",
                    "Overlapping times for the same service are rejected automatically.",
                  ].map((line) => (
                    <View key={line} style={styles.noteRow}>
                      <Icon name="info" size={15} color={colors.primaryDark} />
                      <Text style={styles.noteText}>{line}</Text>
                    </View>
                  ))}
                </View>
              </Card>
            </View>
          </View>
        </Container>
      </ScrollView>

      <FeedbackModal
        visible={popup.visible}
        type={popup.type}
        title={popup.title}
        message={popup.message}
        onClose={() => setPopup((p) => ({ ...p, visible: false }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingTop: spacing.xxl, paddingBottom: spacing.giant },
  statsRow: { flexDirection: "row", gap: spacing.md, flexWrap: "wrap", marginBottom: spacing.xxl },
  layout: { gap: spacing.xxl },
  layoutDesktop: { flexDirection: "row", alignItems: "flex-start" },
  main: { flex: 1, minWidth: 0 },
  rail: { width: "100%" },
  railDesktop: { width: 360, flexShrink: 0, gap: spacing.xxl },
  railCard: { gap: spacing.sm },
  railTitle: { ...typography.h4, color: colors.text },
  railHint: { ...typography.small, color: colors.textMuted },
  railMeta: { ...typography.caption, color: colors.textSubtle, marginTop: spacing.sm },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  notes: { gap: spacing.sm, marginTop: spacing.sm },
  noteRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  noteText: { flex: 1, ...typography.small, color: colors.textMuted },
});
