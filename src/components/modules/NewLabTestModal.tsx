"use client";
import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createLabTest, getPatients, getDoctors, getPatientVisits, getNextAvailableDoctor } from "@/lib/tauri";
import { toast } from "sonner";
import { X, Sparkles } from "lucide-react";
import type { Patient, Doctor, Visit } from "@/types";

const schema = z.object({
  patient_id: z.number().min(1, "Patient is required"),
  doctor_id: z.number().min(1, "Doctor is required"),
  test_name: z.string().min(1, "Test name is required"),
  test_category: z.string().min(1, "Category is required"),
  notes: z.string().optional(),
  visit_id: z.number().optional().nullable(),
});

type F = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
}

const LAB_CATEGORIES = ["Hematology", "Biochemistry", "Microbiology", "Pathology", "Radiology", "Cardiology", "Immunology"];
const COMMON_TESTS: Record<string, string[]> = {
  Hematology: ["CBC", "Hemoglobin", "Platelet Count", "ESR", "BT/CT"],
  Biochemistry: ["Blood Sugar", "Lipid Profile", "Liver Function", "Kidney Function", "Thyroid"],
  Microbiology: ["Culture & Sensitivity", "Widal Test", "VDRL", "HIV", "HBsAg"],
  Cardiology: ["ECG", "2D Echo", "TMT", "Troponin", "CK-MB"],
  Radiology: ["X-Ray Chest", "X-Ray Abdomen", "Ultrasound", "CT Scan", "MRI"],
};

export function NewLabTestModal({ open, onClose }: Props) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [patientSearch, setPatientSearch] = useState("");
  const [patientVisits, setPatientVisits] = useState<Visit[]>([]);
  const qc = useQueryClient();

  const { register, handleSubmit, formState: { errors }, reset, setValue, watch } = useForm<F>({
    resolver: zodResolver(schema),
    defaultValues: {
      test_category: "Hematology",
    },
  });

  const selectedCategory = watch("test_category");

  const autoAssignDoctor = async () => {
    try {
      const doc = await getNextAvailableDoctor("General Medicine");
      setValue("doctor_id", doc.id);
      toast.success(`Auto-assigned ${doc.full_name}`);
    } catch (err) {
      toast.error("No available doctor found");
    }
  };
  const selectedPatientId = watch("patient_id");

  useEffect(() => {
    if (open) {
      getPatients().then(setPatients);
      getDoctors().then(setDoctors);
    }
  }, [open]);

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

  const selectedPatient = patients.find(p => p.id === selectedPatientId);

  const createMut = useMutation({
    mutationFn: (data: F) => createLabTest({
      ...data,
      visit_id: data.visit_id || undefined,
      ordered_date: new Date().toISOString().split("T")[0],
      status: "Ordered",
    } as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lab-tests"] });
      qc.invalidateQueries({ queryKey: ["patient-visits"] });
      toast.success("Lab test ordered!");
      onClose();
      reset();
    },
    onError: () => toast.error("Failed to order lab test"),
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center anim-fade-in">
      <div className="bg-surface border border-border2 rounded-2xl w-[520px] max-h-[90vh] flex flex-col shadow-card">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-display font-bold text-base">Order Lab Test</h2>
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
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="form-label mb-0">Doctor *</label>
                <button
                  type="button"
                  onClick={autoAssignDoctor}
                  className="text-[10px] text-accent flex items-center gap-0.5 hover:underline"
                >
                  <Sparkles size={10} /> Auto-Assign
                </button>
              </div>
              <select {...register("doctor_id", { valueAsNumber: true })} className="w-full">
                <option value="">Select Doctor</option>
                {doctors.map(d => (
                  <option key={d.id} value={d.id}>{d.full_name}</option>
                ))}
              </select>
              {errors.doctor_id && <p className="form-error">{errors.doctor_id.message}</p>}
            </div>

            <div>
              <label className="form-label">Test Category *</label>
              <select {...register("test_category")} className="w-full">
                {LAB_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label className="form-label">Test Name *</label>
              <input {...register("test_name")} placeholder="Enter test name" className="w-full" list="test-suggestions" />
              <datalist id="test-suggestions">
                {(COMMON_TESTS[selectedCategory] || []).map(t => (
                  <option key={t} value={t} />
                ))}
              </datalist>
              {errors.test_name && <p className="form-error">{errors.test_name.message}</p>}
            </div>

            <div>
              <label className="form-label">Notes</label>
              <textarea {...register("notes")} rows={2} className="w-full" placeholder="Clinical notes..." />
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
        </form>

        <div className="px-6 py-4 border-t border-border flex gap-3 justify-end">
          <button onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button onClick={handleSubmit((d) => createMut.mutate(d))} className="btn btn-primary">
            {createMut.isPending ? "Ordering..." : "Order Test"}
          </button>
        </div>
      </div>
    </div>
  );
}
