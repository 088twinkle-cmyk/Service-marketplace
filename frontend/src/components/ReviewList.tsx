/**
 * ReviewList — customer reviews for a provider/service.
 * Shows the real reviews from `reviewsApi`; the empty state nudges the first
 * booking instead of inventing sample content.
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { ReviewItem } from "../services/api/reviewsApi";
import { colors, radius, spacing, typography, weight } from "../theme/tokens";
import Avatar from "./ui/Avatar";
import Icon from "./ui/Icon";
import { EmptyState } from "./ui/States";

type Props = { reviews: ReviewItem[] };

function Stars({ rating, size = 13 }: { rating: number; size?: number }) {
  return (
    <View style={styles.stars}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Icon key={i} name="star" size={size} color={i <= rating ? colors.star : colors.border} />
      ))}
    </View>
  );
}

export default function ReviewList({ reviews }: Props) {
  if (reviews.length === 0) {
    return (
      <EmptyState
        icon="chat"
        title="No reviews yet"
        description="Reviews appear here after a customer completes a booking with this provider."
        bare
      />
    );
  }

  const average =
    reviews.reduce((total, review) => total + Number(review.rating || 0), 0) / reviews.length;

  return (
    <View style={styles.wrap}>
      <View style={styles.summary}>
        <Text style={styles.summaryValue}>{average.toFixed(1)}</Text>
        <View>
          <Stars rating={Math.round(average)} size={15} />
          <Text style={styles.summaryLabel}>
            {reviews.length} review{reviews.length === 1 ? "" : "s"}
          </Text>
        </View>
      </View>

      {reviews.map((review) => (
        <View key={review.id} style={styles.item}>
          <View style={styles.head}>
            <Avatar name={review.customer_name} size={38} />
            <View style={styles.headText}>
              <Text style={styles.name}>{review.customer_name}</Text>
              <Stars rating={review.rating} />
            </View>
            <Text style={styles.date}>
              {new Date(review.created_at).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
              })}
            </Text>
          </View>
          {review.comment ? <Text style={styles.comment}>{review.comment}</Text> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryValue: { ...typography.h2, color: colors.text },
  summaryLabel: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  item: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  headText: { flex: 1, gap: 3 },
  stars: { flexDirection: "row", gap: 2 },
  name: { ...typography.bodyStrong, color: colors.text },
  date: { fontSize: 11.5, color: colors.textSubtle, fontWeight: weight.medium },
  comment: { ...typography.body, color: colors.text, lineHeight: 22 },
});
