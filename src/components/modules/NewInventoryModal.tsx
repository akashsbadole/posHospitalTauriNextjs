"use client";
import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createInventoryItem } from "@/lib/tauri";
import { toast } from "sonner";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.string().min(1, "Category is required"),
  current_stock: z.number().min(0, "Stock cannot be negative"),
  min_threshold: z.number().min(0, "Threshold cannot be negative"),
  max_capacity: z.number().min(1, "Max capacity must be at least 1"),
  unit: z.string().min(1, "Unit is required"),
  unit_price: z.number().min(0, "Price cannot be negative"),
  supplier: z.string().optional(),
  expiry_date: z.string().optional(),
  location: z.string().optional(),
});

type F = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
}

const CATEGORIES = ["Medicine", "Consumable", "Equipment", "Lab Reagent", "PPE"];
const UNITS = ["pcs", "ml", "mg", "tablets", "capsules", "vials", "packs", "boxes"];

export function NewInventoryModal({ open, onClose }: Props) {
  const qc = useQueryClient();

  const { register, handleSubmit, formState: { errors }, reset } = useForm<F>({
    resolver: zodResolver(schema),
    defaultValues: {
      current_stock: 0,
      min_threshold: 10,
      max_capacity: 500,
      unit_price: 0,
      category: "Medicine",
      unit: "pcs",
    },
  });

  const createMut = useMutation({
    mutationFn: (data: F) => createInventoryItem(data as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["low-stock"] });
      toast.success("Inventory item added!");
      onClose();
      reset();
    },
    onError: () => toast.error("Failed to add item"),
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center anim-fade-in">
      <div className="bg-surface border border-border2 rounded-2xl w-[520px] max-h-[90vh] flex flex-col shadow-card">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-display font-bold text-base">Add Inventory Item</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit((d) => createMut.mutate(d))} className="flex-1 overflow-y-auto p-6">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="form-label">Item Name *</label>
                <input {...register("name")} placeholder="e.g., Paracetamol 500mg" className="w-full" />
                {errors.name && <p className="form-error">{errors.name.message}</p>}
              </div>

              <div>
                <label className="form-label">Category *</label>
                <select {...register("category")} className="w-full">
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="form-label">Unit *</label>
                <select {...register("unit")} className="w-full">
                  {UNITS.map(u => <option key={u}>{u}</option>)}
                </select>
              </div>

              <div>
                <label className="form-label">Current Stock *</label>
                <input type="number" {...register("current_stock", { valueAsNumber: true })} className="w-full" />
              </div>

              <div>
                <label className="form-label">Min Threshold *</label>
                <input type="number" {...register("min_threshold", { valueAsNumber: true })} className="w-full" />
              </div>

              <div>
                <label className="form-label">Max Capacity *</label>
                <input type="number" {...register("max_capacity", { valueAsNumber: true })} className="w-full" />
              </div>

              <div>
                <label className="form-label">Unit Price (₹) *</label>
                <input type="number" step="0.01" {...register("unit_price", { valueAsNumber: true })} className="w-full" />
              </div>

              <div>
                <label className="form-label">Supplier</label>
                <input {...register("supplier")} placeholder="Supplier name" className="w-full" />
              </div>

              <div>
                <label className="form-label">Expiry Date</label>
                <input type="date" {...register("expiry_date")} className="w-full" />
              </div>

              <div className="col-span-2">
                <label className="form-label">Location</label>
                <input {...register("location")} placeholder="e.g., Shelf A-1, Rack 3" className="w-full" />
              </div>
            </div>
          </div>
        </form>

        <div className="px-6 py-4 border-t border-border flex gap-3 justify-end">
          <button onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button onClick={handleSubmit((d) => createMut.mutate(d))} className="btn btn-primary">
            {createMut.isPending ? "Adding..." : "Add Item"}
          </button>
        </div>
      </div>
    </div>
  );
}
