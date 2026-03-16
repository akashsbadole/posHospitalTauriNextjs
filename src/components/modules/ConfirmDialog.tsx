"use client";
import { AlertTriangle, X } from "lucide-react";

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "info";
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function ConfirmDialog({ open, title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", variant = "danger", onConfirm, onCancel, loading }: Props) {
  if (!open) return null;
  
  const colors = {
    danger: { bg: "bg-danger/10", border: "border-danger/30", text: "text-danger", icon: "text-danger" },
    warning: { bg: "bg-warning/10", border: "border-warning/30", text: "text-warning", icon: "text-warning" },
    info: { bg: "bg-accent/10", border: "border-accent/30", text: "text-accent", icon: "text-accent" },
  };
  const c = colors[variant];

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center anim-fade-in">
      <div className="bg-surface border border-border2 rounded-2xl w-[420px] shadow-card">
        <div className="p-6 flex flex-col items-center text-center">
          <div className={`w-14 h-14 ${c.bg} rounded-full flex items-center justify-center mb-4`}>
            <AlertTriangle size={28} className={c.icon} />
          </div>
          <h3 className="font-display font-bold text-lg text-white mb-2">{title}</h3>
          <p className="text-sm text-muted">{message}</p>
        </div>
        
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onCancel} className="flex-1 btn btn-ghost">{cancelLabel}</button>
          <button onClick={onConfirm} disabled={loading} className={`flex-1 btn ${variant === "danger" ? "btn-danger" : "btn-primary"}`}>
            {loading ? "Processing..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
