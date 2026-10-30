"use client";

import { AlertCircle, X } from "lucide-react";
import { useEffect } from "react";
import type { Toast } from "@/lib/sessionState";

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), 7000);
    return () => clearTimeout(t);
  }, [toast.id, onDismiss]);

  return (
    <div className="toast" role="alert">
      <AlertCircle size={18} />
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
