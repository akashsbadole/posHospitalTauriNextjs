"use client";
import { useQuery } from "@tanstack/react-query";
import { getAuditLogs } from "@/lib/tauri";
import { useState } from "react";
import { Search, Download, Calendar } from "lucide-react";
import { format, subDays } from "date-fns";
import { toast } from "sonner";

const ENTITY_ICON: Record<string,string> = {
  patient:"👤", prescription:"💊", lab:"🔬", bed:"🛏", billing:"💳",
  appointment:"📅", staff:"👨‍⚕️", inventory:"📦", insurance:"🛡", default:"📋",
};

export default function AuditPage() {
  const [search, setSearch] = useState("");
  const [entity, setEntity] = useState("");
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: logs = [], isLoading } = useQuery({
    queryKey:["audit-logs", entity, dateFrom, dateTo],
    queryFn:()=>getAuditLogs(500, entity||undefined),
  });

  const filtered = logs.filter(l => {
    const matchesSearch = !search || 
      l.action.toLowerCase().includes(search.toLowerCase()) ||
      l.user_name.toLowerCase().includes(search.toLowerCase()) ||
      l.entity.toLowerCase().includes(search.toLowerCase());
    
    const logDate = l.timestamp.split(" ")[0];
    const matchesDate = (!dateFrom || logDate >= dateFrom) && (!dateTo || logDate <= dateTo);
    
    return matchesSearch && matchesDate;
  });

  const exportCSV = () => {
    const headers = ["ID", "Timestamp", "User", "Entity", "Action", "Details", "IP Address"];
    const rows = filtered.map(l => [
      l.id,
      l.timestamp,
      l.user_name,
      l.entity,
      l.action,
      l.details || "",
      l.ip_address || ""
    ]);
    
    const csv = [headers.join(","), ...rows.map(r => r.map(c => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit_logs_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Audit logs exported!");
  };

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Audit Logs</h1><p className="page-subtitle">{filtered.length} log entries</p></div>
        <button onClick={exportCSV} className="btn btn-ghost"><Download size={13} />Export CSV</button>
      </div>

      <div className="flex gap-3 mb-4">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by action, user, entity…" className="pl-9" />
        </div>
        
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-subtle" />
          <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} className="w-36" />
          <span className="text-subtle">to</span>
          <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} className="w-36" />
        </div>
        
        <select value={entity} onChange={e=>setEntity(e.target.value)} className="w-40">
          <option value="">All Entities</option>
          {["patient","appointment","prescription","lab","billing","insurance","staff","inventory","bed","user"].map(e=>(
            <option key={e} value={e}>{e.charAt(0).toUpperCase()+e.slice(1)}</option>
          ))}
        </select>
      </div>

      <div className="card">
        {isLoading ? <div className="py-12 text-center text-muted">Loading…</div>
        : filtered.length === 0 ? <div className="py-12 text-center text-muted">No logs found</div>
        : <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>#</th><th>Timestamp</th><th>User</th><th>Entity</th><th>Action</th><th>Details</th><th>IP</th></tr></thead>
              <tbody>
                {filtered.map(log=>(
                  <tr key={log.id}>
                    <td className="text-subtle text-[12px] font-mono">{log.id}</td>
                    <td className="text-muted text-[12px] font-mono">{log.timestamp}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center text-[10px] font-bold text-accent">
                          {log.user_name.split(" ").map((w:string)=>w[0]).join("").slice(0,2)}
                        </div>
                        <span className="text-white text-[12px]">{log.user_name}</span>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <span>{ENTITY_ICON[log.entity.toLowerCase()]??ENTITY_ICON.default}</span>
                        <span className="badge badge-blue text-[10px]">{log.entity}</span>
                      </div>
                    </td>
                    <td className="text-white text-[13px] font-medium">{log.action}</td>
                    <td className="text-muted text-[12px] max-w-[300px]">
                      <p className="truncate" title={log.details}>{log.details ?? "—"}</p>
                    </td>
                    <td className="text-subtle text-[11px] font-mono">{log.ip_address ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
      </div>
    </div>
  );
}
