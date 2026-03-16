"use client";
import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createInsuranceClaim, getPatients, getInvoices } from "@/lib/tauri";
import { toast } from "sonner";
import type { Patient, Invoice } from "@/types";

const schema = z.object({
  patient_id: z.number().min(1, "Patient is required"),
  invoice_id: z.number().min(1, "Invoice is required"),
  provider_name: z.string().min(1, "Provider is required"),
  policy_number: z.string().min(1, "Policy number is required"),
  claim_amount: z.number().min(0, "Amount must be positive"),
  notes: z.string().optional(),
});

type F = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
}

export function NewClaimModal({ open, onClose }: Props) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [patientSearch, setPatientSearch] = useState("");
  const qc = useQueryClient();

  const { register, handleSubmit, formState: { errors }, reset, setValue, watch } = useForm<F>({
    resolver: zodResolver(schema),
  });

  const selectedPatientId = watch("patient_id");

  useEffect(() => {
    if (open) {
      getPatients().then(setPatients);
      getInvoices().then(setInvoices);
    }
  }, [open]);

  useEffect(() => {
    if (selectedPatientId) {
      getInvoices(undefined, selectedPatientId).then(setInvoices);
    }
  }, [selectedPatientId]);

  const filteredPatients = patients.filter(p => 
    p.full_name.toLowerCase().includes(patientSearch.toLowerCase()) ||
    p.patient_code.toLowerCase().includes(patientSearch.toLowerCase())
  );

  const selectedPatient = patients.find(p => p.id === selectedPatientId);
  const patientInvoices = invoices.filter(i => i.status !== "Paid" && i.balance > 0);
  const selectedInvoice = invoices.find(i => i.id === watch("invoice_id"));

  const createMut = useMutation({
    mutationFn: (data: F) => createInsuranceClaim(data as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["insurance-claims"] });
      toast.success("Insurance claim created!");
      onClose();
      reset();
    },
    onError: () => toast.error("Failed to create claim"),
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center anim-fade-in">
      <div className="bg-surface border border-border2 rounded-2xl w-[520px] max-h-[90vh] flex flex-col shadow-card">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-display font-bold text-base">New Insurance Claim</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit((d) => createMut.mutate(d))} className="flex-1 overflow-y-auto p-6">
          <div className="space-y-4">
            <div>
              <label className="form-label">Patient *</label>
              <div className="relative">
                <input
                  value={patientSearch}
                  onChange={(e) => setPatientSearch(e.target.value)}
                  placeholder="Search patient..."
                  className="w-full"
                />
                {patientSearch && filteredPatients.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-surface2 border border-border rounded-lg max-h-40 overflow-y-auto">
                    {filteredPatients.slice(0, 8).map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => { setValue("patient_id", p.id); setPatientSearch(p.full_name); }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-surface3 flex justify-between"
                      >
                        <span className="text-white">{p.full_name}</span>
                        <span className="text-subtle text-xs">{p.patient_code}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {errors.patient_id && <p className="form-error">{errors.patient_id.message}</p>}
              {selectedPatient && (
                <div className="mt-1 text-xs text-muted">Insurance: {selectedPatient.insurance_provider || "Not provided"}</div>
              )}
            </div>

            <div>
              <label className="form-label">Link to Invoice *</label>
              <select {...register("invoice_id", { valueAsNumber: true })} className="w-full" disabled={!selectedPatientId}>
                <option value={0}>Select Invoice</option>
                {patientInvoices.map(i => (
                  <option key={i.id} value={i.id}>
                    {i.invoice_code} - ₹{i.balance.toFixed(2)} (Due)
                  </option>
                ))}
              </select>
              {errors.invoice_id && <p className="form-error">{errors.invoice_id.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Insurance Provider *</label>
                <input {...register("provider_name")} placeholder="e.g., ICICI Lombard" className="w-full" />
                {errors.provider_name && <p className="form-error">{errors.provider_name.message}</p>}
              </div>

              <div>
                <label className="form-label">Policy Number *</label>
                <input {...register("policy_number")} className="w-full" />
                {errors.policy_number && <p className="form-error">{errors.policy_number.message}</p>}
              </div>
            </div>

            <div>
              <label className="form-label">Claim Amount (₹) *</label>
              <input type="number" step="0.01" {...register("claim_amount", { valueAsNumber: true })} className="w-full" />
              {selectedInvoice && (
                <div className="mt-1 text-xs text-accent">Invoice balance: ₹{selectedInvoice.balance.toFixed(2)}</div>
              )}
              {errors.claim_amount && <p className="form-error">{errors.claim_amount.message}</p>}
            </div>

            <div>
              <label className="form-label">Notes</label>
              <textarea {...register("notes")} rows={2} className="w-full" placeholder="Additional notes..." />
            </div>
          </div>
        </form>

        <div className="px-6 py-4 border-t border-border flex gap-3 justify-end">
          <button onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button onClick={handleSubmit((d) => createMut.mutate(d))} className="btn btn-primary">
            {createMut.isPending ? "Creating..." : "Create Claim"}
          </button>
        </div>
      </div>
    </div>
  );
}
