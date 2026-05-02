"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getHousekeepingTasks, createHousekeepingTask, updateHousekeepingTask, deleteHousekeepingTask, getWards } from "@/lib/tauri";
import { useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Sparkles, CheckCircle, Clock, AlertTriangle, Plus, Trash2 } from "lucide-react";
import type { CreateHousekeepingTask } from "@/types";

const TASK_TYPES = ["Cleaning", "Sanitation", "Laundry", "Waste Management", "Deep Cleaning", "Inspection"];
const PRIORITIES = ["Low", "Normal", "High", "Urgent"];
const STATUSES = ["Pending", "In Progress", "Completed", "Verified", "Cancelled"];

const PRIORITY_COLORS: Record<string, string> = {
  Low: "badge-gray", Normal: "badge-blue", High: "badge-yellow", Urgent: "badge-red",
};
const STATUS_COLORS: Record<string, string> = {
  Pending: "badge-yellow", "In Progress": "badge-blue", Completed: "badge-green", Verified: "badge-gray", Cancelled: "badge-red",
};

export default function HousekeepingPage() {
  const [status, setStatus] = useState<string>("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [showNew, setShowNew] = useState(false);
  const [newTask, setNewTask] = useState<CreateHousekeepingTask>({ 
    task_type: "Cleaning", 
    location: "", 
    ward_id: undefined, 
    priority: "Normal", 
    scheduled_date: date, 
    notes: "" 
  });
  const qc = useQueryClient();

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["housekeeping", status, date],
    queryFn: () => getHousekeepingTasks(status || undefined, date),
  });

  const { data: wards = [] } = useQuery({ queryKey: ["wards"], queryFn: getWards });

  const createMut = useMutation({
    mutationFn: createHousekeepingTask,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["housekeeping"] }); toast.success("Task created"); setShowNew(false); setNewTask({ task_type: "Cleaning", location: "", ward_id: undefined, priority: "Normal", scheduled_date: date, notes: "" }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => updateHousekeepingTask(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["housekeeping"] }); toast.success("Task updated"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: deleteHousekeepingTask,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["housekeeping"] }); toast.success("Task deleted"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleCreate = () => {
    if (!newTask.location) return toast.error("Location is required");
    createMut.mutate({ ...newTask, created_by: "System" });
  };

  const pending = tasks.filter(t => t.status === "Pending").length;
  const inProgress = tasks.filter(t => t.status === "In Progress").length;
  const completed = tasks.filter(t => t.status === "Completed" || t.status === "Verified").length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Housekeeping</h1>
          <p className="page-subtitle">Manage cleaning and sanitation tasks</p>
        </div>
        <button onClick={() => setShowNew(true)} className="btn btn-primary"><Plus size={16} /> New Task</button>
      </div>

      <div className="grid grid-cols-4 gap-3.5 mb-5">
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
          <div className="stat-value text-white">{tasks.length}</div>
          <div className="stat-label">Total Tasks</div>
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-40" />
        <select value={status} onChange={e => setStatus(e.target.value)} className="w-40">
          <option value="">All Status</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="card">
        {isLoading ? <div className="py-12 text-center text-muted">Loading...</div> : (
          <table className="data-table">
            <thead>
              <tr><th>Code</th><th>Type</th><th>Location</th><th>Ward</th><th>Priority</th><th>Status</th><th>Scheduled</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {tasks.map(t => (
                <tr key={t.id}>
                  <td className="font-mono text-[12px] text-subtle">{t.task_code}</td>
                  <td>{t.task_type}</td>
                  <td>{t.location}</td>
                  <td>{t.ward_name || "-"}</td>
                  <td><span className={`badge ${PRIORITY_COLORS[t.priority]}`}>{t.priority}</span></td>
                  <td><span className={`badge ${STATUS_COLORS[t.status]}`}>{t.status}</span></td>
                  <td className="text-subtle">{t.scheduled_date}</td>
                  <td className="flex gap-1">
                    {t.status === "Pending" && <button onClick={() => updateMut.mutate({ id: t.id, data: { status: "In Progress" } })} className="btn btn-xs btn-ghost text-accent">Start</button>}
                    {t.status === "In Progress" && <button onClick={() => updateMut.mutate({ id: t.id, data: { status: "Completed" } })} className="btn btn-xs btn-ghost text-success">Complete</button>}
                    {t.status === "Completed" && <button onClick={() => updateMut.mutate({ id: t.id, data: { status: "Verified" } })} className="btn btn-xs btn-ghost text-success">Verify</button>}
                    <button onClick={() => deleteMut.mutate(t.id)} className="btn btn-xs btn-ghost text-danger"><Trash2 size={12} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showNew && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-surface border border-border2 rounded-2xl w-[480px] p-6">
            <h2 className="font-display font-bold text-lg mb-4">New Housekeeping Task</h2>
            <div className="space-y-3">
              <div>
                <label className="form-label">Task Type *</label>
                <select value={newTask.task_type} onChange={e => setNewTask({ ...newTask, task_type: e.target.value as CreateHousekeepingTask["task_type"] })} className="w-full">
                  {TASK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Location *</label>
                <input value={newTask.location} onChange={e => setNewTask({ ...newTask, location: e.target.value })} className="w-full" placeholder="e.g., Room 101, Lobby" />
              </div>
              <div>
                <label className="form-label">Ward (Optional)</label>
                <select value={newTask.ward_id || ""} onChange={e => setNewTask({ ...newTask, ward_id: e.target.value ? Number(e.target.value) : undefined })} className="w-full">
                  <option value="">None</option>
                  {wards.map(w => <option key={w.id} value={w.id}>{w.ward_name}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Priority</label>
                <select value={newTask.priority} onChange={e => setNewTask({ ...newTask, priority: e.target.value as CreateHousekeepingTask["priority"] })} className="w-full">
                  {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Scheduled Date</label>
                <input type="date" value={newTask.scheduled_date} onChange={e => setNewTask({ ...newTask, scheduled_date: e.target.value })} className="w-full" />
              </div>
              <div>
                <label className="form-label">Notes</label>
                <textarea value={newTask.notes} onChange={e => setNewTask({ ...newTask, notes: e.target.value })} className="w-full" rows={2} />
              </div>
            </div>
            <div className="flex gap-3 mt-5 justify-end">
              <button onClick={() => setShowNew(false)} className="btn btn-ghost">Cancel</button>
              <button onClick={handleCreate} className="btn btn-primary">Create Task</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}