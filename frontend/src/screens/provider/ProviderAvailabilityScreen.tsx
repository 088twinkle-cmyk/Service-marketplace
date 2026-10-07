import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import ScreenShell from "../../components/ScreenShell";
import BookingCalendar from "../../components/BookingCalendar";
import FeedbackModal, { type FeedbackType } from "../../components/FeedbackModal";
import { bookingsApi, type AvailabilitySlot } from "../../services/api/bookingsApi";
import { servicesApi, type ServiceItem } from "../../services/api/servicesApi";
import { getApiErrorMessage } from "../../services/api/client";
import { getAuth } from "../../auth/auth";
import { logout } from "../../auth/auth";
import { TIME_PRESETS } from "../../utils/bookingHelpers";
import { PRIMARY, CARD, TEXT, TEXT_MUTED, BORDER, TAG_BG } from "../../theme/colors";
import axios from "axios";

export default function ProviderAvailabilityScreen() {
  const router = useRouter();
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
      if (mine.length && !selectedServiceId) {
        setSelectedServiceId(mine[0].id);
      }
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
        "Booked slot",
        "Cancel the booking from View bookings (24+ hrs before) to release this time."
      );
      return;
    }
    try {
      await bookingsApi.toggleBlock(slot.id);
      await load();
      showPopup("success", "Updated", "Slot status updated.");
    } catch (err) {
      showPopup("error", "Failed", getApiErrorMessage(err, "Could not update."));
    }
  };

  const addTimeSlot = async () => {
    if (!selectedDate) {
      showPopup("info", "Select a date", "Tap a day on the calendar first.");
      return;
    }
    const serviceId = selectedServiceId ?? myServices[0]?.id;
    if (!serviceId) {
      showPopup("info", "No service", "Publish a service before adding availability.");
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
        `${selectedDate} ${selectedPreset.label} is now available. Add more times on the same day if needed.`
      );
    } catch (err) {
      showPopup("error", "Failed", getApiErrorMessage(err, "Could not add slot. Times may overlap."));
    } finally {
      setAdding(false);
    }
  };

  return (
    <ScreenShell
      showBack
      step="Provider calendar"
      title="Manage availability"
      subtitle="Add multiple time slots per day. Booked slots turn gray. Overlapping times are blocked automatically."
    >
      <Animated.View entering={FadeInDown.duration(400)}>
        {myServices.length > 1 ? (
          <View style={styles.serviceRow}>
            <Text style={styles.label}>Service</Text>
            <View style={styles.chips}>
              {myServices.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.chip, selectedServiceId === s.id && styles.chipActive]}
                  onPress={() => setSelectedServiceId(s.id)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selectedServiceId === s.id && styles.chipTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {s.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator color={PRIMARY} style={{ marginTop: 24 }} />
        ) : (
          <BookingCalendar
            month={month}
            slots={slots}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            onChangeMonth={(d) => setMonth(new Date(month.getFullYear(), month.getMonth() + d, 1))}
            onToggleSlot={onToggle}
          />
        )}

        {selectedDate ? (
          <View style={styles.presetBox}>
            <Text style={styles.label}>Time slot for {selectedDate}</Text>
            <View style={styles.chips}>
              {TIME_PRESETS.map((p) => (
                <TouchableOpacity
                  key={p.label}
                  style={[styles.chip, selectedPreset.label === p.label && styles.chipActive]}
                  onPress={() => setSelectedPreset(p)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selectedPreset.label === p.label && styles.chipTextActive,
                    ]}
                  >
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.addBtn, adding && { opacity: 0.6 }]}
          onPress={addTimeSlot}
          disabled={adding}
        >
          {adding ? (
            <ActivityIndicator color={PRIMARY} />
          ) : (
            <Text style={styles.addText}>+ Add time slot on selected day</Text>
          )}
        </TouchableOpacity>
      </Animated.View>

      <FeedbackModal
        visible={popup.visible}
        type={popup.type}
        title={popup.title}
        message={popup.message}
        onClose={() => setPopup((p) => ({ ...p, visible: false }))}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  serviceRow: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "700", color: TEXT, marginBottom: 8 },
  presetBox: {
    marginTop: 16,
    padding: 14,
    backgroundColor: CARD,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: TAG_BG,
    maxWidth: "48%",
  },
  chipActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  chipText: { fontSize: 13, fontWeight: "600", color: TEXT },
  chipTextActive: { color: "#fff" },
  addBtn: {
    marginTop: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: PRIMARY,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: CARD,
  },
  addText: { color: PRIMARY, fontWeight: "700" },
});
