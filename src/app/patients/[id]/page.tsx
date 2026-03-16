"use client";
import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { getPatientById, getPatientVitals, getAppointments, getPrescriptions, getLabTests, getInvoices } from "@/lib/tauri";
import { ArrowLeft, Edit, Calendar, Pill, FlaskConical, FileText, Activity, User } from "lucide-react";
import { useState } from "react";

const TABS = ["Overview", "Appointments", "Prescriptions", "Lab Tests", "Invoices", "Vitals"] as const;
type Tab = typeof TABS[number];

export default function PatientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("Overview");
  const patientId = Number(params.id);

  const { data: patient, isLoading: loadingPatient } = useQuery({
    queryKey: ["patient", patientId],
    queryFn: () => getPatientById(patientId),
  });

  const { data: vitals = [] } = useQuery({
    queryKey: ["patient-vitals", patientId],
    queryFn: () => getPatientVitals(patientId),
  });

  const { data: appointments = [] } = useQuery({
    queryKey: ["patient-appointments", patientId],
    queryFn: () => getAppointments(undefined, undefined),
  });

  const patientAppointments = appointments.filter(a => a.patient_id === patientId);

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
          <button className="btn btn-primary"><Edit size={14} /> Edit Patient</button>
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
      </div>
    </div>
  );
}
