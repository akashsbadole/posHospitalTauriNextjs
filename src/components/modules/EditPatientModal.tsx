"use client";
import { useState, useEffect } from "react";
import { X, Sparkles } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updatePatient, getDoctors, getNextAvailableDoctor } from "@/lib/tauri";
import { toast } from "sonner";
import type { Patient, Doctor, Department, BloodGroup } from "@/types";

const schema = z.object({
  full_name: z.string().min(2, "Name is required"),
  dob: z.string().min(1, "Date of birth is required"),
  gender: z.enum(["Male", "Female", "Other"]),
  phone: z.string().min(10, "Valid phone required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  blood_group: z.string(),
  address: z.string().optional(),
  emergency_contact: z.string().optional(),
  emergency_phone: z.string().optional(),
  allergies: z.string().optional(),
  chronic_conditions: z.string().optional(),
  department: z.string(),
  assigned_doctor_id: z.number().optional(),
  insurance_provider: z.string().optional(),
  insurance_number: z.string().optional(),
});

type F = z.infer<typeof schema>;

interface Props {
  patient: Patient;
  open: boolean;
  onClose: () => void;
}

export function EditPatientModal({ patient, open, onClose }: Props) {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const qc = useQueryClient();

  const { register, handleSubmit, formState: { errors }, reset, setValue, watch } = useForm<F>({
    resolver: zodResolver(schema),
  });

  const selectedDept = watch("department");

  const autoAssignDoctor = async () => {
    try {
      const doc = await getNextAvailableDoctor(selectedDept);
      setValue("assigned_doctor_id", doc.id);
      toast.success(`Auto-assigned ${doc.full_name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No available doctor found");
    }
  };

  useEffect(() => {
    if (open) {
      getDoctors().then(setDoctors);
      reset({
        full_name: patient.full_name,
        dob: patient.dob,
        gender: patient.gender,
        phone: patient.phone,
        email: patient.email || "",
        blood_group: patient.blood_group,
        address: patient.address || "",
        emergency_contact: patient.emergency_contact || "",
        emergency_phone: patient.emergency_phone || "",
        allergies: patient.allergies || "",
        chronic_conditions: patient.chronic_conditions || "",
        department: patient.department,
        assigned_doctor_id: patient.assigned_doctor_id,
        insurance_provider: patient.insurance_provider || "",
        insurance_number: patient.insurance_number || "",
      });
    }
  }, [open, patient, reset]);

  const updateMut = useMutation({
    mutationFn: (data: F) => updatePatient(patient.id, data as Partial<Patient>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patients"] });
      toast.success("Patient updated successfully");
      onClose();
    },
    onError: () => toast.error("Update failed"),
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center anim-fade-in">
      <div className="bg-surface border border-border2 rounded-2xl w-[640px] max-h-[90vh] flex flex-col shadow-card">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-display font-bold text-base">Edit Patient</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        
        <form onSubmit={handleSubmit((d) => updateMut.mutate(d))} className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="form-label">Full Name *</label>
              <input {...register("full_name")} className="w-full" />
              {errors.full_name && <p className="form-error">{errors.full_name.message}</p>}
            </div>
            
            <div>
              <label className="form-label">Date of Birth *</label>
              <input type="date" {...register("dob")} className="w-full" />
              {errors.dob && <p className="form-error">{errors.dob.message}</p>}
            </div>
            
            <div>
              <label className="form-label">Gender *</label>
              <select {...register("gender")} className="w-full">
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
            
            <div>
              <label className="form-label">Phone *</label>
              <input {...register("phone")} className="w-full" />
              {errors.phone && <p className="form-error">{errors.phone.message}</p>}
            </div>
            
            <div>
              <label className="form-label">Email</label>
              <input type="email" {...register("email")} className="w-full" />
            </div>
            
            <div>
              <label className="form-label">Blood Group *</label>
              <select {...register("blood_group")} className="w-full">
                {["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"].map(bg => (
                  <option key={bg} value={bg}>{bg}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="form-label">Department *</label>
              <select {...register("department")} className="w-full">
                {["General Medicine", "Cardiology", "Neurology", "Orthopedics", "Gynecology", "Pediatrics", "Radiology", "ENT", "Dermatology", "Oncology", "Psychiatry", "Urology"].map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="form-label mb-0">Assigned Doctor</label>
                <button
                  type="button"
                  onClick={autoAssignDoctor}
                  className="text-[10px] text-accent flex items-center gap-0.5 hover:underline"
                >
                  <Sparkles size={10} /> Auto-Assign
                </button>
              </div>
              <select {...register("assigned_doctor_id", { valueAsNumber: true })} className="w-full">
                <option value="">Select Doctor</option>
                {doctors.map(d => (
                  <option key={d.id} value={d.id}>{d.full_name} - {d.specialization}</option>
                ))}
              </select>
            </div>
            
            <div className="col-span-2">
              <label className="form-label">Address</label>
              <textarea {...register("address")} rows={2} className="w-full" />
            </div>
            
            <div>
              <label className="form-label">Emergency Contact</label>
              <input {...register("emergency_contact")} className="w-full" />
            </div>
            
            <div>
              <label className="form-label">Emergency Phone</label>
              <input {...register("emergency_phone")} className="w-full" />
            </div>
            
            <div>
              <label className="form-label">Allergies</label>
              <input {...register("allergies")} placeholder="e.g., Penicillin, Pollen" className="w-full" />
            </div>
            
            <div>
              <label className="form-label">Chronic Conditions</label>
              <input {...register("chronic_conditions")} placeholder="e.g., Diabetes, Hypertension" className="w-full" />
            </div>
            
            <div>
              <label className="form-label">Insurance Provider</label>
              <input {...register("insurance_provider")} className="w-full" />
            </div>
            
            <div>
              <label className="form-label">Policy Number</label>
              <input {...register("insurance_number")} className="w-full" />
            </div>
          </div>
        </form>
        
        <div className="px-6 py-4 border-t border-border flex gap-3 justify-end">
          <button onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button onClick={handleSubmit((d) => updateMut.mutate(d))} className="btn btn-primary">
            {updateMut.isPending ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
