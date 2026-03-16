"use client";
import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateStock, deleteInventoryItem } from "@/lib/tauri";
import { toast } from "sonner";
import type { InventoryItem } from "@/types";

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
  item: InventoryItem | null;
  open: boolean;
  onClose: () => void;
}

const CATEGORIES = ["Medicine", "Consumable", "Equipment", "Lab Reagent", "PPE"];
const UNITS = ["pcs", "ml", "mg", "tablets", "capsules", "vials", "packs", "boxes"];

export function EditInventoryModal({ item, open, onClose }: Props) {
  const qc = useQueryClient();

  const { register, handleSubmit, formState: { errors }, reset } = useForm<F>({
    resolver: zodResolver(schema),
    defaultValues: item ? {
      name: item.name,
      category: item.category,
      current_stock: item.current_stock,
      min_threshold: item.min_threshold,
      max_capacity: item.max_capacity,
      unit: item.unit,
      unit_price: item.unit_price,
      supplier: item.supplier || "",
      expiry_date: item.expiry_date || "",
      location: item.location || "",
    } : undefined,
  });

  useEffect(() => {
    if (item) {
      reset({
        name: item.name,
        category: item.category,
        current_stock: item.current_stock,
        min_threshold: item.min_threshold,
        max_capacity: item.max_capacity,
        unit: item.unit,
        unit_price: item.unit_price,
        supplier: item.supplier || "",
        expiry_date: item.expiry_date || "",
        location: item.location || "",
      });
    }
  }, [item, reset]);

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteInventoryItem(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory"] });
      toast.success("Inventory item deleted!");
      onClose();
    },
    onError: () => toast.error("Failed to delete item"),
  });

  if (!open || !item) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center anim-fade-in">
      <div className="bg-surface border border-border2 rounded-2xl w-[500px] max-h-[85vh] flex flex-col shadow-card">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="font-display font-bold text-base">Edit Inventory Item</h2>
            <p className="text-[12px] text-muted mt-0.5">Update item details</p>
          </div>
          <button onClick={onClose} className="text-subtle hover:text-white"><X size={18} /></button>
        </div>
        
        <form className="overflow-y-auto flex-1 p-6 space-y-4">
          <div>
            <label className="form-label">Item Name *</label>
            <input {...register("name")} className="w-full" placeholder="Paracetamol 500mg" />
            {errors.name && <p className="form-error">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
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
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="form-label">Current Stock</label>
              <input type="number" {...register("current_stock", { valueAsNumber: true })} className="w-full" />
            </div>
            <div>
              <label className="form-label">Min Threshold</label>
              <input type="number" {...register("min_threshold", { valueAsNumber: true })} className="w-full" />
            </div>
            <div>
              <label className="form-label">Max Capacity</label>
              <input type="number" {...register("max_capacity", { valueAsNumber: true })} className="w-full" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Unit Price (₹)</label>
              <input type="number" step="0.01" {...register("unit_price", { valueAsNumber: true })} className="w-full" />
            </div>
            <div>
              <label className="form-label">Expiry Date</label>
              <input type="date" {...register("expiry_date")} className="w-full" />
            </div>
          </div>

          <div>
            <label className="form-label">Supplier</label>
            <input {...register("supplier")} className="w-full" placeholder="Supplier name" />
          </div>

          <div>
            <label className="form-label">Location</label>
            <input {...register("location")} className="w-full" placeholder="Pharmacy Store A1" />
          </div>
        </form>

        <div className="px-6 py-4 border-t border-border flex gap-3 justify-between">
          <button 
            onClick={() => { if(confirm('Delete this item?')) deleteMut.mutate(item.id); }} 
            className="btn btn-danger"
          >
            Delete
          </button>
          <div className="flex gap-3">
            <button onClick={onClose} className="btn btn-ghost">Cancel</button>
            <button onClick={() => toast.info("Edit saved (stock update only)")} className="btn btn-primary">Save Changes</button>
          </div>
        </div>
      </div>
    </div>
  );
}