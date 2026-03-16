"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPatients, deletePatient } from "@/lib/tauri";
import { useState } from "react";
import { Search, Filter, Download, Eye, Edit, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import type { PatientStatus } from "@/types";
import { EditPatientModal } from "@/components/modules/EditPatientModal";
import { NewPatientModal } from "@/components/modules/NewPatientModal";
import { ConfirmDialog } from "@/components/modules/ConfirmDialog";
import { Pagination } from "@/components/ui/Pagination";
import { format } from "date-fns";

const STATUS_BADGE: Record<PatientStatus, string> = {
  Active:"badge-green", Admitted:"badge-yellow", Discharged:"badge-gray", Critical:"badge-red", OPD:"badge-blue",
};
const AVATAR_COLORS = ["bg-accent/20 text-accent","bg-purple/20 text-purple","bg-success/20 text-success","bg-danger/20 text-danger","bg-warning/20 text-warning"];
const initials = (n: string) => n.split(" ").slice(0,2).map(w=>w[0]).join("").toUpperCase();

const ITEMS_PER_PAGE = 50;

export default function PatientsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [editPatient, setEditPatient] = useState<any>(null);
  const [showNewPatient, setShowNewPatient] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const router = useRouter();
  const qc = useQueryClient();

  const handleSearch = (value: string) => {
    setSearch(value);
    if (searchTimeout) clearTimeout(searchTimeout);
    const timeout = setTimeout(() => setDebouncedSearch(value), 300);
    setSearchTimeout(timeout);
  };

  const { data: patients = [], isLoading } = useQuery({
    queryKey: ["patients", debouncedSearch, status],
    queryFn: () => getPatients(debouncedSearch || undefined, status || undefined),
  });

  const totalPages = Math.ceil(patients.length / ITEMS_PER_PAGE);
  const paginatedPatients = patients.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const deleteMut = useMutation({
    mutationFn: deletePatient,
    onSuccess: () => { 
      qc.invalidateQueries({ queryKey:["patients"] }); 
      toast.success("Patient deleted");
      setDeleteId(null);
    },
    onError: () => toast.error("Delete failed"),
  });

  const handleDelete = () => {
    if (deleteId) deleteMut.mutate(deleteId);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleExportCSV = () => {
    const headers = ["Patient Code", "Full Name", "DOB", "Gender", "Phone", "Email", "Blood Group", "Department", "Doctor", "Status", "Insurance Provider", "Insurance Number", "Address"];
    const rows = patients.map(p => [
      p.patient_code,
      p.full_name,
      p.dob,
      p.gender,
      p.phone,
      p.email || "",
      p.blood_group || "",
      p.department || "",
      p.assigned_doctor_name || "",
      p.status,
      p.insurance_provider || "",
      p.insurance_number || "",
      p.address || ""
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.map(c => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `patients_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Patients exported to CSV!");
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Patient Records</h1>
          <p className="page-subtitle">{patients.length} patients registered</p>
        </div>
        <div className="flex gap-2.5">
          <button onClick={handleExportCSV} className="btn btn-ghost"><Download size={13} />Export CSV</button>
          <button onClick={() => setShowNewPatient(true)} className="btn btn-primary"><Plus size={14} />Add Patient</button>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3 mb-5">
        {[
          { label:"Total", val:patients.length, c:"text-white" },
          { label:"Active", val:patients.filter(p=>p.status==="Active").length, c:"text-success" },
          { label:"Admitted", val:patients.filter(p=>p.status==="Admitted").length, c:"text-warning" },
          { label:"Critical", val:patients.filter(p=>p.status==="Critical").length, c:"text-danger" },
          { label:"OPD", val:patients.filter(p=>p.status==="OPD").length, c:"text-accent" },
        ].map(s => (
          <div key={s.label} className="card px-4 py-3">
            <div className={`font-display font-extrabold text-xl ${s.c}`}>{s.val}</div>
            <div className="text-[11px] text-subtle">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-3 mb-4">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input value={search} onChange={e=>handleSearch(e.target.value)} placeholder="Search by name, phone, patient code…" className="pl-9" />
        </div>
        <select value={status} onChange={e=>setStatus(e.target.value)} className="w-40">
          <option value="">All Status</option>
          {["Active","Admitted","Discharged","Critical","OPD"].map(s=><option key={s}>{s}</option>)}
        </select>
        <button className="btn btn-ghost"><Filter size={13} />More Filters</button>
      </div>

      <div className="card">
        {isLoading ? (
          <div className="py-16 text-center text-muted text-[13px]">Loading patients…</div>
        ) : patients.length === 0 ? (
          <div className="py-16 text-center text-muted text-[13px]">No patients found</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead><tr>
                  <th>Patient</th><th>Code</th><th>Age/Gender</th><th>Blood</th>
                  <th>Department</th><th>Doctor</th><th>Phone</th><th>Insurance</th><th>Status</th><th>Actions</th>
                </tr></thead>
                <tbody>
                  {paginatedPatients.map((p, i) => {
                    const age = new Date().getFullYear() - new Date(p.dob).getFullYear();
                    return (
                      <tr key={p.id}>
                        <td>
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold flex-shrink-0 ${AVATAR_COLORS[i%AVATAR_COLORS.length]}`}>{initials(p.full_name)}</div>
                            <div>
                              <div className="font-medium text-white">{p.full_name}</div>
                              {p.allergies && <div className="text-[10px] text-danger">⚠ Allergies</div>}
                            </div>
                          </div>
                        </td>
                        <td className="text-subtle text-[12px] font-mono">{p.patient_code}</td>
                        <td className="text-muted">{age}y / {p.gender[0]}</td>
                        <td><span className="badge badge-purple">{p.blood_group}</span></td>
                        <td><span className="badge badge-blue text-[10px]">{p.department}</span></td>
                        <td className="text-muted text-[12px]">{p.assigned_doctor_name ?? "Unassigned"}</td>
                        <td className="text-muted text-[12px] font-mono">{p.phone}</td>
                        <td className="text-muted text-[12px]">{p.insurance_provider ?? "—"}</td>
                        <td><span className={`badge ${STATUS_BADGE[p.status]}`}>{p.status}</span></td>
                        <td>
                          <div className="flex gap-1.5">
                            <button onClick={() => router.push(`/patients/${p.id}`)} className="icon-btn"><Eye size={12} /></button>
                            <button onClick={() => setEditPatient(p)} className="icon-btn hover:!text-accent"><Edit size={12} /></button>
                            <button onClick={() => setDeleteId(p.id)} className="icon-btn hover:!text-danger"><Trash2 size={12} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} totalItems={patients.length} itemsPerPage={ITEMS_PER_PAGE} />
          </>
        )}
      </div>

      {showNewPatient && (
        <NewPatientModal open={showNewPatient} onClose={() => setShowNewPatient(false)} />
      )}

      {editPatient && (
        <EditPatientModal patient={editPatient} open={!!editPatient} onClose={() => setEditPatient(null)} />
      )}

      <ConfirmDialog
        open={!!deleteId}
        title="Delete Patient"
        message="Are you sure you want to delete this patient? This will also delete all related appointments, prescriptions, lab tests, and invoices. This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        loading={deleteMut.isPending}
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
