"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getInvoices, recordPayment, exportInvoicePdf } from "@/lib/tauri";
import { useState } from "react";
import { Plus, Download, Search, Eye, CreditCard, FileText } from "lucide-react";
import { toast } from "sonner";
import type { InvoiceStatus, Invoice } from "@/types";
import { NewInvoiceModal } from "@/components/modules/NewInvoiceModal";
import { PartialPaymentModal } from "@/components/modules/PartialPaymentModal";
import { format } from "date-fns";

const STATUS_BADGE: Record<InvoiceStatus,string> = {
  Draft:"badge-gray",Pending:"badge-yellow",Paid:"badge-green",Partial:"badge-blue",Overdue:"badge-red",Cancelled:"badge-gray",
};

export default function BillingPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [showNewModal, setShowNewModal] = useState(false);
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const qc = useQueryClient();

  const { data: invoices = [], isLoading } = useQuery({
    queryKey:["invoices",statusFilter],
    queryFn:()=>getInvoices(statusFilter as InvoiceStatus||undefined),
  });

  const payMut = useMutation({
    mutationFn:({id,amount}:{id:number;amount:number})=>recordPayment(id,amount,"Cash"),
    onSuccess:()=>{ qc.invalidateQueries({queryKey:["invoices"]}); toast.success("Payment recorded"); },
    onError: (err: Error) => toast.error(err.message || "Failed to record payment"),
  });

  const totalRevenue = invoices.filter(i=>i.status==="Paid").reduce((s,i)=>s+i.paid_amount,0);
  const totalPending = invoices.filter(i=>i.status==="Pending"||i.status==="Partial").reduce((s,i)=>s+i.balance,0);
  const totalOverdue = invoices.filter(i=>i.status==="Overdue").length;
  const fmt = (n:number) => `₹${n.toLocaleString("en-IN")}`;

  const filtered = invoices.filter(i=>
    !search || i.patient_name?.toLowerCase().includes(search.toLowerCase()) || i.invoice_code.includes(search)
  );

  const handleExportCSV = () => {
    const headers = ["Invoice Code", "Patient", "Issue Date", "Due Date", "Status", "Subtotal", "Discount", "Tax", "Total", "Paid Amount", "Balance", "Payment Method"];
    const rows = filtered.map(i => [
      i.invoice_code,
      i.patient_name || "",
      i.issue_date,
      i.due_date,
      i.status,
      i.subtotal.toString(),
      i.discount.toString(),
      i.tax.toString(),
      i.total.toString(),
      i.paid_amount.toString(),
      i.balance.toString(),
      i.payment_method || ""
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.map(c => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoices_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Invoices exported to CSV!");
  };

  const handleDownloadPdf = async (invoiceId: number) => {
    try {
      const path = await exportInvoicePdf(invoiceId);
      toast.success(`Invoice PDF saved to ${path}`);
    } catch (e) {
      toast.error("Failed to export PDF: " + e);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Billing & Invoices</h1><p className="page-subtitle">{invoices.length} total invoices</p></div>
        <div className="flex gap-2.5">
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
          {[
            {l:"OPD",amt:72400,pct:75,c:"bg-accent"},
            {l:"Lab",amt:48200,pct:50,c:"bg-success"},
            {l:"Surgery",amt:86000,pct:90,c:"bg-purple"},
            {l:"Pharmacy",amt:33800,pct:35,c:"bg-warning"},
            {l:"IPD/Ward",amt:59600,pct:62,c:"bg-danger"},
          ].map(r=>(
            <div key={r.l} className="flex-1">
              <div className="flex justify-between text-[12px] mb-1.5">
                <span className="text-muted">{r.l}</span>
                <span className="text-white font-semibold">₹{(r.amt/1000).toFixed(0)}K</span>
              </div>
              <div className="h-1.5 bg-surface3 rounded-full overflow-hidden">
                <div className={`h-full ${r.c} rounded-full`} style={{width:`${r.pct}%`}} />
              </div>
            </div>
          ))}
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
                        <button className="icon-btn"><Eye size={12} /></button>
                        {inv.balance>0 && <button onClick={() => setPaymentInvoice(inv)} className="icon-btn hover:!text-success"><CreditCard size={12} /></button>}
                        <button onClick={() => handleDownloadPdf(inv.id)} className="icon-btn hover:!text-accent"><Download size={12} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
      </div>

      <NewInvoiceModal open={showNewModal} onClose={() => setShowNewModal(false)} />
      <PartialPaymentModal invoice={paymentInvoice} open={!!paymentInvoice} onClose={() => setPaymentInvoice(null)} />
    </div>
  );
}
