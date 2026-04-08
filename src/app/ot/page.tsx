"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getOtSchedules, createOtSchedule, getOtTheatres, getDoctors, getPatients, deleteOtSchedule } from "@/lib/tauri";
import { toast } from "sonner";
import { Scissors, Plus, Play, CheckCircle, Clock, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/modules/ConfirmDialog";

export default function OtPage() {
  const [showAdd, setShowAdd] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const today = new Date().toISOString().split("T")[0];
  const qc = useQueryClient();

  const { data: schedules = [], isLoading } = useQuery({ queryKey: ["ot-schedules", today], queryFn: () => getOtSchedules(today) });
  const { data: theatres = [] } = useQuery({ queryKey: ["ot-theatres"], queryFn: getOtTheatres });
  const { data: doctors = [] } = useQuery({ queryKey: ["doctors"], queryFn: getDoctors });
  const { data: patients = [] } = useQuery({ queryKey: ["patients"], queryFn: () => getPatients() });

  const createMut = useMutation({ mutationFn: createOtSchedule, onSuccess: () => { qc.invalidateQueries({ queryKey: ["ot-schedules"] }); toast.success("OT scheduled!"); setShowAdd(false); }, onError: (err: Error) => toast.error(err.message || "Failed to schedule surgery") });
  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteOtSchedule(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ot-schedules"] });
      toast.success("Schedule deleted");
      setDeleteId(null);
    },
    onError: (err: Error) => toast.error(err.message || "Delete failed"),
  });

  const scheduled = schedules.filter(s => s.status === "Scheduled").length;
  const inProgress = schedules.filter(s => s.status === "InProgress").length;
  const completed = schedules.filter(s => s.status === "Completed").length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Operation Theatre</h1>
          <p className="page-subtitle">OT scheduling and surgery management</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn btn-primary"><Plus size={16} /> Schedule Surgery</button>
      </div>

      <div className="grid grid-cols-4 gap-3.5 mb-5">
        <div className="stat-card anim-fade-up d1">
          <div className="stat-value text-accent">{schedules.length}</div>
          <div className="stat-label">Today's Surgeries</div>
        </div>
        <div className="stat-card anim-fade-up d2">
          <div className="stat-value text-warning">{scheduled}</div>
          <div className="stat-label">Scheduled</div>
        </div>
        <div className="stat-card anim-fade-up d3">
          <div className="stat-value text-purple">{inProgress}</div>
          <div className="stat-label">In Progress</div>
        </div>
        <div className="stat-card anim-fade-up d4">
          <div className="stat-value text-success">{completed}</div>
          <div className="stat-label">Completed</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">OT Schedule - {today}</h3>
        </div>
        {isLoading ? <div className="py-12 text-center text-muted">Loading...</div> : (
          <table className="data-table">
            <thead><tr><th>Time</th><th>Patient</th><th>Surgery</th><th>Surgeon</th><th>Theatre</th><th>Anesthesia</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {schedules.map(s => (
                <tr key={s.id}>
                  <td className="font-mono">{s.start_time}</td>
                  <td className="font-medium text-white">{s.patient_name}</td>
                  <td>{s.surgery_type}</td>
                  <td>{s.surgeon_name}</td>
                  <td>{s.theatre_name}</td>
                  <td>{s.anesthesia_type || "-"}</td>
                  <td><span className={`badge ${s.status === "Completed" ? "badge-green" : s.status === "InProgress" ? "badge-blue" : s.priority === "Emergency" ? "badge-red" : "badge-gray"}`}>{s.status}</span></td>
                  <td>
                    <button onClick={() => setDeleteId(s.id)} className="icon-btn hover:!text-danger"><Trash2 size={12} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteId}
        title="Delete OT Schedule"
        message="Are you sure you want to delete this surgery schedule? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        loading={deleteMut.isPending}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        onCancel={() => setDeleteId(null)}
      />

      {showAdd && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-surface border border-border2 rounded-2xl w-[500px] p-6 space-y-4">
            <h2 className="font-display font-bold text-lg">Schedule Surgery</h2>
            <form onSubmit={e => { e.preventDefault(); const f = e.target as HTMLFormElement; createMut.mutate({ patient_id: parseInt((f.elements.namedItem("patient_id") as HTMLSelectElement).value), surgeon_id: parseInt((f.elements.namedItem("surgeon_id") as HTMLSelectElement).value), ot_theatre_id: parseInt((f.elements.namedItem("ot_theatre_id") as HTMLSelectElement).value), surgery_type: (f.elements.namedItem("surgery_type") as HTMLInputElement).value, surgery_date: today, start_time: (f.elements.namedItem("start_time") as HTMLInputElement).value, priority: (f.elements.namedItem("priority") as HTMLSelectElement).value, anesthesia_type: (f.elements.namedItem("anesthesia_type") as HTMLInputElement).value || undefined }); }}>
              <div className="space-y-4">
                <div><label className="form-label">Patient *</label><select name="patient_id" required className="select"><option value="">Select Patient</option>{patients.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="form-label">Surgeon *</label><select name="surgeon_id" required className="select"><option value="">Select Surgeon</option>{doctors.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}</select></div>
                  <div><label className="form-label">OT Theatre *</label><select name="ot_theatre_id" required className="select"><option value="">Select Theatre</option>{theatres.map(t => <option key={t.id} value={t.id}>{t.theatre_name}</option>)}</select></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="form-label">Surgery Type *</label><input name="surgery_type" required className="input" placeholder="e.g., Appendectomy" /></div>
                  <div><label className="form-label">Time *</label><input name="start_time" type="time" required className="input" /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="form-label">Priority</label><select name="priority" className="select"><option value="Elective">Elective</option><option value="Emergency">Emergency</option><option value="Urgent">Urgent</option></select></div>
                  <div><label className="form-label">Anesthesia</label><input name="anesthesia_type" className="input" placeholder="e.g., General" /></div>
                </div>
                <div className="flex gap-3 justify-end pt-2">
                  <button type="button" onClick={() => setShowAdd(false)} className="btn btn-ghost">Cancel</button>
                  <button type="submit" className="btn btn-primary">Schedule</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
