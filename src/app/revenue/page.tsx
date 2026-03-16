"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPaymentBatches, createPaymentBatch, addPaymentBatchItem, getInvoices } from "@/lib/tauri";
import { toast } from "sonner";
import { Wallet, Plus, CreditCard, DollarSign } from "lucide-react";

export default function RevenuePage() {
  const [showAddBatch, setShowAddBatch] = useState(false);
  const [showAddItem, setShowAddItem] = useState<number | null>(null);
  const qc = useQueryClient();

  const { data: batches = [], isLoading } = useQuery({ queryKey: ["payment-batches"], queryFn: getPaymentBatches });
  const { data: invoices = [] } = useQuery({ queryKey: ["invoices"], queryFn: () => getInvoices() });

  const createBatchMut = useMutation({ mutationFn: createPaymentBatch, onSuccess: () => { qc.invalidateQueries({ queryKey: ["payment-batches"] }); toast.success("Batch created!"); setShowAddBatch(false); }, onError: () => toast.error("Failed") });
  const addItemMut = useMutation({ mutationFn: (data: { batch_id: number; invoice_id: number; amount: number; payment_method: string }) => addPaymentBatchItem(data.batch_id, data.invoice_id, data.amount, data.payment_method), onSuccess: () => { qc.invalidateQueries({ queryKey: ["payment-batches"] }); toast.success("Invoice added to batch!"); setShowAddItem(null); }, onError: () => toast.error("Failed") });

  const totalCollected = batches.reduce((sum, b) => sum + b.total_amount, 0);
  const completed = batches.filter(b => b.status === "Completed").length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Revenue Cycle</h1>
          <p className="page-subtitle">Payment batches, collections & reconciliation</p>
        </div>
        <button onClick={() => setShowAddBatch(true)} className="btn btn-primary"><Plus size={16} /> New Batch</button>
      </div>

      <div className="grid grid-cols-4 gap-3.5 mb-5">
        <div className="stat-card anim-fade-up d1">
          <div className="stat-value text-accent">₹{(totalCollected / 100000).toFixed(1)}L</div>
          <div className="stat-label">Total Collected</div>
        </div>
        <div className="stat-card anim-fade-up d2">
          <div className="stat-value text-success">{batches.length}</div>
          <div className="stat-label">Total Batches</div>
        </div>
        <div className="stat-card anim-fade-up d3">
          <div className="stat-value text-warning">{completed}</div>
          <div className="stat-label">Completed</div>
        </div>
        <div className="stat-card anim-fade-up d4">
          <div className="stat-value text-purple">₹{invoices.filter(i => i.status === "Pending").reduce((s, i) => s + i.balance, 0).toLocaleString()}</div>
          <div className="stat-label">Pending Receivables</div>
        </div>
      </div>

      <div className="card">
        {isLoading ? <div className="py-12 text-center text-muted">Loading...</div> : (
          <table className="data-table">
            <thead><tr><th>Batch Code</th><th>Date</th><th>Invoices</th><th>Total Amount</th><th>Status</th><th>Created By</th><th>Actions</th></tr></thead>
            <tbody>
              {batches.map(b => (
                <tr key={b.id}>
                  <td className="font-mono text-subtle">{b.batch_code}</td>
                  <td>{b.batch_date}</td>
                  <td>{b.total_count}</td>
                  <td className="font-medium text-white">₹{b.total_amount.toLocaleString()}</td>
                  <td><span className={`badge ${b.status === "Completed" ? "badge-green" : b.status === "Pending" ? "badge-yellow" : "badge-gray"}`}>{b.status}</span></td>
                  <td className="text-muted">{b.created_by || "-"}</td>
                  <td>
                    <button onClick={() => setShowAddItem(b.id)} className="btn btn-sm btn-ghost"><Plus size={14} /> Add Invoice</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAddBatch && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-surface border border-border2 rounded-2xl w-[400px] p-6 space-y-4">
            <h2 className="font-display font-bold text-lg">Create Payment Batch</h2>
            <form onSubmit={e => { e.preventDefault(); const f = e.target as HTMLFormElement; createBatchMut.mutate({ batch_date: (f.elements.namedItem("batch_date") as HTMLInputElement).value, created_by: (f.elements.namedItem("created_by") as HTMLInputElement).value || undefined }); }}>
              <div className="space-y-4">
                <div><label className="form-label">Batch Date *</label><input name="batch_date" type="date" required className="input" defaultValue={new Date().toISOString().split("T")[0]} /></div>
                <div><label className="form-label">Created By</label><input name="created_by" className="input" placeholder="Staff name" /></div>
                <div className="flex gap-3 justify-end pt-2">
                  <button type="button" onClick={() => setShowAddBatch(false)} className="btn btn-ghost">Cancel</button>
                  <button type="submit" className="btn btn-primary">Create</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddItem !== null && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-surface border border-border2 rounded-2xl w-[500px] p-6 space-y-4">
            <h2 className="font-display font-bold text-lg">Add Invoice to Batch</h2>
            <form onSubmit={e => { e.preventDefault(); const f = e.target as HTMLFormElement; addItemMut.mutate({ batch_id: showAddItem, invoice_id: parseInt((f.elements.namedItem("invoice_id") as HTMLSelectElement).value), amount: parseFloat((f.elements.namedItem("amount") as HTMLInputElement).value), payment_method: (f.elements.namedItem("payment_method") as HTMLSelectElement).value }); }}>
              <div className="space-y-4">
                <div><label className="form-label">Invoice *</label><select name="invoice_id" required className="select"><option value="">Select Invoice</option>{invoices.filter(i => i.status !== "Paid").map(i => <option key={i.id} value={i.id}>{i.invoice_code} - {i.patient_name} - ₹{i.balance}</option>)}</select></div>
                <div><label className="form-label">Amount *</label><input name="amount" type="number" step="0.01" required className="input" /></div>
                <div><label className="form-label">Payment Method *</label><select name="payment_method" required className="select"><option value="Cash">Cash</option><option value="Card">Card</option><option value="UPI">UPI</option><option value="Net Banking">Net Banking</option><option value="Cheque">Cheque</option></select></div>
                <div className="flex gap-3 justify-end pt-2">
                  <button type="button" onClick={() => setShowAddItem(null)} className="btn btn-ghost">Cancel</button>
                  <button type="submit" className="btn btn-primary">Add</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
