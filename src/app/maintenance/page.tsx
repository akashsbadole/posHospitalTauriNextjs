"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getMaintenanceRequests, createMaintenanceRequest, updateMaintenanceRequest, deleteMaintenanceRequest, getWards } from "@/lib/tauri";
import { useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Wrench, Plus, Trash2 } from "lucide-react";
import type { CreateMaintenanceRequest } from "@/types";

const CATEGORIES = ["Equipment", "Electrical", "Plumbing", "HVAC", "Furniture", "IT Infrastructure", "Building", "Other"];
const PRIORITIES = ["Low", "Normal", "High", "Critical"];
const STATUSES = ["Pending", "Assigned", "In Progress", "Completed", "Cancelled"];

const PRIORITY_COLORS: Record<string, string> = {
  Low: "badge-gray", Normal: "badge-blue", High: "badge-yellow", Critical: "badge-red",
};
const STATUS_COLORS: Record<string, string> = {
  Pending: "badge-yellow", Assigned: "badge-blue", "In Progress": "badge-purple", Completed: "badge-green", Cancelled: "badge-red",
};

export default function MaintenancePage() {
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [showNew, setShowNew] = useState(false);
  const today = format(new Date(), "yyyy-MM-dd");
  const [newReq, setNewReq] = useState<CreateMaintenanceRequest>({ 
    category: "Equipment", 
    item_name: "", 
    location: "", 
    ward_id: undefined, 
    priority: "Normal", 
    description: "", 
    requested_date: today 
  });
  const qc = useQueryClient();

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["maintenance", status, category],
    queryFn: () => getMaintenanceRequests(status || undefined, category || undefined),
  });

  const { data: wards = [] } = useQuery({ queryKey: ["wards"], queryFn: getWards });

  const createMut = useMutation({
    mutationFn: createMaintenanceRequest,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["maintenance"] }); toast.success("Request created"); setShowNew(false); setNewReq({ category: "Equipment", item_name: "", location: "", ward_id: undefined, priority: "Normal", description: "", requested_date: today }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => updateMaintenanceRequest(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["maintenance"] }); toast.success("Request updated"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: deleteMaintenanceRequest,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["maintenance"] }); toast.success("Request deleted"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleCreate = () => {
    if (!newReq.item_name || !newReq.location || !newReq.description) return toast.error("Please fill required fields");
    createMut.mutate({ ...newReq, requested_by: "System" });
  };

  const pending = requests.filter(r => r.status === "Pending").length;
  const inProgress = requests.filter(r => r.status === "In Progress" || r.status === "Assigned").length;
  const completed = requests.filter(r => r.status === "Completed").length;
  const totalCost = requests.reduce((sum, r) => sum + (r.actual_cost || r.estimated_cost || 0), 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Maintenance</h1>
          <p className="page-subtitle">Track equipment and facility maintenance requests</p>
        </div>
        <button onClick={() => setShowNew(true)} className="btn btn-primary"><Plus size={16} /> New Request</button>
      </div>

      <div className="grid grid-cols-5 gap-3.5 mb-5">
        <div className="stat-card anim-fade-up d1">
          <div className="stat-value text-warning">{pending}</div>
          <div className="stat-label">Pending</div>
        </div>
        <div className="stat-card anim-fade-up d2">
          <div className="stat-value text-accent">{inProgress}</div>
          <div className="stat-label">In Progress</div>
        </div>
        <div className="stat-card anim-fade-up d3">
          <div className="stat-value text-success">{completed}</div>
          <div className="stat-label">Completed</div>
        </div>
        <div className="stat-card anim-fade-up d4">
          <div className="stat-value text-white">₹{totalCost.toLocaleString()}</div>
          <div className="stat-label">Total Cost</div>
        </div>
        <div className="stat-card anim-fade-up d5">
          <div className="stat-value text-white">{requests.length}</div>
          <div className="stat-label">Total Requests</div>
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        <select value={status} onChange={e => setStatus(e.target.value)} className="w-40">
          <option value="">All Status</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={category} onChange={e => setCategory(e.target.value)} className="w-40">
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="card">
        {isLoading ? <div className="py-12 text-center text-muted">Loading...</div> : (
          <table className="data-table">
            <thead>
              <tr><th>Code</th><th>Category</th><th>Item</th><th>Location</th><th>Ward</th><th>Priority</th><th>Status</th><th>Est. Cost</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {requests.map(r => (
                <tr key={r.id}>
                  <td className="font-mono text-[12px] text-subtle">{r.request_code}</td>
                  <td>{r.category}</td>
                  <td>{r.item_name}</td>
                  <td>{r.location}</td>
                  <td>{r.ward_name || "-"}</td>
                  <td><span className={`badge ${PRIORITY_COLORS[r.priority]}`}>{r.priority}</span></td>
                  <td><span className={`badge ${STATUS_COLORS[r.status]}`}>{r.status}</span></td>
                  <td>₹{r.actual_cost || r.estimated_cost || "-"}</td>
                  <td className="flex gap-1">
                    {r.status === "Pending" && <button onClick={() => updateMut.mutate({ id: r.id, data: { status: "Assigned" } })} className="btn btn-xs btn-ghost text-accent">Assign</button>}
                    {r.status === "Assigned" && <button onClick={() => updateMut.mutate({ id: r.id, data: { status: "In Progress" } })} className="btn btn-xs btn-ghost text-warning">Start</button>}
                    {r.status === "In Progress" && <button onClick={() => updateMut.mutate({ id: r.id, data: { status: "Completed" } })} className="btn btn-xs btn-ghost text-success">Complete</button>}
                    <button onClick={() => deleteMut.mutate(r.id)} className="btn btn-xs btn-ghost text-danger"><Trash2 size={12} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showNew && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-surface border border-border2 rounded-2xl w-[500px] p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="font-display font-bold text-lg mb-4">New Maintenance Request</h2>
            <div className="space-y-3">
              <div>
                <label className="form-label">Category *</label>
                <select value={newReq.category} onChange={e => setNewReq({ ...newReq, category: e.target.value as CreateMaintenanceRequest["category"] })} className="w-full">
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Item Name *</label>
                <input value={newReq.item_name} onChange={e => setNewReq({ ...newReq, item_name: e.target.value })} className="w-full" placeholder="e.g., AC Unit 1, Bed #5" />
              </div>
              <div>
                <label className="form-label">Location *</label>
                <input value={newReq.location} onChange={e => setNewReq({ ...newReq, location: e.target.value })} className="w-full" placeholder="e.g., Room 201, ICU" />
              </div>
              <div>
                <label className="form-label">Ward (Optional)</label>
                <select value={newReq.ward_id || ""} onChange={e => setNewReq({ ...newReq, ward_id: e.target.value ? Number(e.target.value) : undefined })} className="w-full">
                  <option value="">None</option>
                  {wards.map(w => <option key={w.id} value={w.id}>{w.ward_name}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Priority</label>
                <select value={newReq.priority} onChange={e => setNewReq({ ...newReq, priority: e.target.value as CreateMaintenanceRequest["priority"] })} className="w-full">
                  {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Estimated Cost</label>
                <input type="number" value={newReq.estimated_cost || ""} onChange={e => setNewReq({ ...newReq, estimated_cost: e.target.value ? Number(e.target.value) : undefined })} className="w-full" placeholder="0" />
              </div>
              <div>
                <label className="form-label">Description *</label>
                <textarea value={newReq.description} onChange={e => setNewReq({ ...newReq, description: e.target.value })} className="w-full" rows={3} placeholder="Describe the issue..." />
              </div>
              <div>
                <label className="form-label">Notes</label>
                <textarea value={newReq.notes} onChange={e => setNewReq({ ...newReq, notes: e.target.value })} className="w-full" rows={2} />
              </div>
            </div>
            <div className="flex gap-3 mt-5 justify-end">
              <button onClick={() => setShowNew(false)} className="btn btn-ghost">Cancel</button>
              <button onClick={handleCreate} className="btn btn-primary">Create Request</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}