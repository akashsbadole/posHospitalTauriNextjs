"use client";
import { useState, useEffect } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAppointments, recordPayment } from "@/lib/tauri";
import { format, startOfWeek, addDays, subDays } from "date-fns";
import { toast } from "sonner";
import type { Invoice } from "@/types";

interface PartialPaymentModalProps {
  invoice: Invoice | null;
  open: boolean;
  onClose: () => void;
}

export function PartialPaymentModal({ invoice, open, onClose }: PartialPaymentModalProps) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Cash");
  const qc = useQueryClient();

  useEffect(() => {
    if (invoice && open) {
      setAmount(invoice.balance.toString());
    }
  }, [invoice, open]);

  const payMut = useMutation({
    mutationFn: () => {
      if (!invoice) return Promise.reject("No invoice");
      return recordPayment(invoice.id, parseFloat(amount), method as any);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("Payment recorded!");
      onClose();
    },
    onError: () => toast.error("Payment failed"),
  });

  if (!open || !invoice) return null;

  const remaining = invoice.balance - (parseFloat(amount) || 0);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center anim-fade-in">
      <div className="bg-surface border border-border2 rounded-2xl w-[420px] shadow-card">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-display font-bold text-base">Record Payment</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-surface2 border border-border rounded-lg p-4">
            <div className="text-xs text-subtle">Invoice</div>
            <div className="text-lg font-medium text-white">{invoice.invoice_code}</div>
            <div className="flex justify-between mt-2 text-sm">
              <span className="text-muted">Total:</span>
              <span className="text-white">₹{invoice.total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted">Paid:</span>
              <span className="text-success">₹{invoice.paid_amount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm border-t border-border mt-2 pt-2">
              <span className="text-muted">Balance:</span>
              <span className="text-warning font-medium">₹{invoice.balance.toFixed(2)}</span>
            </div>
          </div>

          <div>
            <label className="form-label">Payment Amount (₹)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full text-lg"
              placeholder="Enter amount"
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => setAmount((invoice.balance / 2).toFixed(2))}
                className="btn btn-ghost btn-sm"
              >
                Half
              </button>
              <button
                onClick={() => setAmount(invoice.balance.toString())}
                className="btn btn-ghost btn-sm"
              >
                Full
              </button>
            </div>
          </div>

          <div>
            <label className="form-label">Payment Method</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full">
              <option value="Cash">Cash</option>
              <option value="Card">Card</option>
              <option value="UPI">UPI</option>
              <option value="Net Banking">Net Banking</option>
              <option value="Cheque">Cheque</option>
            </select>
          </div>

          {remaining > 0 && (
            <div className="bg-warning/10 border border-warning/20 rounded-lg p-3 text-sm text-warning">
              Remaining balance: ₹{remaining.toFixed(2)}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border flex gap-3 justify-end">
          <button onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button
            onClick={() => payMut.mutate()}
            disabled={!amount || parseFloat(amount) <= 0 || payMut.isPending}
            className="btn btn-primary"
          >
            {payMut.isPending ? "Processing..." : "Record Payment"}
          </button>
        </div>
      </div>
    </div>
  );
}
