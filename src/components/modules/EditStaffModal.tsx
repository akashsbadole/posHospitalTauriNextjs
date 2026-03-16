"use client";
import { useEffect } from "react";
import { X } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateStaff } from "@/lib/tauri";
import { toast } from "sonner";
import type { Staff } from "@/types";

const schema = z.object({
  full_name: z.string().min(2, "Name is required"),
  role: z.string().min(1, "Role is required"),
  department: z.string().min(1, "Department is required"),
  phone: z.string().min(10, "Valid phone required"),
  email: z.string().email().optional().or(z.literal("")),
  shift: z.string(),
  join_date: z.string().optional(),
  salary: z.number().optional(),
  status: z.string(),
});

type F = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  staffMember: Staff | null;
}

const ROLES = ["Nurse", "Technician", "Admin Staff", "Receptionist", "Pharmacist", "Lab Assistant", "Ward Boy", "Security", "Driver", "Cleaner"];
const DEPARTMENTS = ["General Medicine", "Cardiology", "Neurology", "Orthopedics", "Gynecology", "Pediatrics", "Radiology", "Emergency", "ICU", "Pharmacy", "Lab", "Administration"];
const SHIFTS = ["Morning", "Evening", "Night", "Part-time"];
const STATUSES = ["Active", "On Leave", "Terminated"];

export function EditStaffModal({ open, onClose, staffMember }: Props) {
  const qc = useQueryClient();

  const { register, handleSubmit, formState: { errors }, reset, setValue } = useForm<F>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (staffMember) {
      setValue("full_name", staffMember.full_name);
      setValue("role", staffMember.role);
      setValue("department", staffMember.department || "");
      setValue("phone", staffMember.phone);
      setValue("email", staffMember.email || "");
      setValue("shift", staffMember.shift);
      setValue("join_date", staffMember.join_date || "");
      setValue("salary", staffMember.salary);
      setValue("status", staffMember.status);
    }
  }, [staffMember, setValue]);

  const updateMut = useMutation({
    mutationFn: (data: F) => updateStaff(staffMember!.id, data as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff"] });
      toast.success("Staff updated!");
      onClose();
    },
    onError: () => toast.error("Failed to update staff"),
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center anim-fade-in">
      <div className="bg-surface border border-border2 rounded-2xl w-[500px] max-h-[85vh] flex flex-col shadow-card">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="font-display font-bold text-base">Edit Staff</h2>
            <p className="text-[12px] text-muted mt-0.5">Update staff member details</p>
          </div>
          <button onClick={onClose} className="text-subtle hover:text-white"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit(d => updateMut.mutate(d))} className="overflow-y-auto flex-1 p-6 space-y-4">
          <div>
            <label className="form-label">Full Name *</label>
            <input {...register("full_name")} className="w-full" placeholder="John Doe" />
            {errors.full_name && <p className="form-error">{errors.full_name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Role *</label>
              <select {...register("role")} className="w-full">
                {ROLES.map(r => <option key={r}>{r}</option>)}
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
              <label className="form-label">Phone *</label>
              <input {...register("phone")} className="w-full" placeholder="+91 9876543210" />
              {errors.phone && <p className="form-error">{errors.phone.message}</p>}
            </div>
            <div>
              <label className="form-label">Email</label>
              <input {...register("email")} className="w-full" placeholder="staff@hospital.com" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Shift</label>
              <select {...register("shift")} className="w-full">
                {SHIFTS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Join Date</label>
              <input type="date" {...register("join_date")} className="w-full" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Monthly Salary (₹)</label>
              <input type="number" {...register("salary", { valueAsNumber: true })} className="w-full" placeholder="25000" />
            </div>
            <div>
              <label className="form-label">Status</label>
              <select {...register("status")} className="w-full">
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="pt-4 flex gap-3 justify-end">
            <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
            <button type="submit" className="btn btn-primary">{updateMut.isPending ? "Saving..." : "Save Changes"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
