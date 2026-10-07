/**
 * ServiceListing — the responsive grid of service cards plus its loading,
 * empty and error states. Used by home, search and provider-owned listings.
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { ServiceItem } from "../services/api/servicesApi";
import { colors, spacing, typography, weight } from "../theme/tokens";
import ServiceCard from "./ServiceCard";
import { EmptyState, ErrorState } from "./ui/States";
import { ServiceGridSkeleton } from "./ui/Skeleton";
import { Grid } from "./ui/Layout";

type Props = {
  services: ServiceItem[];
  loading: boolean;
  error: string | null;
  searchQuery?: string;
  onBook: (service: ServiceItem) => void;
  onRetry: () => void;
  title?: string;
  /** Rendered right of the title (sort selector, result count…). */
  headerAction?: React.ReactNode;
  /** Hide the built-in heading when the parent already renders one. */
  hideHeading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  /** Optional per-service footer label (e.g. "Manage listing"). */
  footerNoteFor?: (service: ServiceItem) => string | undefined;
};

export default function ServiceListing({
  services,
  loading,
  error,
  searchQuery = "",
  onBook,
  onRetry,
  title = "Services you may like",
  headerAction,
  hideHeading,
  emptyTitle,
  emptyDescription,
  emptyActionLabel,
  onEmptyAction,
  footerNoteFor,
}: Props) {
  if (loading) {
    return (
      <View style={styles.wrap}>
        {!hideHeading ? <Text style={styles.heading}>{title}</Text> : null}
        <ServiceGridSkeleton count={6} />
      </View>
    );
  }

  if (error && services.length === 0) {
    return (
      <View style={styles.wrap}>
        {!hideHeading ? <Text style={styles.heading}>{title}</Text> : null}
        <ErrorState
          title="We could not load services"
          description={error}
          onRetry={onRetry}
        />
      </View>
    );
  }

  if (services.length === 0) {
    return (
      <View style={styles.wrap}>
        {!hideHeading ? <Text style={styles.heading}>{title}</Text> : null}
        <EmptyState
          icon="search"
          title={emptyTitle ?? (searchQuery.trim() ? "No services match your search" : "No services here yet")}
          description={
            emptyDescription ??
            (searchQuery.trim()
              ? `We could not find anything for “${searchQuery.trim()}”. Try a different keyword or another city.`
              : "Nothing is listed in this area right now. Try another city, or pull to refresh in a moment.")
          }
          actionLabel={emptyActionLabel ?? (searchQuery.trim() ? "Clear search" : undefined)}
          onAction={onEmptyAction}
        />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {!hideHeading ? (
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.heading}>{title}</Text>
            <Text style={styles.count}>
              {services.length} {services.length === 1 ? "service" : "services"} available
            </Text>
          </View>
          {headerAction}
        </View>
      ) : null}

      <Grid>
        {services.map((item, index) => (
          <ServiceCard
            key={item.id}
            service={item}
            index={index}
            onPress={() => onBook(item)}
            footerNote={footerNoteFor?.(item)}
          />
        ))}
      </Grid>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%" },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing.lg,
    marginBottom: spacing.lg,
    flexWrap: "wrap",
  },
  headerText: { flex: 1, minWidth: 200 },
  heading: { ...typography.h3, color: colors.text },
  count: { ...typography.small, color: colors.textMuted, marginTop: 2, fontWeight: weight.medium },
});
