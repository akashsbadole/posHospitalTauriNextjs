"use client";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { X } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createPatient, getDoctors, createVisit, createOpdToken, getNextAvailableDoctor } from "@/lib/tauri";
import { toast } from "sonner";
import type { Doctor } from "@/types";
import { Sparkles } from "lucide-react";

const schema = z.object({
  full_name: z.string().min(2, "Name is required"),
  dob: z.string().min(1, "Date of birth is required"),
  gender: z.enum(["Male","Female","Other"]),
  phone: z.string().min(10, "Valid phone required"),
  email: z.string().email().optional().or(z.literal("")),
  blood_group: z.enum(["A+","A-","B+","B-","O+","O-","AB+","AB-"] as [string,...string[]]),
  department: z.string(),
  assigned_doctor_id: z.number().optional().nullable(),
  address: z.string().optional(),
  allergies: z.string().optional(),
  chronic_conditions: z.string().optional(),
  emergency_contact: z.string().optional(),
  emergency_phone: z.string().optional(),
  insurance_provider: z.string().optional(),
  insurance_number: z.string().optional(),
  status: z.enum(["Active","OPD"]).default("OPD"),
  start_visit: z.boolean().default(false),
  visit_type: z.enum(["OPD","Emergency"]).default("OPD"),
  visit_reason: z.string().optional(),
});
type F = z.infer<typeof schema>;

const DEPTS = ["General Medicine","Cardiology","Neurology","Orthopedics","Gynecology","Pediatrics","Radiology","ENT","Dermatology","Oncology","Psychiatry","Urology"];

export function NewPatientModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const qc = useQueryClient();

  const { register, handleSubmit, reset, formState: { errors }, watch, setValue } = useForm<F>({
    resolver: zodResolver(schema),
    defaultValues: { gender:"Male", blood_group:"O+", department:"General Medicine", status:"OPD" },
  });

  useEffect(() => {
    if (open) {
      getDoctors().then(setDoctors);
    }
  }, [open]);

  const selectedDoctorId = watch("assigned_doctor_id");
  const selectedDept = watch("department");

  const handleAutoAssign = async () => {
    try {
      const doc = await getNextAvailableDoctor(selectedDept);
      setValue("assigned_doctor_id", doc.id);
      toast.success(`Assigned to ${doc.full_name} (${doc.specialization})`);
    } catch (e) {
      toast.error("No available doctors found in this department");
    }
  };

  useEffect(() => {
    if (selectedDoctorId) {
      const doc = doctors.find(d => d.id === selectedDoctorId);
      if (doc) {
        setValue("department", doc.specialization);
      }
    }
  }, [selectedDoctorId, doctors, setValue]);

  const mut = useMutation({
    mutationFn: async (d: F) => {
      const patient = await createPatient({
        ...d,
        assigned_doctor_id: d.assigned_doctor_id || undefined,
        email: d.email || undefined,
        address: d.address || undefined,
        allergies: d.allergies || undefined,
        chronic_conditions: d.chronic_conditions || undefined,
        emergency_contact: d.emergency_contact || undefined,
        emergency_phone: d.emergency_phone || undefined,
        insurance_provider: d.insurance_provider || undefined,
        insurance_number: d.insurance_number || undefined,
      } as any);

      if (d.start_visit && d.assigned_doctor_id) {
        const visit = await createVisit({
          patient_id: patient.id,
          doctor_id: d.assigned_doctor_id,
          department: d.department,
          reason: d.visit_reason,
          visit_type: d.visit_type,
          status: "REGISTERED"
        });

        await createOpdToken({
          patient_id: patient.id,
          doctor_id: d.assigned_doctor_id,
          department: d.department,
          queue_date: new Date().toISOString().split("T")[0],
          visit_id: visit.id,
          priority: d.visit_type === "Emergency" ? 2 : 0
        });

        return { patient, visitStarted: true };
      }

      return { patient, visitStarted: false };
    },
    onSuccess: (res) => {
      toast.success(`Patient ${res.patient.patient_code} registered! ${res.visitStarted ? "Visit started and token generated." : ""}`);
      qc.invalidateQueries({ queryKey: ["patients"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["opd-tokens"] });
      reset(); onClose();
    },
    onError: (error: unknown) => {
    if (error instanceof Error) {
      toast.error(error.message)
    } else {
      toast.error("Failed to register patient - unknown error occurred")
    }
  },
  });

  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center anim-fade-in">
      <div className="bg-surface border border-border2 rounded-2xl w-[560px] max-h-[85vh] flex flex-col shadow-card">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="font-display font-bold text-base">Register New Patient</h2>
            <p className="text-[12px] text-muted mt-0.5">Fill in patient details below</p>
          </div>
          <button onClick={onClose} className="text-subtle hover:text-white"><X size={18} /></button>
        </div>
        <form className="overflow-y-auto flex-1">
          <div className="p-6 grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="form-label">Full Name *</label>
              <input {...register("full_name")} placeholder="e.g. Anika Mehta" />
              {errors.full_name && <p className="form-error">Name is required</p>}
            </div>
            <div><label className="form-label">Date of Birth *</label><input type="date" {...register("dob")} /></div>
            <div><label className="form-label">Gender *</label>
              <select {...register("gender")}><option>Male</option><option>Female</option><option>Other</option></select>
            </div>
            <div><label className="form-label">Phone *</label><input {...register("phone")} placeholder="+91 9876543210" />
              {errors.phone && <p className="form-error">Valid phone required</p>}
            </div>
            <div><label className="form-label">Email</label><input type="email" {...register("email")} placeholder="optional" /></div>
            <div><label className="form-label">Blood Group *</label>
              <select {...register("blood_group")} className="w-full">{["A+","A-","B+","B-","O+","O-","AB+","AB-"].map(g=><option key={g}>{g}</option>)}</select>
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="form-label mb-0">Assigned Doctor</label>
                <button type="button" onClick={handleAutoAssign} className="text-[10px] text-accent flex items-center gap-1 hover:underline">
                  <Sparkles size={10} /> Auto-assign
                </button>
              </div>
              <select {...register("assigned_doctor_id", { valueAsNumber: true })} className="w-full">
                <option value="">Select Doctor</option>
                {doctors.map(d => (
                  <option key={d.id} value={d.id}>{d.full_name} - {d.specialization}</option>
                ))}
              </select>
            </div>
            <div><label className="form-label">Department *</label>
              <select {...register("department")} className="w-full">{DEPTS.map(d=><option key={d}>{d}</option>)}</select>
            </div>
            <div className="col-span-2"><label className="form-label">Address</label><input {...register("address")} placeholder="Street, City, State" /></div>
            <div><label className="form-label">Known Allergies</label><input {...register("allergies")} placeholder="e.g. Penicillin" /></div>
            <div><label className="form-label">Chronic Conditions</label><input {...register("chronic_conditions")} placeholder="e.g. Diabetes" /></div>
            <div><label className="form-label">Emergency Contact</label><input {...register("emergency_contact")} /></div>
            <div><label className="form-label">Emergency Phone</label><input {...register("emergency_phone")} /></div>
            <div><label className="form-label">Insurance Provider</label><input {...register("insurance_provider")} /></div>
            <div><label className="form-label">Policy / Member ID</label><input {...register("insurance_number")} /></div>
            <div className="col-span-2 border-t border-border pt-4 mt-2">
              <div className="flex items-center gap-2 mb-3">
                <input type="checkbox" {...register("start_visit")} id="start_visit" className="w-4 h-4 rounded border-border" />
                <label htmlFor="start_visit" className="text-sm font-medium text-white cursor-pointer">Start Visit immediately</label>
              </div>
              {watch("start_visit") && (
                <div className="grid grid-cols-2 gap-4 anim-fade-in">
                  <div>
                    <label className="form-label">Visit Type</label>
                    <select {...register("visit_type")}>
                      <option value="OPD">OPD</option>
                      <option value="Emergency">Emergency</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="form-label">Reason for Visit / Chief Complaint</label>
                    <input {...register("visit_reason")} placeholder="e.g. Regular checkup, persistent cough" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </form>
        <div className="px-6 py-4 border-t border-border flex gap-3 justify-end">
          <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button onClick={handleSubmit(d => mut.mutate(d))} disabled={mut.isPending} className="btn btn-primary">
            {mut.isPending ? "Registering…" : "Register Patient →"}
          </button>
        </div>
      </div>
    </div>
  );
}
