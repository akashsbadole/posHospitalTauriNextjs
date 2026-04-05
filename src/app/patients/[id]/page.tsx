"use client";
import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { getPatientById, getPatientVitals, getAppointments, getPrescriptions, getLabTests, getInvoices, getMedicalRecords, createMedicalRecord, getDoctors } from "@/lib/tauri";
import { ArrowLeft, Edit, Calendar, Pill, FlaskConical, FileText, Activity, User, Plus, X, Download } from "lucide-react";
import { useState } from "react";
import { EditPatientModal } from "@/components/modules/EditPatientModal";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";

const TABS = ["Overview", "Appointments", "Prescriptions", "Lab Tests", "Invoices", "Vitals", "Medical Records"] as const;
type Tab = typeof TABS[number];

export default function PatientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("Overview");
  const [showEdit, setShowEdit] = useState(false);
  const [showAddRecord, setShowAddRecord] = useState(false);
  const patientId = Number(params.id);

  const { data: patient, isLoading: loadingPatient } = useQuery({
    queryKey: ["patient", patientId],
    queryFn: () => getPatientById(patientId),
  });

  const { data: vitals = [] } = useQuery({
    queryKey: ["patient-vitals", patientId],
    queryFn: () => getPatientVitals(patientId),
  });

  const { data: patientAppointments = [] } = useQuery({
    queryKey: ["patient-appointments", patientId],
    queryFn: () => getAppointments(undefined, undefined, patientId),
  });

  const { data: prescriptions = [] } = useQuery({
    queryKey: ["patient-prescriptions", patientId],
    queryFn: () => getPrescriptions(patientId),
  });

  const { data: labTests = [] } = useQuery({
    queryKey: ["patient-labtests", patientId],
    queryFn: () => getLabTests(undefined, patientId),
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["patient-invoices", patientId],
    queryFn: () => getInvoices(undefined, patientId),
  });

  const { data: medicalRecords = [] } = useQuery({
    queryKey: ["patient-medical-records", patientId],
    queryFn: () => getMedicalRecords(patientId),
  });

  const { data: doctors = [] } = useQuery({
    queryKey: ["doctors"],
    queryFn: () => getDoctors(),
  });

  const createRecordMut = useMutation({
    mutationFn: createMedicalRecord,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patient-medical-records", patientId] });
      toast.success("Medical record added!");
      setShowAddRecord(false);
    },
    onError: () => toast.error("Failed to add medical record"),
  });

  if (loadingPatient) {
    return <div className="p-8 text-center text-muted">Loading patient...</div>;
  }

  if (!patient) {
    return <div className="p-8 text-center text-muted">Patient not found</div>;
  }

  const age = new Date().getFullYear() - new Date(patient.dob).getFullYear();

  return (
    <div>
      <button onClick={() => router.back()} className="flex items-center gap-2 text-muted hover:text-white mb-4">
        <ArrowLeft size={16} /> Back to Patients
      </button>

      <div className="card mb-5">
        <div className="p-5 flex items-start justify-between">
          <div className="flex gap-4">
            <div className="w-16 h-16 bg-accent/20 rounded-full flex items-center justify-center text-accent font-bold text-xl">
              {patient.full_name.split(" ").slice(0,2).map(w=>w[0]).join("").toUpperCase()}
            </div>
            <div>
              <h1 className="font-display font-bold text-xl text-white">{patient.full_name}</h1>
              <p className="text-sm text-muted">{patient.patient_code} • {age} years / {patient.gender}</p>
              <div className="flex gap-2 mt-2">
                <span className="badge badge-purple">{patient.blood_group}</span>
                <span className="badge badge-blue">{patient.department}</span>
                <span className={`badge ${patient.status === "Active" ? "badge-green" : patient.status === "Critical" ? "badge-red" : "badge-gray"}`}>{patient.status}</span>
              </div>
            </div>
          </div>
          <button onClick={() => setShowEdit(true)} className="btn btn-primary"><Edit size={14} /> Edit Patient</button>
        </div>

        <div className="border-t border-border px-5 py-4 grid grid-cols-4 gap-4">
          <div><div className="text-[11px] text-subtle uppercase">Phone</div><div className="text-sm text-white">{patient.phone}</div></div>
          <div><div className="text-[11px] text-subtle uppercase">Email</div><div className="text-sm text-white">{patient.email || "—"}</div></div>
          <div><div className="text-[11px] text-subtle uppercase">Assigned Doctor</div><div className="text-sm text-white">{patient.assigned_doctor_name || "Unassigned"}</div></div>
          <div><div className="text-[11px] text-subtle uppercase">Insurance</div><div className="text-sm text-white">{patient.insurance_provider || "—"}</div></div>
        </div>

        {(patient.allergies || patient.chronic_conditions) && (
          <div className="border-t border-border px-5 py-4">
            {patient.allergies && <div className="text-[11px] text-danger uppercase mb-1">⚠ Allergies</div>}
            <p className="text-sm text-white mb-2">{patient.allergies}</p>
            {patient.chronic_conditions && <div className="text-[11px] text-warning uppercase mb-1">Chronic Conditions</div>}
            <p className="text-sm text-white">{patient.chronic_conditions}</p>
          </div>
        )}
      </div>

      <div className="flex gap-1 bg-surface border border-border rounded-xl p-1 w-fit mb-5">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-[13px] font-medium transition-all ${tab === t ? "bg-surface3 text-white" : "text-muted hover:text-white"}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="card">
        {tab === "Overview" && (
          <div className="p-5 grid grid-cols-2 gap-6">
            <div>
              <h3 className="font-display font-bold text-sm text-white mb-3">Contact Information</h3>
              <div className="space-y-2 text-sm">
                <div><span className="text-subtle">Address:</span> <span className="text-white ml-2">{patient.address || "—"}</span></div>
                <div><span className="text-subtle">Emergency Contact:</span> <span className="text-white ml-2">{patient.emergency_contact || "—"}</span></div>
                <div><span className="text-subtle">Emergency Phone:</span> <span className="text-white ml-2">{patient.emergency_phone || "—"}</span></div>
              </div>
            </div>
            <div>
              <h3 className="font-display font-bold text-sm text-white mb-3">Insurance Details</h3>
              <div className="space-y-2 text-sm">
                <div><span className="text-subtle">Provider:</span> <span className="text-white ml-2">{patient.insurance_provider || "—"}</span></div>
                <div><span className="text-subtle">Policy Number:</span> <span className="text-white ml-2">{patient.insurance_number || "—"}</span></div>
              </div>
            </div>
          </div>
        )}

        {tab === "Appointments" && (
          <div className="p-5">
            {patientAppointments.length === 0 ? (
              <div className="text-center text-muted py-8">No appointments found</div>
            ) : (
              <table className="data-table">
                <thead><tr><th>Date</th><th>Time</th><th>Doctor</th><th>Type</th><th>Status</th></tr></thead>
                <tbody>
                  {patientAppointments.map(a => (
                    <tr key={a.id}>
                      <td className="text-white">{a.appointment_date}</td>
                      <td className="text-white">{a.appointment_time}</td>
                      <td className="text-white">{a.doctor_name}</td>
                      <td className="text-muted">{a.type}</td>
                      <td><span className={`badge ${a.status === "Completed" ? "badge-green" : a.status === "Cancelled" ? "badge-red" : "badge-yellow"}`}>{a.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === "Prescriptions" && (
          <div className="p-5">
            {prescriptions.length === 0 ? (
              <div className="text-center text-muted py-8">No prescriptions found</div>
            ) : (
              <table className="data-table">
                <thead><tr><th>Rx Code</th><th>Date</th><th>Doctor</th><th>Diagnosis</th><th>Status</th></tr></thead>
                <tbody>
                  {prescriptions.map(p => (
                    <tr key={p.id}>
                      <td className="font-mono text-accent">{p.rx_code}</td>
                      <td className="text-white">{p.issue_date}</td>
                      <td className="text-white">{p.doctor_name}</td>
                      <td className="text-muted">{p.diagnosis || "—"}</td>
                      <td><span className={`badge ${p.status === "Active" ? "badge-green" : "badge-gray"}`}>{p.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === "Lab Tests" && (
          <div className="p-5">
            {labTests.length === 0 ? (
              <div className="text-center text-muted py-8">No lab tests found</div>
            ) : (
              <table className="data-table">
                <thead><tr><th>Lab Code</th><th>Test</th><th>Category</th><th>Date</th><th>Result</th><th>Status</th></tr></thead>
                <tbody>
                  {labTests.map(l => (
                    <tr key={l.id}>
                      <td className="font-mono text-accent">{l.lab_code}</td>
                      <td className="text-white">{l.test_name}</td>
                      <td className="text-muted">{l.test_category}</td>
                      <td className="text-white">{l.ordered_date}</td>
                      <td className={l.is_abnormal ? "text-danger" : "text-success"}>{l.result_value || "—"}</td>
                      <td><span className={`badge ${l.status === "Ready" ? "badge-green" : "badge-yellow"}`}>{l.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === "Invoices" && (
          <div className="p-5">
            {invoices.length === 0 ? (
              <div className="text-center text-muted py-8">No invoices found</div>
            ) : (
              <table className="data-table">
                <thead><tr><th>Invoice</th><th>Date</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead>
                <tbody>
                  {invoices.map(i => (
                    <tr key={i.id}>
                      <td className="font-mono text-accent">{i.invoice_code}</td>
                      <td className="text-white">{i.issue_date}</td>
                      <td className="text-white">₹{i.total.toFixed(2)}</td>
                      <td className="text-success">₹{i.paid_amount.toFixed(2)}</td>
                      <td className={i.balance > 0 ? "text-warning" : "text-success"}>₹{i.balance.toFixed(2)}</td>
                      <td><span className={`badge ${i.status === "Paid" ? "badge-green" : i.status === "Overdue" ? "badge-red" : "badge-yellow"}`}>{i.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === "Vitals" && (
          <div className="p-5">
            {vitals.length === 0 ? (
              <div className="text-center text-muted py-8">No vitals recorded</div>
            ) : (
              <div className="space-y-4">
                {vitals.slice(0, 10).map(v => (
                  <div key={v.id} className="bg-surface2 border border-border rounded-lg p-4">
                    <div className="text-xs text-subtle mb-2">{v.recorded_at}</div>
                    <div className="grid grid-cols-4 gap-4 text-sm">
                      <div><span className="text-subtle">BP:</span> <span className="text-white">{v.blood_pressure_sys}/{v.blood_pressure_dia} mmHg</span></div>
                      <div><span className="text-subtle">HR:</span> <span className="text-white">{v.heart_rate} bpm</span></div>
                      <div><span className="text-subtle">Temp:</span> <span className="text-white">{v.temperature}°F</span></div>
                      <div><span className="text-subtle">SpO2:</span> <span className="text-white">{v.spo2}%</span></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "Medical Records" && (
          <div className="p-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-display font-bold text-sm text-white">EMR / EHR Records</h3>
              <button onClick={() => setShowAddRecord(true)} className="btn btn-xs btn-primary"><Plus size={12} /> Add Record</button>
            </div>
            {medicalRecords.length === 0 ? (
              <div className="text-center text-muted py-12 border-2 border-dashed border-border rounded-2xl">
                <FileText size={32} className="mx-auto mb-3 opacity-20" />
                <p>No medical records found for this patient.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {medicalRecords.map(record => (
                  <div key={record.id} className="bg-surface2 border border-border rounded-xl p-4 flex justify-between items-start">
                    <div className="flex gap-4">
                      <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
                        <FileText size={20} />
                      </div>
                      <div>
                        <div className="font-bold text-white text-sm">{record.title}</div>
                        <div className="text-xs text-muted mt-0.5">{record.record_type} • Recorded by {record.doctor_name} on {record.created_at}</div>
                        {record.description && <p className="text-xs text-subtle mt-2 leading-relaxed">{record.description}</p>}
                      </div>
                    </div>
                    {record.attachment_path && (
                      <button className="icon-btn hover:text-accent" title="Download Attachment">
                        <Download size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showAddRecord && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center anim-fade-in">
          <div className="bg-surface border border-border2 rounded-2xl w-[450px] flex flex-col shadow-card">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h2 className="font-display font-bold text-base">Add Medical Record</h2>
              <button onClick={() => setShowAddRecord(false)} className="text-subtle hover:text-white"><X size={18} /></button>
            </div>
            <form onSubmit={e => {
              e.preventDefault();
              const f = e.target as HTMLFormElement;
              createRecordMut.mutate({
                patient_id: patientId,
                doctor_id: parseInt((f.elements.namedItem("doctor_id") as HTMLSelectElement).value),
                record_type: (f.elements.namedItem("record_type") as HTMLSelectElement).value as any,
                title: (f.elements.namedItem("title") as HTMLInputElement).value,
                description: (f.elements.namedItem("description") as HTMLTextAreaElement).value || undefined,
                attachment_path: (f.elements.namedItem("attachment_path") as HTMLInputElement).value || undefined,
              });
            }} className="p-6 space-y-4">
              <div><label className="form-label">Doctor *</label><select name="doctor_id" required className="select"><option value="">Select Doctor</option>{doctors.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}</select></div>
              <div><label className="form-label">Record Type *</label><select name="record_type" required className="select"><option value="Clinical Note">Clinical Note</option><option value="Diagnostic Report">Diagnostic Report</option><option value="Prescription Archive">Prescription Archive</option><option value="Imaging">Imaging</option><option value="Other">Other</option></select></div>
              <div><label className="form-label">Title *</label><input name="title" required className="input" placeholder="e.g., Post-op recovery note" /></div>
              <div><label className="form-label">Description</label><textarea name="description" className="textarea" rows={3} /></div>
              <div><label className="form-label">Attachment Path (Local)</label><input name="attachment_path" className="input" placeholder="e.g., C:/Records/report.pdf" /></div>
              <div className="flex gap-3 justify-end pt-4">
                <button type="button" onClick={() => setShowAddRecord(false)} className="btn btn-ghost">Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={createRecordMut.isPending}>Add Record</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEdit && patient && (
        <EditPatientModal
          open={showEdit}
          patient={patient}
          onClose={() => setShowEdit(false)}
        />
      )}
    </div>
  );
}
