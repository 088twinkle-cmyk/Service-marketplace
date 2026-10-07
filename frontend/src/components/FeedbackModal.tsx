/**
 * FeedbackModal — success / error / info dialog.
 * Thin, backwards-compatible wrapper around the `Dialog` primitive.
 */
import React from "react";

import Button from "./ui/Button";
import Dialog from "./ui/Dialog";

export type FeedbackType = "success" | "error" | "info";

type Props = {
  visible: boolean;
  type: FeedbackType;
  title: string;
  message: string;
  onClose: () => void;
  confirmLabel?: string;
};

const ICONS = {
  success: "check",
  error: "alert",
  info: "info",
} as const;

export default function FeedbackModal({
  visible,
  type,
  title,
  message,
  onClose,
  confirmLabel,
}: Props) {
  return (
    <Dialog
      visible={visible}
      onClose={onClose}
      title={title}
      description={message}
      icon={ICONS[type]}
      tone={type === "error" ? "danger" : type === "success" ? "success" : "primary"}
      footer={
        <Button
          label={confirmLabel ?? (type === "error" ? "Got it" : "Continue")}
          fullWidth
          variant={type === "error" ? "outline" : "primary"}
          onPress={onClose}
        />
      }
    />
  );
}
