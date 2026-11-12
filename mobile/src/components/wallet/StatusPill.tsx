import React from "react";
import { Badge, type BadgeTone } from "@/components/ui";

export type VoucherDisplayStatus = "creating" | "ready" | "redeemed" | "failed" | "processing";

export function voucherDisplayStatus(mintStatus: string, redeemedLocally: boolean): VoucherDisplayStatus {
  if (redeemedLocally) return "redeemed";
  switch (mintStatus) {
    case "PENDING":
    case "MINTING":
      return "creating";
    case "MINTED":
      return "ready";
    case "REDEEMED":
      return "redeemed";
    case "FAILED":
      return "failed";
    default:
      return "processing";
  }
}

const LABELS: Record<VoucherDisplayStatus, { label: string; tone: BadgeTone; icon?: "time-outline" | "checkmark-circle" | "alert-circle" | "checkmark-done" }> = {
  creating: { label: "Creating…", tone: "warn", icon: "time-outline" },
  ready: { label: "Ready", tone: "success", icon: "checkmark-circle" },
  redeemed: { label: "Redeemed", tone: "neutral", icon: "checkmark-done" },
  failed: { label: "Failed", tone: "danger", icon: "alert-circle" },
  processing: { label: "Processing", tone: "neutral", icon: "time-outline" },
};

export function StatusPill({ status }: { status: VoucherDisplayStatus }) {
  const s = LABELS[status];
  return <Badge label={s.label} tone={s.tone} icon={s.icon} testID={`voucher-status-${status}`} />;
}
