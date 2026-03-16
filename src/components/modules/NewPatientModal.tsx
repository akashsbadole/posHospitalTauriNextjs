"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { X } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createPatient } from "@/lib/tauri";
import { toast } from "sonner";

const schema = z.object({
  full_name: z.string().min(2),
  dob: z.string().min(1),
  gender: z.enum(["Male","Female","Other"]),
  phone: z.string().min(10),
  email: z.string().email().optional().or(z.literal("")),
  blood_group: z.enum(["A+","A-","B+","B-","O+","O-","AB+","AB-"] as [string,...string[]]),
  department: z.string(),
  address: z.string().optional(),
  allergies: z.string().optional(),
  chronic_conditions: z.string().optional(),
  emergency_contact: z.string().optional(),
  emergency_phone: z.string().optional(),
  insurance_provider: z.string().optional(),
  insurance_number: z.string().optional(),
  status: z.enum(["Active","OPD"]).default("OPD"),
});
type F = z.infer<typeof schema>;

const DEPTS = ["General Medicine","Cardiology","Neurology","Orthopedics","Gynecology","Pediatrics","Radiology","ENT","Dermatology","Oncology","Psychiatry","Urology"];

export function NewPatientModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<F>({
    resolver: zodResolver(schema),
    defaultValues: { gender:"Male", blood_group:"O+", department:"General Medicine", status:"OPD" },
  });

  const mut = useMutation({
    mutationFn: (d: F) => createPatient(d as Parameters<typeof createPatient>[0]),
    onSuccess: (p) => {
      toast.success(`Patient ${p.patient_code} registered!`);
      qc.invalidateQueries({ queryKey: ["patients"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      reset(); onClose();
    },
    onError: (err: Error) => toast.error(err.message || "Failed to register patient"),
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
              <select {...register("blood_group")}>{["A+","A-","B+","B-","O+","O-","AB+","AB-"].map(g=><option key={g}>{g}</option>)}</select>
            </div>
            <div><label className="form-label">Department *</label>
              <select {...register("department")}>{DEPTS.map(d=><option key={d}>{d}</option>)}</select>
            </div>
            <div className="col-span-2"><label className="form-label">Address</label><input {...register("address")} placeholder="Street, City, State" /></div>
            <div><label className="form-label">Known Allergies</label><input {...register("allergies")} placeholder="e.g. Penicillin" /></div>
            <div><label className="form-label">Chronic Conditions</label><input {...register("chronic_conditions")} placeholder="e.g. Diabetes" /></div>
            <div><label className="form-label">Emergency Contact</label><input {...register("emergency_contact")} /></div>
            <div><label className="form-label">Emergency Phone</label><input {...register("emergency_phone")} /></div>
            <div><label className="form-label">Insurance Provider</label><input {...register("insurance_provider")} /></div>
            <div><label className="form-label">Policy / Member ID</label><input {...register("insurance_number")} /></div>
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
