"use client";
import { useState, useEffect } from "react";
import { X, Search } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { admitPatient, getPatients, getWards, getBeds } from "@/lib/tauri";
import { toast } from "sonner";
import type { Patient, Ward, Bed } from "@/types";

const schema = z.object({
  patient_id: z.number().min(1, "Patient is required"),
  bed_id: z.number().min(1, "Bed is required"),
  expected_discharge: z.string().optional(),
  notes: z.string().optional(),
});

type F = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AdmitPatientModal({ open, onClose }: Props) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [beds, setBeds] = useState<Bed[]>([]);
  const [patientSearch, setPatientSearch] = useState("");
  const [selectedWardId, setSelectedWardId] = useState<number | null>(null);
  const qc = useQueryClient();

  const { register, handleSubmit, formState: { errors }, reset, setValue, watch } = useForm<F>({
    resolver: zodResolver(schema),
  });

  const selectedPatientId = watch("patient_id");
  const selectedBedId = watch("bed_id");

  useEffect(() => {
    if (open) {
      getPatients().then(setPatients);
      getWards().then(setWards);
      getBeds().then(setBeds);
    }
  }, [open]);

  useEffect(() => {
    if (selectedWardId) {
      getBeds(selectedWardId).then(setBeds);
    }
  }, [selectedWardId]);

  const filteredPatients = patients.filter(p => 
    p.full_name.toLowerCase().includes(patientSearch.toLowerCase()) ||
    p.patient_code.toLowerCase().includes(patientSearch.toLowerCase())
  );

  const selectedPatient = patients.find(p => p.id === selectedPatientId);
  const availableBeds = beds.filter(b => b.status === "Available");

  const admitMut = useMutation({
    mutationFn: (data: F) => admitPatient(data.bed_id, data.patient_id, data.expected_discharge),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["beds"] });
      qc.invalidateQueries({ queryKey: ["patients"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("Patient admitted successfully!");
      onClose();
      reset();
    },
    onError: () => toast.error("Failed to admit patient"),
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center anim-fade-in">
      <div className="bg-surface border border-border2 rounded-2xl w-[520px] max-h-[90vh] flex flex-col shadow-card">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-display font-bold text-base">Admit Patient</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit((d) => admitMut.mutate(d))} className="flex-1 overflow-y-auto p-6">
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
                <div className="mt-2 text-xs text-accent">
                  {selectedPatient.full_name} • {selectedPatient.gender} • {selectedPatient.blood_group}
                </div>
              )}
            </div>

            <div>
              <label className="form-label">Ward *</label>
              <select onChange={(e) => { setSelectedWardId(Number(e.target.value)); setValue("bed_id", 0 as any); }} className="w-full">
                <option value="">Select Ward</option>
                {wards.map(w => (
                  <option key={w.id} value={w.id}>{w.ward_name} ({w.ward_type})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label">Bed *</label>
              <select {...register("bed_id", { valueAsNumber: true })} className="w-full" disabled={!selectedWardId}>
                <option value={0}>Select Bed</option>
                {availableBeds.map(b => (
                  <option key={b.id} value={b.id}>Bed {b.bed_number}</option>
                ))}
              </select>
              {errors.bed_id && <p className="form-error">{errors.bed_id.message}</p>}
              {selectedWardId && availableBeds.length === 0 && (
                <p className="text-xs text-warning mt-1">No beds available in this ward</p>
              )}
            </div>

            <div>
              <label className="form-label">Expected Discharge</label>
              <input type="date" {...register("expected_discharge")} className="w-full" />
            </div>

            <div>
              <label className="form-label">Notes</label>
              <textarea {...register("notes")} rows={2} className="w-full" placeholder="Admission notes..." />
            </div>
          </div>
        </form>

        <div className="px-6 py-4 border-t border-border flex gap-3 justify-end">
          <button onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button onClick={handleSubmit((d) => admitMut.mutate(d))} className="btn btn-primary">
            {admitMut.isPending ? "Admitting..." : "Admit Patient"}
          </button>
        </div>
      </div>
    </div>
  );
}
