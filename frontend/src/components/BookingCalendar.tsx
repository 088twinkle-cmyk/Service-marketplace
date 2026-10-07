/**
 * BookingCalendar — month grid with per-day availability and a slot list.
 *
 * Used for booking (customer picks a slot) and for provider availability
 * management (provider blocks/unblocks slots). The component keeps the exact
 * same props as before so both screens keep working.
 */
import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { AvailabilitySlot } from "../services/api/bookingsApi";
import { colors, radius, spacing, typography, weight } from "../theme/tokens";
import { useResponsive } from "../theme/responsive";
import Icon from "./ui/Icon";
import Badge, { statusMeta } from "./ui/Badge";

type Props = {
  month: Date;
  slots: AvailabilitySlot[];
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  onChangeMonth: (delta: number) => void;
  readOnly?: boolean;
  bookingMode?: boolean;
  selectedSlotId?: number | null;
  onToggleSlot?: (slot: AvailabilitySlot) => void;
};

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKDAYS_LONG = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type DayStatus = "available" | "booked" | "blocked" | "none";

export default function BookingCalendar({
  month,
  slots,
  selectedDate,
  selectedSlotId,
  onSelectDate,
  onChangeMonth,
  readOnly,
  bookingMode,
  onToggleSlot,
}: Props) {
  const { isMobile } = useResponsive();
  const year = month.getFullYear();
  const mon = month.getMonth();
  const label = month.toLocaleString("default", { month: "long", year: "numeric" });

  const slotsByDate = useMemo(() => {
    const map: Record<string, AvailabilitySlot[]> = {};
    slots.forEach((s) => {
      (map[s.date] ||= []).push(s);
    });
    return map;
  }, [slots]);

  const days = useMemo(() => {
    const first = new Date(year, mon, 1);
    const startPad = first.getDay();
    const count = new Date(year, mon + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= count; d++) cells.push(d);
    return cells;
  }, [year, mon]);

  const dateStr = (day: number) =>
    `${year}-${String(mon + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const dayStatus = (day: number): DayStatus => {
    const daySlots = slotsByDate[dateStr(day)] || [];
    if (daySlots.some((s) => s.status === "available")) return "available";
    if (daySlots.some((s) => s.status === "booked")) return "booked";
    if (daySlots.some((s) => s.status === "blocked")) return "blocked";
    return "none";
  };

  const selectedSlots = selectedDate ? slotsByDate[selectedDate] || [] : [];
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate()
  ).padStart(2, "0")}`;

  return (
    <View style={styles.wrap}>
      <View style={styles.monthRow}>
        <Pressable
          onPress={() => onChangeMonth(-1)}
          accessibilityLabel="Previous month"
          style={({ pressed }: { pressed: boolean }) => [styles.monthBtn, pressed && styles.pressed]}
        >
          <Icon name="chevron-left" size={14} color={colors.text} />
        </Pressable>
        <Text style={styles.monthLabel}>{label}</Text>
        <Pressable
          onPress={() => onChangeMonth(1)}
          accessibilityLabel="Next month"
          style={({ pressed }: { pressed: boolean }) => [styles.monthBtn, pressed && styles.pressed]}
        >
          <Icon name="chevron-right" size={14} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {(isMobile ? WEEKDAYS : WEEKDAYS_LONG).map((w, i) => (
          <Text key={`${w}-${i}`} style={styles.weekday}>
            {w}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {days.map((day, i) => {
          if (day === null) return <View key={`e-${i}`} style={styles.cell} />;
          const ds = dateStr(day);
          const status = dayStatus(day);
          const selected = selectedDate === ds;

          return (
            <Pressable
              key={ds}
              accessibilityRole="button"
              accessibilityLabel={`${ds}, ${
                status === "none" ? "no slots" : `${status} slots`
              }`}
              accessibilityState={{ selected }}
              onPress={() => onSelectDate(ds)}
              style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                styles.cell,
                status === "available" ? styles.cellAvailable : null,
                status === "booked" ? styles.cellBooked : null,
                status === "blocked" ? styles.cellBlocked : null,
                hovered ? styles.cellHover : null,
                ds === todayStr ? styles.cellToday : null,
                selected ? styles.cellSelected : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text
                style={[
                  styles.dayNum,
                  status === "available" ? styles.dayNumAvailable : null,
                  selected ? styles.dayNumSelected : null,
                ]}
              >
                {day}
              </Text>
              {status !== "none" ? <View style={[styles.dayDot, dotStyle(status)]} /> : null}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.legend}>
        <LegendDot color={colors.success} label="Available" />
        <LegendDot color={colors.borderStrong} label="Booked" />
        <LegendDot color={colors.danger} label="Blocked" />
        <LegendDot color={colors.primary} label="Today" ring />
      </View>

      {selectedDate ? (
        <View style={styles.slots}>
          <Text style={styles.slotsTitle}>
            {bookingMode ? "Times on" : "Your times on"} {selectedDate}
          </Text>

          {selectedSlots.length === 0 ? (
            <View style={styles.noSlots}>
              <Icon name="calendar" size={16} color={colors.textSubtle} />
              <Text style={styles.noSlotsText}>
                {bookingMode
                  ? "No time slots published for this day. Try another date."
                  : "No slots yet — add one with the time presets below."}
              </Text>
            </View>
          ) : (
            selectedSlots.map((slot) => {
              const selectable = bookingMode ? !readOnly && slot.status === "available" : true;
              const meta = statusMeta(slot.status);
              const selected = selectedSlotId === slot.id;

              return (
                <Pressable
                  key={slot.id}
                  disabled={!selectable}
                  accessibilityRole="button"
                  accessibilityLabel={`${slot.start_time.slice(0, 5)} to ${slot.end_time.slice(
                      0,
                      5
                    )}, ${meta.label}`}
                  accessibilityState={{ disabled: !selectable, selected }}
                  onPress={() => {
                    if (!selectable) return;
                    onToggleSlot?.(slot);
                  }}
                  style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                    styles.slotRow,
                    hovered && selectable ? styles.slotHover : null,
                    selected ? styles.slotSelected : null,
                    !selectable ? styles.slotDisabled : null,
                    pressed && selectable ? styles.pressed : null,
                  ]}
                >
                  <View style={styles.slotLeft}>
                    <Icon name="clock" size={15} color={colors.textMuted} />
                    <Text style={styles.slotTime}>
                      {slot.start_time.slice(0, 5)} – {slot.end_time.slice(0, 5)}
                    </Text>
                  </View>
                  <Badge label={meta.label} tone={meta.tone} dot />
                </Pressable>
              );
            })
          )}
        </View>
      ) : null}
    </View>
  );
}

function dotStyle(status: DayStatus) {
  if (status === "available") return { backgroundColor: colors.success };
  if (status === "booked") return { backgroundColor: colors.borderStrong };
  if (status === "blocked") return { backgroundColor: colors.danger };
  return { backgroundColor: "transparent" };
}

function LegendDot({ color, label, ring }: { color: string; label: string; ring?: boolean }) {
  return (
    <View style={styles.legendItem}>
      <View
        style={[
          styles.dot,
          ring
            ? { backgroundColor: "transparent", borderWidth: 2, borderColor: color }
            : { backgroundColor: color },
        ]}
      />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  monthBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  monthLabel: { ...typography.h4, color: colors.text },
  weekRow: { flexDirection: "row", marginBottom: spacing.xs },
  weekday: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    color: colors.textSubtle,
    fontWeight: weight.semibold,
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: "14.28%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    marginVertical: 2,
    gap: 3,
  },
  cellAvailable: { backgroundColor: colors.successSoft },
  cellBooked: { backgroundColor: colors.surfaceMuted },
  cellBlocked: { backgroundColor: colors.dangerSoft },
  cellHover: { borderWidth: 1, borderColor: colors.borderStrong },
  cellToday: { borderWidth: 1, borderColor: colors.primary },
  cellSelected: { backgroundColor: colors.primary, borderWidth: 1, borderColor: colors.primary },
  dayNum: { fontSize: 13, color: colors.text, fontWeight: weight.semibold },
  dayNumAvailable: { color: colors.text },
  dayNumSelected: { color: colors.textInverse },
  dayDot: { width: 5, height: 5, borderRadius: 2.5 },
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: spacing.md,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  dot: { width: 9, height: 9, borderRadius: 4.5 },
  legendText: { fontSize: 11.5, color: colors.textMuted },
  slots: { marginTop: spacing.lg },
  slotsTitle: { ...typography.smallStrong, color: colors.text, marginBottom: spacing.sm },
  noSlots: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noSlotsText: { flex: 1, color: colors.textMuted, fontSize: 12.5, lineHeight: 18 },
  slotRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  slotHover: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  slotSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft, borderWidth: 2 },
  slotDisabled: { opacity: 0.6 },
  slotLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  slotTime: { ...typography.smallStrong, color: colors.text },
  pressed: { opacity: 0.85 },
});
