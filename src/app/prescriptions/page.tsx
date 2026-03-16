"use client";
import { useQuery } from "@tanstack/react-query";
import { getPrescriptions } from "@/lib/tauri";
import { useState } from "react";
import { Plus, Search, Eye, Printer } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { NewPrescriptionModal } from "@/components/modules/NewPrescriptionModal";
import { PrescriptionPrintView } from "@/components/modules/PrescriptionPrintView";

export default function PrescriptionsPage() {
  const [search, setSearch] = useState("");
  const [showNewModal, setShowNewModal] = useState(false);
  const [printRx, setPrintRx] = useState<number | null>(null);
  const [viewRx, setViewRx] = useState<number | null>(null);
  const { data: rxList = [], isLoading } = useQuery({ queryKey:["prescriptions"], queryFn:()=>getPrescriptions() });

  const filtered = rxList.filter(rx =>
    !search || rx.patient_name?.toLowerCase().includes(search.toLowerCase()) || rx.rx_code.includes(search)
  );

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Prescription Management</h1><p className="page-subtitle">{rxList.length} total prescriptions</p></div>
        <button onClick={() => setShowNewModal(true)} className="btn btn-primary"><Plus size={14} />New Prescription</button>
      </div>

      <div className="flex gap-3 mb-5">
        {[["Total",rxList.length,"text-white"],["Active",rxList.filter(r=>r.status==="Active").length,"text-success"],["Expired",rxList.filter(r=>r.status==="Expired").length,"text-muted"],["Cancelled",rxList.filter(r=>r.status==="Cancelled").length,"text-danger"]].map(([l,v,c]) => (
          <div key={l as string} className="card flex-1 px-4 py-3">
            <div className={`font-display font-extrabold text-xl ${c}`}>{v}</div>
            <div className="text-[11px] text-subtle">{l}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-3 mb-4">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by patient name or Rx code…" className="pl-9" />
        </div>
      </div>

      <div className="card">
        {isLoading ? <div className="py-12 text-center text-muted">Loading…</div>
        : filtered.length === 0 ? <div className="py-12 text-center text-muted">No prescriptions found</div>
        : <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Rx Code</th><th>Patient</th><th>Doctor</th><th>Diagnosis</th><th>Drugs</th><th>Issue Date</th><th>Valid Until</th><th>Refills Left</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.map(rx => {
                  const daysLeft = differenceInDays(new Date(rx.valid_until), new Date());
                  return (
                    <tr key={rx.id}>
                      <td className="font-mono text-[12px] text-accent">{rx.rx_code}</td>
                      <td className="font-medium text-white">{rx.patient_name}</td>
                      <td className="text-muted text-[12px]">{rx.doctor_name}</td>
                      <td className="text-muted text-[12px] max-w-[120px] truncate">{rx.diagnosis ?? "—"}</td>
                      <td>
                        <div className="flex flex-col gap-0.5">
                          {rx.drugs.slice(0,2).map(d=>(
                            <span key={d.id} className="text-[11px] text-white">{d.drug_name} <span className="text-subtle">{d.dosage} · {d.frequency}</span></span>
                          ))}
                          {rx.drugs.length > 2 && <span className="text-[11px] text-subtle">+{rx.drugs.length-2} more</span>}
                        </div>
                      </td>
                      <td className="text-muted text-[12px]">{rx.issue_date}</td>
                      <td className={`text-[12px] ${daysLeft < 3 ? "text-danger" : daysLeft < 7 ? "text-warning" : "text-muted"}`}>{rx.valid_until}</td>
                      <td>
                        <div className="flex flex-col gap-0.5">
                          {rx.drugs.map(d=>(
                            <span key={d.id} className={`text-[11px] ${d.refills_remaining === 0 ? "text-danger" : "text-muted"}`}>
                              {d.refills_remaining === 0 ? "⚠ 0 left" : `${d.refills_remaining} left`}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td><span className={`badge ${rx.status==="Active"?"badge-green":rx.status==="Expired"?"badge-gray":"badge-red"}`}>{rx.status}</span></td>
                      <td>
                        <div className="flex gap-1.5">
                          <button onClick={() => setViewRx(rx.id)} className="icon-btn"><Eye size={12} /></button>
                          <button onClick={() => setPrintRx(rx.id)} className="icon-btn hover:!text-accent"><Printer size={12} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>}
      </div>

      <NewPrescriptionModal open={showNewModal} onClose={() => setShowNewModal(false)} />
      <PrescriptionPrintView prescriptionId={viewRx ?? 0} open={viewRx !== null} onClose={() => setViewRx(null)} />
      <PrescriptionPrintView prescriptionId={printRx ?? 0} open={printRx !== null} onClose={() => setPrintRx(null)} />
    </div>
  );
}
