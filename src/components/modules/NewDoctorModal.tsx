"use client";
import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createDoctor } from "@/lib/tauri";
import { toast } from "sonner";

const schema = z.object({
  full_name: z.string().min(1, "Name is required"),
  specialization: z.string().min(1, "Specialization is required"),
  phone: z.string().min(10, "Valid phone required"),
  email: z.string().email("Invalid email"),
  qualification: z.string().min(1, "Qualification required"),
  shift: z.string().min(1, "Shift is required"),
  experience_years: z.number().min(0),
  consultation_fee: z.number().min(0),
});

type F = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
}

const DEPARTMENTS = ["General Medicine", "Cardiology", "Neurology", "Orthopedics", "Gynecology", "Pediatrics", "Radiology", "ENT", "Dermatology", "Oncology", "Psychiatry", "Urology"];
const SHIFTS = ["Morning", "Evening", "Night"];

export function NewDoctorModal({ open, onClose }: Props) {
  const qc = useQueryClient();

  const { register, handleSubmit, formState: { errors }, reset } = useForm<F>({
    resolver: zodResolver(schema),
    defaultValues: {
      shift: "Morning",
      experience_years: 0,
      consultation_fee: 500,
    },
  });

  const createMut = useMutation({
    mutationFn: (data: F) => createDoctor({ ...data, availability_status: "Available" } as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["doctors"] });
      toast.success("Doctor added!");
      onClose();
      reset();
    },
    onError: (error: unknown) => {
    if (error instanceof Error) {
      toast.error(error.message)
    } else {
      toast.error("Failed to add doctor - unknown error occurred")
    }
  },
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center anim-fade-in">
      <div className="bg-surface border border-border2 rounded-2xl w-[520px] max-h-[90vh] flex flex-col shadow-card">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-display font-bold text-base">Add Doctor</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit((d) => createMut.mutate(d))} className="flex-1 overflow-y-auto p-6">
          <div className="space-y-4">
            <div>
              <label className="form-label">Full Name *</label>
              <input {...register("full_name")} className="w-full" />
              {errors.full_name && <p className="form-error">{errors.full_name.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Specialization *</label>
                <select {...register("specialization")} className="w-full">
                  {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>

              <div>
                <label className="form-label">Qualification *</label>
                <input {...register("qualification")} placeholder="e.g., MD, MBBS" className="w-full" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Phone *</label>
                <input {...register("phone")} className="w-full" />
                {errors.phone && <p className="form-error">{errors.phone.message}</p>}
              </div>

              <div>
                <label className="form-label">Email *</label>
                <input {...register("email")} type="email" className="w-full" />
                {errors.email && <p className="form-error">{errors.email.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Shift *</label>
                <select {...register("shift")} className="w-full">
                  {SHIFTS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>

              <div>
                <label className="form-label">Experience (years)</label>
                <input type="number" {...register("experience_years", { valueAsNumber: true })} className="w-full" />
              </div>
            </div>

            <div>
              <label className="form-label">Consultation Fee (₹)</label>
              <input type="number" {...register("consultation_fee", { valueAsNumber: true })} className="w-full" />
            </div>
          </div>
        </form>

        <div className="px-6 py-4 border-t border-border flex gap-3 justify-end">
          <button onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button onClick={handleSubmit((d) => createMut.mutate(d))} className="btn btn-primary">
            {createMut.isPending ? "Adding..." : "Add Doctor"}
          </button>
        </div>
      </div>
    </div>
  );
}
