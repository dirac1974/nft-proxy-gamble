import React from "react";
import { IAPSheet } from "@/components/IAPSheet";
import { useUiStore } from "@/stores/uiStore";

// Mounts app-wide sheets driven by uiStore.
export function GlobalSheets() {
  const iapOpen = useUiStore((s) => s.iapOpen);
  const closeAll = useUiStore((s) => s.closeAll);
  return <IAPSheet visible={iapOpen} onClose={closeAll} />;
}
