"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getInvoices, recordPayment, exportInvoicePdf, getRevenueBreakdown, deleteInvoice } from "@/lib/tauri";
import { useState } from "react";
import { Plus, Download, Search, Eye, CreditCard, FileText, Share2, Mail, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { InvoiceStatus, Invoice } from "@/types";
import { sendMessage } from "@/lib/tauri";
import { NewInvoiceModal } from "@/components/modules/NewInvoiceModal";
import { PartialPaymentModal } from "@/components/modules/PartialPaymentModal";
import { ConfirmDialog } from "@/components/modules/ConfirmDialog";
import { format } from "date-fns";

const STATUS_BADGE: Record<InvoiceStatus,string> = {
  Draft:"badge-gray",Pending:"badge-yellow",Paid:"badge-green",Partial:"badge-blue",Overdue:"badge-red",Cancelled:"badge-gray",
};

export default function BillingPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [showNewModal, setShowNewModal] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const qc = useQueryClient();

  const { data: invoices = [], isLoading } = useQuery({
    queryKey:["invoices",statusFilter],
    queryFn:()=>getInvoices(statusFilter as InvoiceStatus||undefined),
  });

  const { data: revenueBreakdown = [] } = useQuery({
    queryKey: ["revenue-breakdown"],
    queryFn: getRevenueBreakdown,
  });

  const payMut = useMutation({
    mutationFn:({id,amount}:{id:number;amount:number})=>recordPayment(id,amount,"Cash"),
    onSuccess:()=>{ qc.invalidateQueries({queryKey:["invoices"]}); toast.success("Payment recorded"); },
    onError: (err: Error) => toast.error(err.message || "Failed to record payment"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteInvoice(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("Invoice deleted");
      setDeleteId(null);
    },
    onError: (err: Error) => toast.error(err.message || "Delete failed"),
  });

  const totalRevenue = invoices.filter(i=>i.status==="Paid").reduce((s,i)=>s+i.paid_amount,0);
  const totalPending = invoices.filter(i=>i.status==="Pending"||i.status==="Partial").reduce((s,i)=>s+i.balance,0);
  const totalOverdue = invoices.filter(i=>i.status==="Overdue").length;
  const fmt = (n:number) => `₹${n.toLocaleString("en-IN")}`;

  const filtered = invoices.filter(i=>
    !search || i.patient_name?.toLowerCase().includes(search.toLowerCase()) || i.invoice_code.includes(search)
  );

  const handleExportCSV = async () => {
    try {
      const { exportInvoicesCsv } = await import("@/lib/tauri");
      const path = await exportInvoicesCsv();
      toast.success(`Invoices exported to ${path}`);
    } catch (e) {
      toast.error("Failed to export invoices: " + e);
    }
  };

  const handleExportGst = async () => {
    try {
      const { exportGstCsv } = await import("@/lib/tauri");
      // Default to current month
      const from = format(new Date().setDate(1), "yyyy-MM-dd");
      const to = format(new Date(), "yyyy-MM-dd");
      const path = await exportGstCsv(from, to);
      toast.success(`GST Report exported to ${path}`);
    } catch (e) {
      toast.error("Failed to export GST: " + e);
    }
  };

  const handleDownloadPdf = async (invoiceId: number) => {
    try {
      const { exportInvoicePdf, openFile } = await import("@/lib/tauri");
      const path = await exportInvoicePdf(invoiceId);
      toast.success(`Invoice PDF saved to ${path}`);
      await openFile(path);
    } catch (e) {
      toast.error("Failed to export PDF: " + e);
    }
  };

  const handleShare = async (inv: Invoice, channel: "WhatsApp" | "Email") => {
    const contact = channel === "WhatsApp" ? inv.patient_phone : inv.patient_email;
    if (!contact) {
      toast.error(`Patient ${channel === "WhatsApp" ? "phone number" : "email"} not found`);
      return;
    }
    try {
      await sendMessage({
        patient_id: inv.patient_id,
        phone: inv.patient_phone || "",
        email: inv.patient_email || "",
        message_type: channel,
        message_body: `Dear ${inv.patient_name}, your invoice ${inv.invoice_code} for ₹${inv.total} has been generated. Status: ${inv.status}.`,
      });
      toast.success(`Invoice shared via ${channel}!`);
    } catch (e) {
      toast.error("Failed to share: " + e);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Billing & Invoices</h1><p className="page-subtitle">{invoices.length} total invoices</p></div>
        <div className="flex gap-2.5">
          <button onClick={handleExportGst} className="btn btn-ghost !text-purple hover:!bg-purple/10 border-purple/20"><FileText size={13} />GST Report</button>
          <button onClick={handleExportCSV} className="btn btn-ghost"><Download size={13} />Export</button>
          <button onClick={() => setShowNewModal(true)} className="btn btn-primary"><Plus size={14} />New Invoice</button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3.5 mb-5">
        {[
          {l:"Total Collected",v:fmt(totalRevenue),c:"text-success",icon:"✅"},
          {l:"Outstanding",v:fmt(totalPending),c:"text-warning",icon:"⏳"},
          {l:"Overdue Invoices",v:totalOverdue,c:"text-danger",icon:"🔴"},
          {l:"Total Invoices",v:invoices.length,c:"text-accent",icon:"📄"},
        ].map(s=>(
          <div key={s.l} className="stat-card anim-fade-up">
            <div className="text-xl mb-2">{s.icon}</div>
            <div className={`stat-value ${s.c}`}>{s.v}</div>
            <div className="stat-label">{s.l}</div>
          </div>
        ))}
      </div>

      {/* Revenue by category */}
      <div className="card mb-5 p-5">
        <div className="text-[11px] font-semibold text-subtle uppercase tracking-wider mb-4">Revenue Breakdown</div>
        <div className="flex gap-4">
          {revenueBreakdown.length === 0 ? (
            <div className="text-muted text-xs italic">No data available</div>
          ) : (
            revenueBreakdown.map(r=>(
              <div key={r.category} className="flex-1">
                <div className="flex justify-between text-[12px] mb-1.5">
                  <span className="text-muted">{r.category}</span>
                  <span className="text-white font-semibold">₹{(r.amount/1000).toFixed(0)}K</span>
                </div>
                <div className="h-1.5 bg-surface3 rounded-full overflow-hidden">
                  <div className={`h-full ${r.color} rounded-full`} style={{width:`${r.percentage}%`}} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search invoice, patient…" className="pl-9" />
        </div>
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} className="w-36">
          <option value="">All Status</option>
          {["Draft","Pending","Paid","Partial","Overdue","Cancelled"].map(s=><option key={s}>{s}</option>)}
        </select>
      </div>

      <div className="card">
        {isLoading ? <div className="py-12 text-center text-muted">Loading…</div>
        : filtered.length === 0 ? <div className="py-12 text-center text-muted">No invoices found</div>
        : <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Invoice #</th><th>Patient</th><th>Date</th><th>Due</th><th>Items</th><th>Total</th><th>Paid</th><th>Balance</th><th>Method</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.map(inv=>(
                  <tr key={inv.id}>
                    <td className="font-mono text-[12px] text-accent">{inv.invoice_code}</td>
                    <td className="font-medium text-white">{inv.patient_name}</td>
                    <td className="text-muted text-[12px]">{inv.issue_date}</td>
                    <td className={`text-[12px] ${inv.status==="Overdue"?"text-danger":"text-muted"}`}>{inv.due_date}</td>
                    <td className="text-muted text-[12px]">{inv.items.length} items</td>
                    <td className="font-semibold text-white">{fmt(inv.total)}</td>
                    <td className="text-success">{fmt(inv.paid_amount)}</td>
                    <td className={inv.balance>0?"text-warning font-semibold":"text-muted"}>{fmt(inv.balance)}</td>
                    <td className="text-muted text-[12px]">{inv.payment_method ?? "—"}</td>
                    <td><span className={`badge ${STATUS_BADGE[inv.status]}`}>{inv.status}</span></td>
                    <td>
                      <div className="flex gap-1.5">
                        <button className="icon-btn" title="View Details"><Eye size={12} /></button>
                        {inv.balance>0 && <button onClick={() => setPaymentInvoice(inv)} title="Record Payment" className="icon-btn hover:!text-success"><CreditCard size={12} /></button>}
                        <button onClick={() => handleDownloadPdf(inv.id)} title="Download / Print PDF" className="icon-btn hover:!text-accent"><Download size={12} /></button>
                        <button onClick={() => handleShare(inv, "WhatsApp")} title="Share via WhatsApp" className="icon-btn hover:!text-green-500"><Share2 size={12} /></button>
                        <button onClick={() => handleShare(inv, "Email")} title="Share via Email" className="icon-btn hover:!text-blue"><Mail size={12} /></button>
                        <button onClick={() => setDeleteId(inv.id)} title="Delete" className="icon-btn hover:!text-danger"><Trash2 size={12} /></button>
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
        title="Delete Invoice"
        message="Are you sure you want to delete this invoice? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        loading={deleteMut.isPending}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        onCancel={() => setDeleteId(null)}
      />

      <NewInvoiceModal open={showNewModal} onClose={() => setShowNewModal(false)} />
      <PartialPaymentModal invoice={paymentInvoice} open={!!paymentInvoice} onClose={() => setPaymentInvoice(null)} />
    </div>
  );
}
