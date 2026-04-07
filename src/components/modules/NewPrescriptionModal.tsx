"use client";
import { useState, useEffect } from "react";
import { X, Plus, Trash2, Search } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createPrescription, getPatients, getDoctors, getInventory, getPatientVisits } from "@/lib/tauri";
import { toast } from "sonner";
import type { Patient, Doctor, InventoryItem, Visit } from "@/types";

const schema = z.object({
  patient_id: z.number().min(1, "Patient is required"),
  doctor_id: z.number().min(1, "Doctor is required"),
  diagnosis: z.string().optional(),
  valid_until: z.string().min(1, "Valid until date is required"),
  notes: z.string().optional(),
  visit_id: z.number().optional().nullable(),
});

type F = z.infer<typeof schema>;

interface DrugEntry {
  id: string;
  inventory_item_id?: number;
  drug_name: string;
  dosage: string;
  frequency: string;
  duration_days: number;
  route: string;
  instructions: string;
  refills_remaining: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const ROUTES = ["Oral", "IV", "IM", "Topical", "Inhaled"];
const FREQUENCIES = ["Once daily", "Twice daily", "Three times daily", "Four times daily", "Every 8 hours", "Every 12 hours", "As needed"];

export function NewPrescriptionModal({ open, onClose, initialPatientId, initialVisitId, initialDiagnosis }: Props & { initialPatientId?: number, initialVisitId?: number, initialDiagnosis?: string }) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [patientSearch, setPatientSearch] = useState("");
  const [drugSearch, setDrugSearch] = useState("");
  const [drugDropdownId, setDrugDropdownId] = useState<string | null>(null);
  const [drugs, setDrugs] = useState<DrugEntry[]>([]);
  const [patientVisits, setPatientVisits] = useState<Visit[]>([]);
  const qc = useQueryClient();

  const { register, handleSubmit, formState: { errors }, reset, setValue, watch } = useForm<F>({
    resolver: zodResolver(schema),
    defaultValues: {
      valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      patient_id: initialPatientId,
      visit_id: initialVisitId,
      diagnosis: initialDiagnosis,
    },
  });

  const selectedPatientId = watch("patient_id");

  useEffect(() => {
    if (open) {
      getPatients().then(data => {
        setPatients(data);
        if (initialPatientId) {
          const p = data.find(pat => pat.id === initialPatientId);
          if (p) {
            setPatientSearch(p.full_name);
            if (p.assigned_doctor_id) setValue("doctor_id", p.assigned_doctor_id);
          }
        }
      });
      getDoctors().then(setDoctors);
      getInventory().then(setInventory);
    }
  }, [open, initialPatientId, setValue]);

  useEffect(() => {
    if (selectedPatientId) {
      getPatientVisits(selectedPatientId).then(setPatientVisits);
    } else {
      setPatientVisits([]);
    }
  }, [selectedPatientId]);

  const filteredPatients = patients.filter(p => 
    p.full_name.toLowerCase().includes(patientSearch.toLowerCase()) ||
    p.patient_code.toLowerCase().includes(patientSearch.toLowerCase())
  );

  const filteredDrugs = inventory.filter(i => 
    i.name.toLowerCase().includes(drugSearch.toLowerCase())
  );

  const selectedPatient = patients.find(p => p.id === selectedPatientId);

  const addDrug = () => {
    const newDrug: DrugEntry = {
      id: Math.random().toString(36).substr(2, 9),
      drug_name: "",
      dosage: "",
      frequency: "Once daily",
      duration_days: 7,
      route: "Oral",
      instructions: "",
      refills_remaining: 0,
    };
    setDrugs([...drugs, newDrug]);
  };

  const updateDrug = (id: string, field: keyof DrugEntry, value: any) => {
    setDrugs(drugs.map(d => d.id === id ? { ...d, [field]: value } : d));
  };

  const removeDrug = (id: string) => {
    setDrugs(drugs.filter(d => d.id !== id));
  };

  const createMut = useMutation({
    mutationFn: async (data: F) => {
      const validDrugs = drugs.filter(d => d.drug_name && d.dosage && d.frequency);
      if (validDrugs.length === 0) throw new Error("At least one drug is required");
      
      const drugsData = validDrugs.map(d => ({
        inventory_item_id: d.inventory_item_id,
        drug_name: d.drug_name,
        dosage: d.dosage,
        frequency: d.frequency,
        duration_days: d.duration_days,
        route: d.route,
        instructions: d.instructions,
        refills_remaining: d.refills_remaining,
      }));
      
      return createPrescription({
        ...data,
        visit_id: data.visit_id || undefined,
        issue_date: new Date().toISOString().split("T")[0],
        status: "Active"
      } as any, drugsData as any);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prescriptions"] });
      qc.invalidateQueries({ queryKey: ["patient-visits"] });
      toast.success("Prescription created!");
      onClose();
      reset();
      setDrugs([]);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to create prescription"),
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center anim-fade-in">
      <div className="bg-surface border border-border2 rounded-2xl w-[700px] max-h-[90vh] flex flex-col shadow-card">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-display font-bold text-base">New Prescription</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        <form className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="form-label">Patient *</label>
              <div className="relative">
                <input
                  value={patientSearch}
                  onChange={(e) => { setPatientSearch(e.target.value); }}
                  onFocus={() => {}}
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
            </div>

            <div>
              <label className="form-label">Doctor *</label>
              <select {...register("doctor_id", { valueAsNumber: true })} className="w-full">
                <option value="">Select Doctor</option>
                {doctors.map(d => (
                  <option key={d.id} value={d.id}>{d.full_name} - {d.specialization}</option>
                ))}
              </select>
              {errors.doctor_id && <p className="form-error">{errors.doctor_id.message}</p>}
            </div>

            <div>
              <label className="form-label">Valid Until *</label>
              <input type="date" {...register("valid_until")} className="w-full" />
              {errors.valid_until && <p className="form-error">{errors.valid_until.message}</p>}
            </div>

            <div>
              <label className="form-label">Diagnosis</label>
              <input {...register("diagnosis")} placeholder="Primary diagnosis" className="w-full" />
            </div>

            <div>
              <label className="form-label">Link to Visit</label>
              <select {...register("visit_id", { valueAsNumber: true })} className="w-full">
                <option value="">No link / New Visit</option>
                {patientVisits.filter(v => v.status !== "COMPLETED").map(v => (
                  <option key={v.id} value={v.id}>{v.visit_code} - {v.status} ({v.doctor_name})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <label className="form-label mb-0">Medications</label>
              <button type="button" onClick={addDrug} className="btn btn-ghost btn-sm">
                <Plus size={12} /> Add Drug
              </button>
            </div>

            {drugs.length === 0 ? (
              <div className="text-center py-8 text-muted text-sm border border-dashed border-border rounded-lg">
                No medications added. Click "Add Drug" to add medications.
              </div>
            ) : (
              <div className="space-y-3">
                {drugs.map((drug, idx) => (
                  <div key={drug.id} className="bg-surface2 border border-border rounded-lg p-4">
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-xs font-medium text-accent">Drug #{idx + 1}</span>
                      <button type="button" onClick={() => removeDrug(drug.id)} className="text-danger hover:text-red-400">
                        <Trash2 size={14} />
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-2 relative">
                        <label className="form-label text-[10px]">Drug Name *</label>
                        <div className="relative">
                          <input
                            value={drug.drug_name}
                            onChange={(e) => { updateDrug(drug.id, "drug_name", e.target.value); setDrugDropdownId(drug.id); setDrugSearch(e.target.value); }}
                            placeholder="Search or type drug name..."
                            className="w-full text-sm"
                          />
                          {drugDropdownId === drug.id && filteredDrugs.length > 0 && (
                            <div className="absolute z-10 w-full mt-1 bg-surface border border-border rounded-lg max-h-32 overflow-y-auto">
                              {filteredDrugs.slice(0, 5).map(i => (
                                <button
                                  key={i.id}
                                  type="button"
                                  onClick={() => {
                                    updateDrug(drug.id, "drug_name", i.name);
                                    updateDrug(drug.id, "inventory_item_id", i.id);
                                    setDrugDropdownId(null);
                                  }}
                                  className="w-full px-3 py-2 text-left text-xs hover:bg-surface3 text-white"
                                >
                                  {i.name}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div>
                        <label className="form-label text-[10px]">Dosage *</label>
                        <input
                          value={drug.dosage}
                          onChange={(e) => updateDrug(drug.id, "dosage", e.target.value)}
                          placeholder="e.g., 500mg"
                          className="w-full text-sm"
                        />
                      </div>
                      
                      <div>
                        <label className="form-label text-[10px]">Frequency</label>
                        <select
                          value={drug.frequency}
                          onChange={(e) => updateDrug(drug.id, "frequency", e.target.value)}
                          className="w-full text-sm"
                        >
                          {FREQUENCIES.map(f => <option key={f}>{f}</option>)}
                        </select>
                      </div>
                      
                      <div>
                        <label className="form-label text-[10px]">Duration (days)</label>
                        <input
                          type="number"
                          value={drug.duration_days}
                          onChange={(e) => updateDrug(drug.id, "duration_days", parseInt(e.target.value) || 0)}
                          className="w-full text-sm"
                        />
                      </div>
                      
                      <div>
                        <label className="form-label text-[10px]">Route</label>
                        <select
                          value={drug.route}
                          onChange={(e) => updateDrug(drug.id, "route", e.target.value)}
                          className="w-full text-sm"
                        >
                          {ROUTES.map(r => <option key={r}>{r}</option>)}
                        </select>
                      </div>
                    </div>
                    
                    <div className="mt-3">
                      <label className="form-label text-[10px]">Instructions</label>
                      <input
                        value={drug.instructions}
                        onChange={(e) => updateDrug(drug.id, "instructions", e.target.value)}
                        placeholder="e.g., Take after food"
                        className="w-full text-sm"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="form-label">Notes</label>
            <textarea {...register("notes")} rows={2} className="w-full" placeholder="Additional notes..." />
          </div>
        </form>

        <div className="px-6 py-4 border-t border-border flex gap-3 justify-end">
          <button onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button onClick={handleSubmit((d) => createMut.mutate(d))} className="btn btn-primary">
            {createMut.isPending ? "Creating..." : "Create Prescription"}
          </button>
        </div>
      </div>
    </div>
  );
}
