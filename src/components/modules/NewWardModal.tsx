"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createWardWithBeds } from "@/lib/tauri";
import { toast } from "sonner";

const schema = z.object({
  ward_name: z.string().min(1, "Ward name is required"),
  ward_type: z.string().min(1, "Ward type is required"),
  department: z.string().min(1, "Department is required"),
  total_beds: z.number().min(1, "At least 1 bed required").max(100, "Maximum 100 beds"),
  base_charge: z.number().min(0, "Charge must be positive"),
});

type F = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
}

const WARD_TYPES = ["General", "ICU", "NICU", "Pediatric", "Maternity", "Surgical", "Isolation"];
const DEPARTMENTS = ["General Medicine", "Cardiology", "Neurology", "Orthopedics", "Gynecology", "Pediatrics", "Radiology", "Emergency", "ICU", "Surgery"];

export function NewWardModal({ open, onClose }: Props) {
  const qc = useQueryClient();

  const { register, handleSubmit, formState: { errors }, reset } = useForm<F>({
    resolver: zodResolver(schema),
    defaultValues: {
      ward_type: "General",
      department: "General Medicine",
      total_beds: 10,
      base_charge: 500,
    },
  });

  const createMut = useMutation({
    mutationFn: (data: F) => createWardWithBeds(data as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wards"] });
      qc.invalidateQueries({ queryKey: ["beds"] });
      toast.success("Ward created with beds!");
      onClose();
      reset();
    },
    onError: () => toast.error("Failed to create ward"),
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center anim-fade-in">
      <div className="bg-surface border border-border2 rounded-2xl w-[450px] max-h-[90vh] flex flex-col shadow-card">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-display font-bold text-base">Add New Ward</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit((d) => createMut.mutate(d))} className="flex-1 overflow-y-auto p-6">
          <div className="space-y-4">
            <div>
              <label className="form-label">Ward Name *</label>
              <input {...register("ward_name")} placeholder="e.g., Ward A, ICU" className="w-full" />
              {errors.ward_name && <p className="form-error">{errors.ward_name.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Ward Type *</label>
                <select {...register("ward_type")} className="w-full">
                  {WARD_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>

              <div>
                <label className="form-label">Department *</label>
                <select {...register("department")} className="w-full">
                  {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Number of Beds *</label>
                <input type="number" {...register("total_beds", { valueAsNumber: true })} className="w-full" min={1} max={100} />
                {errors.total_beds && <p className="form-error">{errors.total_beds.message}</p>}
              </div>
              <div>
                <label className="form-label">Base Charge / Day (₹) *</label>
                <input type="number" {...register("base_charge", { valueAsNumber: true })} className="w-full" />
                {errors.base_charge && <p className="form-error">{errors.base_charge.message}</p>}
              </div>
              <p className="col-span-2 text-[11px] text-muted -mt-2">Beds will be automatically generated (001, 002, ...)</p>
            </div>
          </div>
        </form>

        <div className="px-6 py-4 border-t border-border flex gap-3 justify-end">
          <button onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button onClick={handleSubmit((d) => createMut.mutate(d))} className="btn btn-primary">
            {createMut.isPending ? "Creating..." : "Create Ward"}
          </button>
        </div>
      </div>
    </div>
  );
}
