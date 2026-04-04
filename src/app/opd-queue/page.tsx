"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getOpdTokens, createOpdToken, updateTokenStatus, getDoctors, getPatients } from "@/lib/tauri";
import { toast } from "sonner";
import { MonitorPlay, Plus, Play, CheckCircle, Phone, User } from "lucide-react";

export default function OpdQueuePage() {
  const [showAddToken, setShowAddToken] = useState(false);
  const qc = useQueryClient();
  const today = new Date().toISOString().split("T")[0];

  const { data: tokens = [], isLoading } = useQuery({ queryKey: ["opd-tokens", today], queryFn: () => getOpdTokens(today) });
  const { data: doctors = [] } = useQuery({ queryKey: ["doctors"], queryFn: getDoctors });
  const { data: patients = [] } = useQuery({ queryKey: ["patients"], queryFn: () => getPatients() });

  const createTokenMut = useMutation({ mutationFn: createOpdToken, onSuccess: () => { qc.invalidateQueries({ queryKey: ["opd-tokens"] }); toast.success("Token generated!"); setShowAddToken(false); }, onError: (err: Error) => toast.error(err.message || "Failed to generate token") });
  const updateStatusMut = useMutation({ mutationFn: ({ id, status }: { id: number; status: string }) => updateTokenStatus(id, status), onSuccess: () => { qc.invalidateQueries({ queryKey: ["opd-tokens"] }); toast.success("Status updated!"); }, onError: (err: Error) => toast.error(err.message || "Failed to update status") });

  const waiting = tokens.filter(t => t.status === "Waiting").length;
  const called = tokens.filter(t => t.status === "Called").length;
  const completed = tokens.filter(t => t.status === "Completed").length;
  const currentToken = tokens.find(t => t.status === "InProgress");

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">OPD Queue</h1>
          <p className="page-subtitle">Digital token management for outpatient department</p>
        </div>
        <button onClick={() => setShowAddToken(true)} className="btn btn-primary"><Plus size={16} /> Generate Token</button>
      </div>

      <div className="grid grid-cols-4 gap-3.5 mb-5">
        <div className="stat-card anim-fade-up d1">
          <div className="stat-value text-accent">{waiting}</div>
          <div className="stat-label">Waiting</div>
        </div>
        <div className="stat-card anim-fade-up d2">
          <div className="stat-value text-warning">{called}</div>
          <div className="stat-label">Called</div>
        </div>
        <div className="stat-card anim-fade-up d3">
          <div className="stat-value text-success">{completed}</div>
          <div className="stat-label">Completed</div>
        </div>
        <div className="stat-card anim-fade-up d4">
          <div className="stat-value text-purple">{currentToken ? `#${currentToken.token_number}` : "-"}</div>
          <div className="stat-label">Now Serving</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Queue - {today}</h3>
            </div>
            <div className="p-4">
              {isLoading ? <div className="text-center text-muted py-8">Loading...</div> : (
                <div className="space-y-2">
                  {tokens.map(token => (
                    <div key={token.id} className={`p-4 rounded-lg border flex items-center justify-between ${token.status === "InProgress" ? "bg-accent/10 border-accent" : token.status === "Completed" ? "bg-success/10 border-success/30" : "bg-surface2 border-border"}`}>
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg ${token.status === "InProgress" ? "bg-accent text-bg" : token.status === "Completed" ? "bg-success/20 text-success" : "bg-surface3 text-white"}`}>
                          {token.token_number}
                        </div>
                        <div>
                          <div className="font-medium text-white">{token.patient_name}</div>
                          <div className="text-xs text-muted">{token.doctor_name} • {token.department}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`badge ${token.status === "Waiting" ? "badge-gray" : token.status === "Called" ? "badge-yellow" : token.status === "InProgress" ? "badge-blue" : "badge-green"}`}>{token.status}</span>
                        {token.status === "Waiting" && <button onClick={() => updateStatusMut.mutate({ id: token.id, status: "Called" })} className="btn btn-sm btn-ghost"><Phone size={14} /></button>}
                        {token.status === "Called" && <button onClick={() => updateStatusMut.mutate({ id: token.id, status: "InProgress" })} className="btn btn-sm btn-primary"><Play size={12} /></button>}
                        {token.status === "InProgress" && <button onClick={() => updateStatusMut.mutate({ id: token.id, status: "Completed" })} className="btn btn-sm btn-success"><CheckCircle size={12} /></button>}
                      </div>
                    </div>
                  ))}
                  {tokens.length === 0 && <div className="text-center text-muted py-8">No tokens for today</div>}
                </div>
              )}
            </div>
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Now Serving</h3>
            </div>
            <div className="p-6 text-center">
              {currentToken ? (
                <>
                  <div className="text-6xl font-display font-bold text-accent mb-2">#{currentToken.token_number}</div>
                  <div className="text-lg font-medium text-white mb-1">{currentToken.patient_name}</div>
                  <div className="text-sm text-muted mb-4">{currentToken.doctor_name}</div>
                  <button onClick={() => updateStatusMut.mutate({ id: currentToken.id, status: "Completed" })} className="btn btn-success w-full">Complete</button>
                </>
              ) : (
                <div className="text-muted py-8">No patient in progress</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showAddToken && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-surface border border-border2 rounded-2xl w-[450px] p-6 space-y-4">
            <h2 className="font-display font-bold text-lg">Generate OPD Token</h2>
            <form onSubmit={e => { e.preventDefault(); const f = e.target as HTMLFormElement; createTokenMut.mutate({ patient_id: parseInt((f.elements.namedItem("patient_id") as HTMLSelectElement).value), doctor_id: parseInt((f.elements.namedItem("doctor_id") as HTMLSelectElement).value), department: (f.elements.namedItem("department") as HTMLInputElement).value, queue_date: today }); }}>
              <div className="space-y-4">
                <div><label className="form-label">Patient *</label><select name="patient_id" required className="select"><option value="">Select Patient</option>{patients.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></div>
                <div><label className="form-label">Doctor *</label><select name="doctor_id" required className="select"><option value="">Select Doctor</option>{doctors.map(d => <option key={d.id} value={d.id}>{d.full_name} - {d.specialization}</option>)}</select></div>
                <div><label className="form-label">Department *</label><input name="department" required className="input" placeholder="e.g., General Medicine" /></div>
                <div className="flex gap-3 justify-end pt-2">
                  <button type="button" onClick={() => setShowAddToken(false)} className="btn btn-ghost">Cancel</button>
                  <button type="submit" className="btn btn-primary">Generate Token</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
