"use client";
import { useState, useEffect } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createInvoice, getPatients, getPatientVisits, getVisitCharges } from "@/lib/tauri";
import { toast } from "sonner";
import type { Patient, Visit } from "@/types";

const schema = z.object({
  patient_id: z.number().min(1, "Patient is required"),
  due_date: z.string().min(1, "Due date is required"),
  discount: z.number().optional(),
  cgst_rate: z.number().optional(),
  sgst_rate: z.number().optional(),
  igst_rate: z.number().optional(),
  payment_method: z.string().optional(),
  notes: z.string().optional(),
  visit_id: z.number().optional().nullable(),
});

type F = z.infer<typeof schema>;

interface InvoiceItem {
  id: string;
  description: string;
  category: string;
  hsn_code: string;
  quantity: number;
  unit_price: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const CATEGORIES = ["Consultation", "Lab", "Surgery", "Pharmacy", "Ward", "Radiology", "Procedure"];
const PAYMENT_METHODS = ["Cash", "Card", "UPI", "Insurance", "Net Banking", "Cheque"];

export function NewInvoiceModal({ open, onClose }: Props) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientSearch, setPatientSearch] = useState("");
  const [patientVisits, setPatientVisits] = useState<Visit[]>([]);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const qc = useQueryClient();

  const { register, handleSubmit, formState: { errors }, reset, setValue, watch } = useForm<F>({
    resolver: zodResolver(schema),
    defaultValues: {
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      discount: 0,
      cgst_rate: 0,
      sgst_rate: 0,
      igst_rate: 0,
      payment_method: "Cash",
    },
  });

  const selectedPatientId = watch("patient_id");
  const selectedVisitId = watch("visit_id");

  useEffect(() => {
    if (open) {
      getPatients().then(setPatients);
    }
  }, [open]);

  useEffect(() => {
    if (selectedPatientId) {
      getPatientVisits(selectedPatientId).then(setPatientVisits);
    } else {
      setPatientVisits([]);
    }
  }, [selectedPatientId]);

  useEffect(() => {
    if (selectedVisitId) {
      getVisitCharges(selectedVisitId).then(data => {
        const newItems = data.items.map(item => ({
          id: Math.random().toString(36).substr(2, 9),
          description: item.description,
          category: item.category,
          quantity: item.quantity,
          unit_price: item.quantity > 0 ? item.amount / item.quantity : item.amount,
        }));
        setItems(newItems);
      }).catch(err => {
        console.error("Failed to fetch visit charges:", err);
      });
    }
  }, [selectedVisitId]);

  const filteredPatients = patients.filter(p => 
    p.full_name.toLowerCase().includes(patientSearch.toLowerCase()) ||
    p.patient_code.toLowerCase().includes(patientSearch.toLowerCase())
  );

  const selectedPatient = patients.find(p => p.id === selectedPatientId);

  const addItem = () => {
    setItems([...items, {
      id: Math.random().toString(36).substr(2, 9),
      description: "",
      category: "Consultation",
      hsn_code: "",
      quantity: 1,
      unit_price: 0,
    }]);
  };

  const updateItem = (id: string, field: keyof InvoiceItem, value: any) => {
    setItems(items.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const removeItem = (id: string) => {
    setItems(items.filter(i => i.id !== id));
  };

  const subtotal = items.reduce((sum, i) => sum + (i.quantity * i.unit_price), 0);
  const discount = watch("discount") || 0;
  const cgst_rate = watch("cgst_rate") || 0;
  const sgst_rate = watch("sgst_rate") || 0;
  const igst_rate = watch("igst_rate") || 0;
  const tax = subtotal * (cgst_rate + sgst_rate + igst_rate) / 100;
  const total = subtotal - discount + tax;

  const createMut = useMutation({
    mutationFn: async (data: F) => {
      const validItems = items.filter(i => i.description && i.quantity > 0 && i.unit_price > 0);
      if (validItems.length === 0) throw new Error("At least one item is required");
      
      const itemsData = validItems.map(i => ({
        description: i.description,
        category: i.category,
        hsn_code: i.hsn_code || undefined,
        quantity: i.quantity,
        unit_price: i.unit_price,
        total: i.quantity * i.unit_price,
      }));
      
      return createInvoice({
        patient_id: data.patient_id,
        issue_date: new Date().toISOString().split("T")[0],
        due_date: data.due_date,
        discount: data.discount || 0,
        cgst_rate: data.cgst_rate || 0,
        sgst_rate: data.sgst_rate || 0,
        igst_rate: data.igst_rate || 0,
        payment_method: data.payment_method,
        notes: data.notes,
        visit_id: data.visit_id || undefined,
      } as any, itemsData as any);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["patient-visits"] });
      toast.success("Invoice created!");
      onClose();
      reset();
      setItems([]);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to create invoice"),
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center anim-fade-in">
      <div className="bg-surface border border-border2 rounded-2xl w-[700px] max-h-[90vh] flex flex-col shadow-card">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-display font-bold text-base">Create Invoice</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        <form className="flex-1 overflow-y-auto p-6">
          <div className="space-y-4 mb-6">
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Due Date *</label>
                <input type="date" {...register("due_date")} className="w-full" />
              </div>
              <div>
                <label className="form-label">Payment Method</label>
                <select {...register("payment_method")} className="w-full">
                  {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>

              <div className="col-span-2">
                <label className="form-label">Link to Visit</label>
                <select {...register("visit_id", { valueAsNumber: true })} className="w-full">
                  <option value="">No link / New Visit</option>
                  {patientVisits.filter(v => v.status !== "COMPLETED").map(v => (
                    <option key={v.id} value={v.id}>{v.visit_code} - {v.status} ({v.doctor_name})</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <label className="form-label mb-0">Invoice Items</label>
              <button type="button" onClick={addItem} className="btn btn-ghost btn-sm">
                <Plus size={12} /> Add Item
              </button>
            </div>

            {items.length === 0 ? (
              <div className="text-center py-8 text-muted text-sm border border-dashed border-border rounded-lg">
                No items added. Click "Add Item" to add line items.
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2 text-xs text-subtle px-2">
                  <div className="col-span-4">Description / HSN</div>
                  <div className="col-span-2">Category</div>
                  <div className="col-span-2">Qty</div>
                  <div className="col-span-2">Price</div>
                  <div className="col-span-1">Total</div>
                  <div className="col-span-1"></div>
                </div>
                {items.map(item => (
                  <div key={item.id} className="grid grid-cols-12 gap-2 items-center bg-surface2 border border-border rounded-lg p-2">
                    <div className="col-span-4 space-y-1">
                      <input
                        value={item.description}
                        onChange={(e) => updateItem(item.id, "description", e.target.value)}
                        placeholder="Item description"
                        className="w-full bg-transparent text-sm"
                      />
                      <input
                        value={item.hsn_code}
                        onChange={(e) => updateItem(item.id, "hsn_code", e.target.value)}
                        placeholder="HSN Code"
                        className="w-full bg-transparent text-[10px] text-muted uppercase"
                      />
                    </div>
                    <select
                      value={item.category}
                      onChange={(e) => updateItem(item.id, "category", e.target.value)}
                      className="col-span-2 bg-transparent text-xs"
                    >
                      {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateItem(item.id, "quantity", parseInt(e.target.value) || 0)}
                      className="col-span-2 bg-transparent text-sm text-right"
                    />
                    <input
                      type="number"
                      value={item.unit_price}
                      onChange={(e) => updateItem(item.id, "unit_price", parseFloat(e.target.value) || 0)}
                      className="col-span-2 bg-transparent text-sm text-right"
                    />
                    <div className="col-span-1 text-sm text-right">₹{(item.quantity * item.unit_price).toFixed(0)}</div>
                    <button type="button" onClick={() => removeItem(item.id)} className="col-span-1 text-danger hover:text-red-400 flex justify-end">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-4 gap-4 mb-4">
            <div>
              <label className="form-label">Discount (₹)</label>
              <input type="number" {...register("discount", { valueAsNumber: true })} className="w-full" />
            </div>
            <div>
              <label className="form-label">CGST (%)</label>
              <input type="number" {...register("cgst_rate", { valueAsNumber: true })} className="w-full" />
            </div>
            <div>
              <label className="form-label">SGST (%)</label>
              <input type="number" {...register("sgst_rate", { valueAsNumber: true })} className="w-full" />
            </div>
            <div>
              <label className="form-label">Total</label>
              <div className="text-xl font-display font-bold text-accent">₹{total.toFixed(2)}</div>
            </div>
          </div>

          <div>
            <label className="form-label">Notes</label>
            <textarea {...register("notes")} rows={2} className="w-full" placeholder="Invoice notes..." />
          </div>
        </form>

        <div className="px-6 py-4 border-t border-border flex gap-3 justify-end">
          <button onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button onClick={handleSubmit((d) => createMut.mutate(d))} className="btn btn-primary">
            {createMut.isPending ? "Creating..." : "Create Invoice"}
          </button>
        </div>
      </div>
    </div>
  );
}
