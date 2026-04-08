"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getLabTests, updateLabStatus, uploadLabReport, deleteLabTest } from "@/lib/tauri";
import { sendLabResultNotification } from "@/lib/notifications";
import { useState } from "react";
import { Plus, Search, Upload, Eye, CheckCircle, FileUp, Share2, Mail, FileText, Trash2 } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import type { LabTest } from "@/types";
import { openFile, sendMessage } from "@/lib/tauri";
import { NewLabTestModal } from "@/components/modules/NewLabTestModal";
import { LabResultEntryModal } from "@/components/modules/LabResultEntryModal";
import { ConfirmDialog } from "@/components/modules/ConfirmDialog";

const STATUS_BADGE: Record<LabTest["status"],string> = {
  "Ordered":"badge-blue","Sample Collected":"badge-yellow","Processing":"badge-purple","Ready":"badge-green","Reviewed":"badge-gray",
};
const STATUS_STEPS: LabTest["status"][] = ["Ordered","Sample Collected","Processing","Ready","Reviewed"];

export default function LabPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showNewModal, setShowNewModal] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [entryTest, setEntryTest] = useState<{id: number; test_name: string; test_category: string; patient_name?: string} | null>(null);
  const qc = useQueryClient();

  const { data: tests = [], isLoading } = useQuery({
    queryKey:["lab-tests",statusFilter],
    queryFn:()=>getLabTests(statusFilter as LabTest["status"]||undefined),
  });

  const mut = useMutation({
    mutationFn:({id,status}:{id:number;status:LabTest["status"]})=>updateLabStatus(id,status),
    onSuccess:(_, variables)=>{
      qc.invalidateQueries({queryKey:["lab-tests"]});
      toast.success("Status updated");
      if (variables.status === "Ready") {
        const test = tests.find(t => t.id === variables.id);
        if (test) sendLabResultNotification(test.patient_name || "Patient", test.test_name);
      }
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteLabTest(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lab-tests"] });
      toast.success("Lab test deleted");
      setDeleteId(null);
    },
    onError: (err: Error) => toast.error(err.message || "Delete failed"),
  });

  const uploadMut = useMutation({
    mutationFn: ({ id, path }: { id: number; path: string }) => uploadLabReport(id, path),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["lab-tests"] }); toast.success("Report uploaded!"); },
    onError: () => toast.error("Upload failed"),
  });

  const handleUpload = async (id: number) => {
    try {
      const selected = await openDialog({
        multiple: false,
        filters: [{ name: 'Lab Reports', extensions: ['pdf', 'jpg', 'png'] }]
      });
      if (selected && typeof selected === 'string') {
        uploadMut.mutate({ id, path: selected });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const filtered = tests.filter(t=>!search||t.patient_name?.toLowerCase().includes(search.toLowerCase())||t.test_name.toLowerCase().includes(search.toLowerCase()));

  const handleViewReport = async (path: string) => {
    try {
      await openFile(path);
    } catch (e) {
      toast.error("Failed to open report: " + e);
    }
  };

  const handleShare = async (test: LabTest, channel: "WhatsApp" | "Email") => {
    const contact = channel === "WhatsApp" ? test.patient_phone : test.patient_email;
    if (!contact) {
      toast.error(`Patient ${channel === "WhatsApp" ? "phone number" : "email"} not found`);
      return;
    }
    try {
      await sendMessage({
        patient_id: test.patient_id,
        phone: test.patient_phone || "",
        email: test.patient_email || "",
        message_type: channel,
        message_body: `Dear ${test.patient_name}, your lab result for ${test.test_name} (${test.lab_code}) is ${test.status}.`,
      });
      toast.success(`Result shared via ${channel}!`);
    } catch (e) {
      toast.error("Failed to share: " + e);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Lab & Diagnostics</h1><p className="page-subtitle">{tests.length} tests total</p></div>
        <button onClick={() => setShowNewModal(true)} className="btn btn-primary"><Plus size={14} />Order Test</button>
      </div>

      {/* Status pipeline */}
      <div className="card p-5 mb-5">
        <div className="text-[11px] font-semibold text-subtle uppercase tracking-wider mb-3">Test Pipeline</div>
        <div className="flex items-center gap-2">
          {STATUS_STEPS.map((step,i) => {
            const count = tests.filter(t=>t.status===step).length;
            const colors = ["text-accent bg-accent/10","text-warning bg-warning/10","text-purple bg-purple/10","text-success bg-success/10","text-muted bg-muted/10"];
            return (
              <div key={step} className="flex items-center gap-2 flex-1">
                <div className={`flex-1 rounded-lg px-3 py-2.5 cursor-pointer transition-all hover:scale-[1.02] ${colors[i]}`}
                  onClick={()=>setStatusFilter(statusFilter===step?"":step)}>
                  <div className="font-display font-bold text-lg">{count}</div>
                  <div className="text-[11px] font-medium">{step}</div>
                </div>
                {i < STATUS_STEPS.length - 1 && <span className="text-subtle text-lg flex-shrink-0">›</span>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by patient, test name…" className="pl-9" />
        </div>
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} className="w-44">
          <option value="">All Statuses</option>
          {STATUS_STEPS.map(s=><option key={s}>{s}</option>)}
        </select>
      </div>

      <div className="card">
        {isLoading ? <div className="py-12 text-center text-muted">Loading…</div>
        : filtered.length === 0 ? <div className="py-12 text-center text-muted">No tests found</div>
        : <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr>
                <th>Lab Code</th><th>Patient</th><th>Test Name</th><th>Category</th>
                <th>Doctor</th><th>Ordered</th><th>Result</th><th>Abnormal?</th><th>Status</th><th>Actions</th>
              </tr></thead>
              <tbody>
                {filtered.map(t => (
                  <tr key={t.id}>
                    <td className="font-mono text-[12px] text-accent">{t.lab_code}</td>
                    <td className="font-medium text-white">{t.patient_name}</td>
                    <td className="text-white font-medium">{t.test_name}</td>
                    <td><span className="badge badge-purple text-[10px]">{t.test_category}</span></td>
                    <td className="text-muted text-[12px]">{t.doctor_name}</td>
                    <td className="text-muted text-[12px]">{t.ordered_date}</td>
                    <td className="text-[12px]">
                      {t.result_value ? (
                        <span className={t.is_abnormal ? "text-danger font-semibold" : "text-success"}>
                          {t.result_value} {t.result_unit}
                        </span>
                      ) : <span className="text-subtle">Pending</span>}
                    </td>
                    <td>{t.result_value ? <span className={`badge ${t.is_abnormal?"badge-red":"badge-green"}`}>{t.is_abnormal?"Yes":"No"}</span> : <span className="text-subtle text-[12px]">—</span>}</td>
                    <td><span className={`badge ${STATUS_BADGE[t.status]}`}>{t.status}</span></td>
                    <td>
                      <div className="flex gap-1.5">
                        {t.report_path ? (
                          <button className="icon-btn hover:!text-accent" title="View Report PDF" onClick={() => handleViewReport(t.report_path!)}><FileText size={12} /></button>
                        ) : (
                          <button className="icon-btn" title="View Details"><Eye size={12} /></button>
                        )}
                        {t.status !== "Reviewed" && (
                          <button className="icon-btn hover:!text-success"
                            onClick={()=>{
                              const next = STATUS_STEPS[STATUS_STEPS.indexOf(t.status)+1];
                              if(next) mut.mutate({id:t.id,status:next});
                            }}
                            title="Advance Status"><CheckCircle size={12} /></button>
                        )}
                        <button className="icon-btn hover:!text-accent" title="Enter Result" onClick={() => setEntryTest({ id: t.id, test_name: t.test_name, test_category: t.test_category, patient_name: t.patient_name })}><Upload size={12} /></button>
                        <button className="icon-btn hover:!text-purple" title="Upload PDF Report" onClick={() => handleUpload(t.id)}><FileUp size={12} /></button>
                        <button className="icon-btn hover:!text-green-500" title="Share via WhatsApp" onClick={() => handleShare(t, "WhatsApp")}><Share2 size={12} /></button>
                        <button className="icon-btn hover:!text-blue-400" title="Share via Email" onClick={() => handleShare(t, "Email")}><Mail size={12} /></button>
                        <button className="icon-btn hover:!text-danger" title="Delete" onClick={() => setDeleteId(t.id)}><Trash2 size={12} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
      </div>

      <ConfirmDialog
        open={!!deleteId}
        title="Delete Lab Test"
        message="Are you sure you want to delete this lab test? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        loading={deleteMut.isPending}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        onCancel={() => setDeleteId(null)}
      />

      <NewLabTestModal open={showNewModal} onClose={() => setShowNewModal(false)} />
      {entryTest && <LabResultEntryModal labTest={entryTest} open={!!entryTest} onClose={() => setEntryTest(null)} />}
    </div>
  );
}
