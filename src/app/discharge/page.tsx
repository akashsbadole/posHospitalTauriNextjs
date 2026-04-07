"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getDischargeSummaries, createDischargeSummary, getPatients, getDoctors, exportDischargeSummaryPdf, openFile, sendMessage } from "@/lib/tauri";
import { toast } from "sonner";
import { FileText, Plus, Printer, User, Share2, Mail } from "lucide-react";
import type { DischargeSummary } from "@/types";

export default function DischargePage() {
  const [showAdd, setShowAdd] = useState(false);
  const qc = useQueryClient();

  const { data: summaries = [], isLoading } = useQuery({ queryKey: ["discharge-summaries"], queryFn: () => getDischargeSummaries() });
  const { data: patients = [] } = useQuery({ queryKey: ["patients"], queryFn: () => getPatients() });
  const { data: doctors = [] } = useQuery({ queryKey: ["doctors"], queryFn: getDoctors });

  const createMut = useMutation({ mutationFn: ({ data, meds }: { data: any; meds: any[] }) => createDischargeSummary(data, meds), onSuccess: () => { qc.invalidateQueries({ queryKey: ["discharge-summaries"] }); toast.success("Discharge summary created!"); setShowAdd(false); }, onError: (err: Error) => toast.error(err.message || "Failed to create summary") });

  const total = summaries.length;
  const regular = summaries.filter(s => s.discharge_type === "Regular").length;

  const handleDownloadPdf = async (id: number) => {
    try {
      const path = await exportDischargeSummaryPdf(id);
      toast.success(`Discharge Summary PDF saved to ${path}`);
      await openFile(path);
    } catch (e) {
      toast.error("Failed to export summary: " + e);
    }
  };

  const handleShare = async (ds: DischargeSummary, channel: "WhatsApp" | "Email") => {
    const contact = channel === "WhatsApp" ? ds.patient_phone : ds.patient_email;
    if (!contact) {
      toast.error(`Patient ${channel === "WhatsApp" ? "phone number" : "email"} not found`);
      return;
    }
    try {
      await sendMessage({
        patient_id: ds.patient_id,
        phone: ds.patient_phone || "",
        email: ds.patient_email || "",
        message_type: channel,
        message_body: `Dear ${ds.patient_name}, your discharge summary ${ds.summary_code} is ready.`,
      });
      toast.success(`Summary shared via ${channel}!`);
    } catch (e) {
      toast.error("Failed to share: " + e);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Discharge Summary</h1>
          <p className="page-subtitle">Patient discharge documentation and reports</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn btn-primary"><Plus size={16} /> New Summary</button>
      </div>

      <div className="grid grid-cols-4 gap-3.5 mb-5">
        <div className="stat-card anim-fade-up d1">
          <div className="stat-value text-accent">{total}</div>
          <div className="stat-label">Total Summaries</div>
        </div>
        <div className="stat-card anim-fade-up d2">
          <div className="stat-value text-success">{regular}</div>
          <div className="stat-label">Regular Discharge</div>
        </div>
      </div>

      <div className="card">
        {isLoading ? <div className="py-12 text-center text-muted">Loading...</div> : (
          <table className="data-table">
            <thead><tr><th>Code</th><th>Patient</th><th>Admission</th><th>Discharge</th><th>Type</th><th>Diagnosis</th><th>Doctor</th><th>Actions</th></tr></thead>
            <tbody>
              {summaries.map(s => (
                <tr key={s.id}>
                  <td className="font-mono text-subtle">{s.summary_code}</td>
                  <td className="font-medium text-white">{s.patient_name}</td>
                  <td>{s.admission_date}</td>
                  <td>{s.discharge_date}</td>
                  <td><span className={`badge ${s.discharge_type === "Regular" ? "badge-green" : s.discharge_type === "LAMA" ? "badge-red" : "badge-yellow"}`}>{s.discharge_type}</span></td>
                  <td className="max-w-[200px] truncate text-muted">{s.diagnosis}</td>
                  <td>{s.doctor_name}</td>
                  <td>
                    <div className="flex gap-1">
                      <button onClick={() => handleDownloadPdf(s.id)} title="Download / Print PDF" className="icon-btn hover:!text-accent"><Printer size={14} /></button>
                      <button onClick={() => handleShare(s, "WhatsApp")} title="Share via WhatsApp" className="icon-btn hover:!text-green-500"><Share2 size={14} /></button>
                      <button onClick={() => handleShare(s, "Email")} title="Share via Email" className="icon-btn hover:!text-blue-400"><Mail size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-surface border border-border2 rounded-2xl w-[700px] max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <h2 className="font-display font-bold text-lg">Create Discharge Summary</h2>
            <form onSubmit={e => { e.preventDefault(); const f = e.target as HTMLFormElement; const meds = []; for (let i = 0; i < 3; i++) { const medName = (f.elements.namedItem(`med${i}`) as HTMLInputElement)?.value; if (medName) meds.push({ medication: medName, dosage: (f.elements.namedItem(`dose${i}`) as HTMLInputElement)?.value || "", duration: (f.elements.namedItem(`dur${i}`) as HTMLInputElement)?.value || "" }); } createMut.mutate({ data: { patient_id: parseInt((f.elements.namedItem("patient_id") as HTMLSelectElement).value), admission_date: (f.elements.namedItem("admission_date") as HTMLInputElement).value, discharge_date: (f.elements.namedItem("discharge_date") as HTMLInputElement).value, discharge_type: (f.elements.namedItem("discharge_type") as HTMLSelectElement).value, diagnosis: (f.elements.namedItem("diagnosis") as HTMLInputElement).value, procedure_done: (f.elements.namedItem("procedure_done") as HTMLInputElement).value || undefined, history_present_illness: (f.elements.namedItem("history") as HTMLTextAreaElement).value || undefined, examination_findings: (f.elements.namedItem("examination") as HTMLTextAreaElement).value || undefined, investigations: (f.elements.namedItem("investigations") as HTMLTextAreaElement).value || undefined, treatment_given: (f.elements.namedItem("treatment") as HTMLTextAreaElement).value || undefined, advice_on_discharge: (f.elements.namedItem("advice") as HTMLTextAreaElement).value || undefined, follow_up_date: (f.elements.namedItem("follow_up") as HTMLInputElement).value || undefined, created_by: parseInt((f.elements.namedItem("doctor_id") as HTMLSelectElement).value) }, meds }); }}>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div><label className="form-label">Patient *</label><select name="patient_id" required className="select"><option value="">Select Patient</option>{patients.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></div>
                <div><label className="form-label">Doctor *</label><select name="doctor_id" required className="select"><option value="">Select Doctor</option>{doctors.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div><label className="form-label">Admission Date *</label><input name="admission_date" type="date" required className="input" /></div>
                <div><label className="form-label">Discharge Date *</label><input name="discharge_date" type="date" required className="input" /></div>
                <div><label className="form-label">Discharge Type</label><select name="discharge_type" className="select"><option value="Regular">Regular</option><option value="LAMA">LAMA</option><option value="DOR">DOR</option><option value="Transfer">Transfer</option></select></div>
              </div>
              <div className="mb-4"><label className="form-label">Diagnosis *</label><input name="diagnosis" required className="input" placeholder="Primary diagnosis" /></div>
              <div className="mb-4"><label className="form-label">Procedure Done</label><input name="procedure_done" className="input" placeholder="Surgical/medical procedure" /></div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div><label className="form-label">History of Present Illness</label><textarea name="history" className="textarea h-20" /></div>
                <div><label className="form-label">Examination Findings</label><textarea name="examination" className="textarea h-20" /></div>
              </div>
              <div className="mb-4"><label className="form-label">Investigations</label><textarea name="investigations" className="textarea h-16" placeholder="Lab tests, imaging reports" /></div>
              <div className="mb-4"><label className="form-label">Treatment Given</label><textarea name="treatment" className="textarea h-16" /></div>
              <div className="mb-4"><label className="form-label">Advice on Discharge</label><textarea name="advice" className="textarea h-16" /></div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div><label className="form-label">Follow-up Date</label><input name="follow_up" type="date" className="input" /></div>
              </div>
              <div className="mb-4">
                <label className="form-label">Medications on Discharge</label>
                <div className="grid grid-cols-3 gap-2">
                  {[0,1,2].map(i => (
                    <div key={i} className="flex gap-1"><input name={`med${i}`} placeholder="Medicine" className="input" /><input name={`dose${i}`} placeholder="Dose" className="input" /><input name={`dur${i}`} placeholder="Duration" className="input" /></div>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowAdd(false)} className="btn btn-ghost">Cancel</button>
                <button type="submit" className="btn btn-primary">Create Summary</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
