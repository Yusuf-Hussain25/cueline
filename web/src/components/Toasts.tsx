"use client";

import { AlertCircle, CircleCheck, X } from "lucide-react";
import { useEffect } from "react";
import type { Toast } from "@/lib/sessionState";

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), toast.tone === "info" ? 2500 : 7000);
    return () => clearTimeout(t);
  }, [toast.id, toast.tone, onDismiss]);

  return (
    <div className={`toast ${toast.tone}`} role={toast.tone === "error" ? "alert" : "status"}>
      {toast.tone === "error" ? <AlertCircle size={18} /> : <CircleCheck size={18} />}
      <p>{toast.message}</p>
      <button type="button" className="btn btn-ghost" onClick={() => onDismiss(toast.id)} aria-label="Dismiss">
        <X size={15} />
      </button>
    </div>
  );
}

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
