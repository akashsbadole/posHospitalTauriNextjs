"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getInsuranceClaims, updateClaimStatus, deleteInsuranceClaim } from "@/lib/tauri";
import { useState } from "react";
import { Plus, Search, CheckCircle, XCircle, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ClaimStatus } from "@/types";
import { NewClaimModal } from "@/components/modules/NewClaimModal";
import { ConfirmDialog } from "@/components/modules/ConfirmDialog";

const STATUS_BADGE: Record<ClaimStatus,string> = {
  Draft:"badge-gray",Submitted:"badge-blue","Under Review":"badge-yellow",Approved:"badge-green",Rejected:"badge-red",Paid:"badge-green",
};

export default function InsurancePage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showNewModal, setShowNewModal] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const qc = useQueryClient();

  const { data: claims = [], isLoading } = useQuery({
    queryKey:["insurance-claims",statusFilter],
    queryFn:()=>getInsuranceClaims(statusFilter as ClaimStatus||undefined),
  });

  const statusMut = useMutation({
    mutationFn:({id,status,amount}:{id:number;status:ClaimStatus;amount?:number})=>updateClaimStatus(id,status,amount),
    onSuccess:()=>{qc.invalidateQueries({queryKey:["insurance-claims"]});toast.success("Claim status updated");},
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteInsuranceClaim(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["insurance-claims"] });
      toast.success("Claim deleted");
      setDeleteId(null);
    },
    onError: (err: Error) => toast.error(err.message || "Delete failed"),
  });

  const fmt = (n:number)=>`₹${n.toLocaleString("en-IN")}`;
  const filtered = claims.filter(c=>!search||c.patient_name?.toLowerCase().includes(search.toLowerCase())||c.claim_code.includes(search)||c.provider_name.toLowerCase().includes(search.toLowerCase()));

  const totalClaims = claims.reduce((s,c)=>s+c.claim_amount,0);
  const totalApproved = claims.filter(c=>c.status==="Approved"||c.status==="Paid").reduce((s,c)=>s+(c.approved_amount??0),0);

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Insurance Claims</h1><p className="page-subtitle">{claims.length} total claims</p></div>
        <button onClick={() => setShowNewModal(true)} className="btn btn-primary"><Plus size={14} />New Claim</button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-5 gap-3 mb-5">
        {([["Draft",0,"badge-gray"],["Submitted",0,"badge-blue"],["Under Review",0,"badge-yellow"],["Approved",0,"badge-green"],["Rejected",0,"badge-red"]] as [ClaimStatus,number,string][]).map(([s,,badge])=>(
          <div key={s} className="card px-4 py-3 cursor-pointer hover:border-border2 transition-all" onClick={()=>setStatusFilter(statusFilter===s?"":s)}>
            <div className="font-display font-extrabold text-xl text-white">{claims.filter(c=>c.status===s).length}</div>
            <span className={`badge ${badge} mt-1`}>{s}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3.5 mb-5">
        <div className="card px-5 py-4">
          <div className="text-[11px] text-subtle mb-1">Total Claimed</div>
          <div className="font-display font-extrabold text-xl text-accent">{fmt(totalClaims)}</div>
        </div>
        <div className="card px-5 py-4">
          <div className="text-[11px] text-subtle mb-1">Total Approved</div>
          <div className="font-display font-extrabold text-xl text-success">{fmt(totalApproved)}</div>
        </div>
        <div className="card px-5 py-4">
          <div className="text-[11px] text-subtle mb-1">Pending Review</div>
          <div className="font-display font-extrabold text-xl text-warning">{claims.filter(c=>c.status==="Under Review").length}</div>
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by patient, claim code, provider…" className="pl-9" />
        </div>
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} className="w-44">
          <option value="">All Statuses</option>
          {["Draft","Submitted","Under Review","Approved","Rejected","Paid"].map(s=><option key={s}>{s}</option>)}
        </select>
      </div>

      <div className="card">
        {isLoading ? <div className="py-12 text-center text-muted">Loading…</div>
        : filtered.length === 0 ? <div className="py-12 text-center text-muted">No claims found</div>
        : <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Claim Code</th><th>Patient</th><th>Provider</th><th>Policy #</th><th>Claimed</th><th>Approved</th><th>Submitted</th><th>Resolved</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.map(c=>(
                  <tr key={c.id}>
                    <td className="font-mono text-[12px] text-accent">{c.claim_code}</td>
                    <td className="font-medium text-white">{c.patient_name}</td>
                    <td className="text-muted text-[12px]">{c.provider_name}</td>
                    <td className="font-mono text-[12px] text-subtle">{c.policy_number}</td>
                    <td className="font-semibold text-white">{fmt(c.claim_amount)}</td>
                    <td className={c.approved_amount?"text-success font-semibold":"text-subtle text-[12px]"}>{c.approved_amount?fmt(c.approved_amount):"—"}</td>
                    <td className="text-muted text-[12px]">{c.submitted_date ?? "—"}</td>
                    <td className="text-muted text-[12px]">{c.resolved_date ?? "—"}</td>
                    <td><span className={`badge ${STATUS_BADGE[c.status]}`}>{c.status}</span></td>
                    <td>
                      <div className="flex gap-1.5">
                        {c.status==="Draft" && <button onClick={()=>statusMut.mutate({id:c.id,status:"Submitted"})} className="icon-btn hover:!text-accent" title="Submit"><Send size={12} /></button>}
                        {c.status==="Under Review" && <>
                          <button onClick={()=>statusMut.mutate({id:c.id,status:"Approved",amount:c.claim_amount})} className="icon-btn hover:!text-success" title="Approve"><CheckCircle size={12} /></button>
                          <button onClick={()=>statusMut.mutate({id:c.id,status:"Rejected"})} className="icon-btn hover:!text-danger" title="Reject"><XCircle size={12} /></button>
                        </>}
                        <button onClick={() => setDeleteId(c.id)} className="icon-btn hover:!text-danger" title="Delete"><Trash2 size={12} /></button>
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
        title="Delete Insurance Claim"
        message="Are you sure you want to delete this insurance claim? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        loading={deleteMut.isPending}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        onCancel={() => setDeleteId(null)}
      />

      <NewClaimModal open={showNewModal} onClose={() => setShowNewModal(false)} />
    </div>
  );
}
