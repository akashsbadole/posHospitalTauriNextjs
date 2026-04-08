"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getExpenseCategories, createExpenseCategory, getExpenses, createExpense, updateExpense, deleteExpense } from "@/lib/tauri";
import { toast } from "sonner";
import { DollarSign, Plus, Receipt, Edit, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/modules/ConfirmDialog";

export default function ExpensesPage() {
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [editExpense, setEditExpense] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const qc = useQueryClient();

  const { data: categories = [] } = useQuery({ queryKey: ["expense-categories"], queryFn: getExpenseCategories });
  const { data: expenses = [], isLoading } = useQuery({ queryKey: ["expenses"], queryFn: () => getExpenses() });

  const createCatMut = useMutation({ mutationFn: createExpenseCategory, onSuccess: () => { qc.invalidateQueries({ queryKey: ["expense-categories"] }); toast.success("Category added!"); setShowAddCategory(false); }, onError: () => toast.error("Failed") });
  const createExpMut = useMutation({ mutationFn: createExpense, onSuccess: () => { qc.invalidateQueries({ queryKey: ["expenses"] }); toast.success("Expense recorded!"); setShowAddExpense(false); }, onError: () => toast.error("Failed") });
  const updateExpMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => updateExpense(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Expense updated!");
      setEditExpense(null);
    },
    onError: () => toast.error("Failed to update expense"),
  });
  const deleteMut = useMutation({
    mutationFn: deleteExpense,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Expense deleted");
      setDeleteId(null);
    },
    onError: (err: Error) => toast.error(err.message || "Delete failed"),
  });

  const totalExpenses = expenses.filter(e => e.status === "Approved").reduce((s, e) => s + e.amount, 0);
  const pending = expenses.filter(e => e.status === "Pending").length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Expense Management</h1>
          <p className="page-subtitle">Track hospital expenses and payments</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAddCategory(true)} className="btn btn-ghost">Add Category</button>
          <button onClick={() => setShowAddExpense(true)} className="btn btn-primary"><Plus size={16} /> Add Expense</button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3.5 mb-5">
        <div className="stat-card anim-fade-up d1">
          <div className="stat-value text-accent">₹{(totalExpenses / 100000).toFixed(1)}L</div>
          <div className="stat-label">Total Expenses</div>
        </div>
        <div className="stat-card anim-fade-up d2">
          <div className="stat-value text-white">{expenses.length}</div>
          <div className="stat-label">Transactions</div>
        </div>
        <div className="stat-card anim-fade-up d3">
          <div className="stat-value text-warning">{pending}</div>
          <div className="stat-label">Pending Approval</div>
        </div>
        <div className="stat-card anim-fade-up d4">
          <div className="stat-value text-purple">{categories.length}</div>
          <div className="stat-label">Categories</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        {categories.slice(0, 6).map(cat => {
          const catTotal = expenses.filter(e => e.category_id === cat.id && e.status === "Approved").reduce((s, e) => s + e.amount, 0);
          return (
            <div key={cat.id} className="card p-4">
              <div className="font-medium text-white mb-1">{cat.category_name}</div>
              <div className="text-2xl font-display font-bold text-accent">₹{catTotal.toLocaleString()}</div>
            </div>
          );
        })}
      </div>

      <div className="card">
        {isLoading ? <div className="py-12 text-center text-muted">Loading...</div> : (
          <table className="data-table">
            <thead><tr><th>Code</th><th>Category</th><th>Description</th><th>Amount</th><th>Date</th><th>Vendor</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {expenses.map(e => (
                <tr key={e.id}>
                  <td className="font-mono text-subtle">{e.expense_code}</td>
                  <td className="font-medium text-white">{e.category_name}</td>
                  <td className="max-w-[200px] truncate">{e.description}</td>
                  <td className="font-bold text-white">₹{e.amount.toLocaleString()}</td>
                  <td>{e.expense_date}</td>
                  <td className="text-muted">{e.vendor || "-"}</td>
                  <td><span className={`badge ${e.status === "Approved" ? "badge-green" : e.status === "Pending" ? "badge-yellow" : "badge-red"}`}>{e.status}</span></td>
                  <td>
                    <div className="flex gap-1.5">
                      <button onClick={() => setEditExpense(e)} className="icon-btn hover:!text-accent"><Edit size={12} /></button>
                      <button onClick={() => setDeleteId(e.id)} className="icon-btn hover:!text-danger"><Trash2 size={12} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAddCategory && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-surface border border-border2 rounded-2xl w-[400px] p-6">
            <h2 className="font-display font-bold text-lg mb-4">Add Expense Category</h2>
            <form onSubmit={e => { e.preventDefault(); const f = e.target as HTMLFormElement; createCatMut.mutate({ category_name: (f.elements.namedItem("category_name") as HTMLInputElement).value, description: (f.elements.namedItem("description") as HTMLInputElement).value || undefined }); }}>
              <div className="space-y-4">
                <div><label className="form-label">Category Name *</label><input name="category_name" required className="input" placeholder="e.g., Medical Supplies" /></div>
                <div><label className="form-label">Description</label><textarea name="description" className="textarea" /></div>
                <div className="flex gap-3 justify-end pt-2">
                  <button type="button" onClick={() => setShowAddCategory(false)} className="btn btn-ghost">Cancel</button>
                  <button type="submit" className="btn btn-primary">Add</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        title="Delete Expense"
        message="Are you sure you want to delete this expense record?"
        confirmLabel="Delete"
        variant="danger"
        loading={deleteMut.isPending}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        onCancel={() => setDeleteId(null)}
      />

      {editExpense && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-surface border border-border2 rounded-2xl w-[500px] p-6 space-y-4">
            <h2 className="font-display font-bold text-lg">Edit Expense</h2>
            <form onSubmit={e => {
              e.preventDefault();
              const f = e.target as HTMLFormElement;
              updateExpMut.mutate({
                id: editExpense.id,
                data: {
                  category_id: parseInt((f.elements.namedItem("category_id") as HTMLSelectElement).value),
                  amount: parseFloat((f.elements.namedItem("amount") as HTMLInputElement).value),
                  expense_date: (f.elements.namedItem("expense_date") as HTMLInputElement).value,
                  description: (f.elements.namedItem("description") as HTMLTextAreaElement).value,
                  vendor: (f.elements.namedItem("vendor") as HTMLInputElement).value || null,
                  payment_method: (f.elements.namedItem("payment_method") as HTMLSelectElement).value,
                  status: (f.elements.namedItem("status") as HTMLSelectElement).value,
                }
              });
            }}>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="form-label">Category *</label><select name="category_id" required className="select" defaultValue={editExpense.category_id}>{categories.map(c => <option key={c.id} value={c.id}>{c.category_name}</option>)}</select></div>
                  <div><label className="form-label">Amount *</label><input name="amount" type="number" step="0.01" required className="input" defaultValue={editExpense.amount} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="form-label">Date *</label><input name="expense_date" type="date" required className="input" defaultValue={editExpense.expense_date} /></div>
                  <div><label className="form-label">Payment Method</label><select name="payment_method" className="select" defaultValue={editExpense.payment_method}><option value="Cash">Cash</option><option value="Card">Card</option><option value="UPI">UPI</option><option value="Bank Transfer">Bank Transfer</option></select></div>
                </div>
                <div><label className="form-label">Status</label><select name="status" className="select" defaultValue={editExpense.status}><option value="Pending">Pending</option><option value="Approved">Approved</option><option value="Rejected">Rejected</option></select></div>
                <div><label className="form-label">Description *</label><textarea name="description" required className="textarea" defaultValue={editExpense.description} /></div>
                <div><label className="form-label">Vendor</label><input name="vendor" className="input" placeholder="Supplier name" defaultValue={editExpense.vendor || ""} /></div>
                <div className="flex gap-3 justify-end pt-2">
                  <button type="button" onClick={() => setEditExpense(null)} className="btn btn-ghost">Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={updateExpMut.isPending}>Save Changes</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddExpense && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-surface border border-border2 rounded-2xl w-[500px] p-6">
            <h2 className="font-display font-bold text-lg mb-4">Record Expense</h2>
            <form onSubmit={e => { e.preventDefault(); const f = e.target as HTMLFormElement; createExpMut.mutate({ category_id: parseInt((f.elements.namedItem("category_id") as HTMLSelectElement).value), amount: parseFloat((f.elements.namedItem("amount") as HTMLInputElement).value), expense_date: (f.elements.namedItem("expense_date") as HTMLInputElement).value, description: (f.elements.namedItem("description") as HTMLTextAreaElement).value, vendor: (f.elements.namedItem("vendor") as HTMLInputElement).value || undefined, payment_method: (f.elements.namedItem("payment_method") as HTMLSelectElement).value }); }}>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="form-label">Category *</label><select name="category_id" required className="select"><option value="">Select Category</option>{categories.map(c => <option key={c.id} value={c.id}>{c.category_name}</option>)}</select></div>
                  <div><label className="form-label">Amount *</label><input name="amount" type="number" step="0.01" required className="input" /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="form-label">Date *</label><input name="expense_date" type="date" required className="input" defaultValue={new Date().toISOString().split("T")[0]} /></div>
                  <div><label className="form-label">Payment Method</label><select name="payment_method" className="select"><option value="Cash">Cash</option><option value="Card">Card</option><option value="UPI">UPI</option><option value="Bank Transfer">Bank Transfer</option></select></div>
                </div>
                <div><label className="form-label">Description *</label><textarea name="description" required className="textarea" /></div>
                <div><label className="form-label">Vendor</label><input name="vendor" className="input" placeholder="Supplier name" /></div>
                <div className="flex gap-3 justify-end pt-2">
                  <button type="button" onClick={() => setShowAddExpense(false)} className="btn btn-ghost">Cancel</button>
                  <button type="submit" className="btn btn-primary">Record</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
