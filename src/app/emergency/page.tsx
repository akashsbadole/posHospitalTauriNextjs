"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getEmergencyCases, createEmergencyCase, updateEmergencyStatus, getWards, getPatients, deleteEmergencyCase } from "@/lib/tauri";
import { toast } from "sonner";
import { AlertTriangle, Plus, User, Activity, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/modules/ConfirmDialog";

export default function EmergencyPage() {
  const [showAdd, setShowAdd] = useState(false);
  const [showAdmit, setShowAdmit] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const qc = useQueryClient();

  const { data: cases = [], isLoading } = useQuery({ queryKey: ["emergency-cases"], queryFn: () => getEmergencyCases() });
  const { data: wards = [] } = useQuery({ queryKey: ["wards"], queryFn: getWards });
  const { data: patients = [] } = useQuery({ queryKey: ["patients"], queryFn: () => getPatients() });

  const createMut = useMutation({ mutationFn: createEmergencyCase, onSuccess: () => { qc.invalidateQueries({ queryKey: ["emergency-cases"] }); toast.success("Case registered!"); setShowAdd(false); }, onError: () => toast.error("Failed") });
  const updateMut = useMutation({ mutationFn: ({ id, status, outcome, admitted_to }: { id: number; status: string; outcome?: string; admitted_to?: number }) => updateEmergencyStatus(id, status, outcome, admitted_to), onSuccess: () => { qc.invalidateQueries({ queryKey: ["emergency-cases"] }); toast.success("Updated!"); }, onError: () => toast.error("Failed") });
  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteEmergencyCase(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["emergency-cases"] });
      toast.success("Emergency case deleted");
      setDeleteId(null);
    },
    onError: () => toast.error("Delete failed"),
  });

  const triageColors: Record<string, string> = { Red: "badge-red", Orange: "badge-yellow", Yellow: "badge-blue", Green: "badge-green" };
  const activeCases = cases.filter(c => c.status !== "Discharged").length;
  const redCases = cases.filter(c => c.triage_level === "Red" && c.status !== "Discharged").length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Emergency / ER</h1>
          <p className="page-subtitle">Emergency cases and triage management</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn btn-danger"><Plus size={16} /> New Emergency</button>
      </div>

      <div className="grid grid-cols-4 gap-3.5 mb-5">
        <div className="stat-card anim-fade-up d1">
          <div className="stat-value text-accent">{activeCases}</div>
          <div className="stat-label">Active Cases</div>
        </div>
        <div className="stat-card anim-fade-up d2">
          <div className="stat-value text-danger">{redCases}</div>
          <div className="stat-label">Critical (Red)</div>
        </div>
        <div className="stat-card anim-fade-up d3">
          <div className="stat-value text-warning">{cases.filter(c => c.triage_level === "Orange" && c.status !== "Discharged").length}</div>
          <div className="stat-label">Urgent</div>
        </div>
        <div className="stat-card anim-fade-up d4">
          <div className="stat-value text-success">{cases.filter(c => c.status === "Discharged").length}</div>
          <div className="stat-label">Discharged</div>
        </div>
      </div>

      <div className="card">
        {isLoading ? <div className="py-12 text-center text-muted">Loading...</div> : (
          <table className="data-table">
            <thead><tr><th>Case</th><th>Patient</th><th>Complaint</th><th>Triage</th><th>Arrival</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {cases.map(c => (
                <tr key={c.id}>
                  <td className="font-mono text-subtle">{c.case_code}</td>
                  <td className="font-medium text-white">{c.patient_name}</td>
                  <td className="max-w-[200px] truncate">{c.chief_complaint}</td>
                  <td><span className={`badge ${triageColors[c.triage_level]}`}>{c.triage_level}</span></td>
                  <td className="text-muted">{new Date(c.arrival_time).toLocaleTimeString()}</td>
                  <td><span className={`badge ${c.status === "Discharged" ? "badge-green" : c.status === "Admitted" ? "badge-blue" : "badge-yellow"}`}>{c.status}</span></td>
                  <td>
                    <div className="flex items-center gap-2">
                      {c.status !== "Discharged" && c.status !== "Admitted" && (
                        <>
                          <button onClick={() => setShowAdmit(c.id)} className="btn btn-sm btn-ghost">Admit</button>
                          <button onClick={() => updateMut.mutate({ id: c.id, status: "Discharged", outcome: "Treated" })} className="btn btn-sm btn-success">Discharge</button>
                        </>
                      )}
                      <button onClick={() => setDeleteId(c.id)} className="icon-btn hover:!text-danger"><Trash2 size={12} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteId}
        title="Delete Emergency Case"
        message="Are you sure you want to delete this emergency case record?"
        confirmLabel="Delete"
        variant="danger"
        loading={deleteMut.isPending}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        onCancel={() => setDeleteId(null)}
      />

      {showAdmit && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-surface border border-border2 rounded-2xl w-[400px] p-6 space-y-4">
            <h2 className="font-display font-bold text-lg">Admit to Ward</h2>
            <form onSubmit={e => { e.preventDefault(); const f = e.target as HTMLFormElement; updateMut.mutate({ id: showAdmit, status: "Admitted", admitted_to: parseInt((f.elements.namedItem("ward_id") as HTMLSelectElement).value) }); setShowAdmit(null); }}>
              <div className="space-y-4">
                <div>
                  <label className="form-label">Select Ward *</label>
                  <select name="ward_id" required className="select">
                    <option value="">Select Ward</option>
                    {wards.map(w => <option key={w.id} value={w.id}>{w.ward_name} ({w.department})</option>)}
                  </select>
                </div>
                <div className="flex gap-3 justify-end pt-2">
                  <button type="button" onClick={() => setShowAdmit(null)} className="btn btn-ghost">Cancel</button>
                  <button type="submit" className="btn btn-primary">Confirm Admission</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-surface border border-border2 rounded-2xl w-[500px] p-6 space-y-4">
            <h2 className="font-display font-bold text-lg">Register Emergency Case</h2>
            <form onSubmit={e => { e.preventDefault(); const f = e.target as HTMLFormElement; createMut.mutate({ patient_name: (f.elements.namedItem("patient_name") as HTMLInputElement).value, patient_phone: (f.elements.namedItem("patient_phone") as HTMLInputElement).value || undefined, triage_level: (f.elements.namedItem("triage_level") as HTMLSelectElement).value, chief_complaint: (f.elements.namedItem("chief_complaint") as HTMLInputElement).value }); }}>
              <div className="space-y-4">
                <div><label className="form-label">Patient Name *</label><input name="patient_name" required className="input" placeholder="Unknown if not registered" /></div>
                <div><label className="form-label">Phone</label><input name="patient_phone" className="input" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="form-label">Triage Level *</label><select name="triage_level" required className="select"><option value="Red">Red - Critical</option><option value="Orange">Orange - Urgent</option><option value="Yellow">Yellow - Less Urgent</option><option value="Green">Green - Minor</option></select></div>
                </div>
                <div><label className="form-label">Chief Complaint *</label><textarea name="chief_complaint" required className="textarea" placeholder="Primary complaint..." /></div>
                <div className="flex gap-3 justify-end pt-2">
                  <button type="button" onClick={() => setShowAdd(false)} className="btn btn-ghost">Cancel</button>
                  <button type="submit" className="btn btn-danger">Register</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
