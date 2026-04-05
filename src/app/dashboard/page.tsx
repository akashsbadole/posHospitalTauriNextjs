"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getDashboardStats, getRecentActivity, getAppointments, getLowStockItems, getDueRefillRx } from "@/lib/tauri";
import { sendLowStockNotification, sendAppointmentReminder } from "@/lib/notifications";
import { AlertTriangle, TrendingUp, TrendingDown, RefreshCw, Clock } from "lucide-react";
import { format } from "date-fns";
import { useState, useEffect } from "react";
import type { DashboardStats } from "@/types";

function StatCard({ icon, value, label, change, trend, accent, delay, href }: {
  icon: string; value: string | number; label: string;
  change?: string; trend?: "up"|"down"; accent: string; delay: string; href?: string;
}) {
  const content = (
    <div className={`stat-card anim-fade-up ${delay} cursor-pointer hover:border-accent/30`}>
      <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-current to-transparent ${accent}`} />
      <div className={`absolute -top-5 -right-5 w-20 h-20 rounded-full blur-2xl anim-pulse-glow`} style={{ background: "currentColor", opacity: 0.07 }} />
      <div className="text-xl mb-3">{icon}</div>
      <div className={`stat-value ${accent}`}>{value}</div>
      <div className="stat-label">{label}</div>
      {change && (
        <div className={`text-[11px] flex items-center gap-1 ${trend === "up" ? "text-success" : "text-danger"}`}>
          {trend === "up" ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{change}
        </div>
      )}
    </div>
  );
  
  if (href) {
    return <a href={href}>{content}</a>;
  }
  return content;
}

function QuickStat({ icon, val, label }: { icon: string; val: number; label: string }) {
  return (
    <div className="card flex items-center gap-3 px-4 py-3 flex-1">
      <span className="text-xl">{icon}</span>
      <div>
        <div className="font-display font-extrabold text-lg text-white leading-tight">{val}</div>
        <div className="text-[11px] text-subtle">{label}</div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const today = format(new Date(), "yyyy-MM-dd");
  const qc = useQueryClient();
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  
  const { data: stats, isFetching: loadingStats } = useQuery<DashboardStats>({ queryKey: ["dashboard-stats"], queryFn: getDashboardStats });
  const { data: activity = [] } = useQuery({ queryKey: ["recent-activity"], queryFn: () => getRecentActivity(8) });
  const { data: appts = [] } = useQuery({ queryKey: ["appointments", today], queryFn: () => getAppointments(today) });
  const { data: lowStock = [] } = useQuery({ queryKey: ["low-stock"], queryFn: getLowStockItems });
  const { data: rxDue = [] } = useQuery({ queryKey: ["rx-due-refill"], queryFn: getDueRefillRx });

  useEffect(() => {
    if (!loadingStats && (stats || activity.length > 0)) {
      setLastUpdated(new Date());
    }
  }, [loadingStats, stats, activity]);

  useEffect(() => {
    if (lowStock.length > 0) {
      sendLowStockNotification();
    }
  }, [lowStock]);

  const [notifiedAppts, setNotifiedAppts] = useState<number[]>([]);

  useEffect(() => {
    const checkUpcoming = () => {
      const now = new Date();
      appts.forEach(a => {
        if (a.status === "Scheduled" && !notifiedAppts.includes(a.id)) {
          const [h, m] = a.appointment_time.split(":").map(Number);
          const apptTime = new Date();
          apptTime.setHours(h, m, 0, 0);

          const diff = (apptTime.getTime() - now.getTime()) / (1000 * 60);
          if (diff > 0 && diff <= 15) {
            sendAppointmentReminder(a.patient_name || "Patient", a.appointment_time);
            setNotifiedAppts(prev => [...prev, a.id]);
          }
        }
      });
    };

    checkUpcoming();
    const timer = setInterval(checkUpcoming, 30000);
    return () => clearInterval(timer);
  }, [appts, notifiedAppts]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    await qc.invalidateQueries({ queryKey: ["recent-activity"] });
    await qc.invalidateQueries({ queryKey: ["appointments"] });
    await qc.invalidateQueries({ queryKey: ["low-stock"] });
    await qc.invalidateQueries({ queryKey: ["rx-due-refill"] });
    setLastUpdated(new Date());
    setTimeout(() => setRefreshing(false), 500);
  };

  const s = stats;
  const occPct = s ? Math.round((s.beds_occupied / s.total_beds) * 100) : 0;
  const fmt = (n: number) => `₹${(n / 100000).toFixed(1)}L`;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-display font-bold text-xl text-white">Dashboard</h1>
          <p className="text-sm text-muted mt-0.5">Hospital overview at a glance</p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted">
              <Clock size={12} />
              Last updated: {format(lastUpdated, "h:mm a")}
            </div>
          )}
          <button onClick={handleRefresh} disabled={refreshing} className="btn btn-ghost btn-sm">
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Alerts */}
      {(s?.pending_labs ?? 0) > 0 && (
        <div className="flex items-center gap-2.5 px-4 py-2.5 bg-danger/8 border border-danger/20 rounded-lg text-danger text-[13px] mb-3">
          <AlertTriangle size={14} /><strong>{s!.pending_labs} lab results</strong>&nbsp;pending review.
          <a href="/lab" className="ml-auto text-[12px] underline">View →</a>
        </div>
      )}
      {(s?.low_stock_items ?? 0) > 0 && (
        <div className="flex items-center gap-2.5 px-4 py-2.5 bg-warning/8 border border-warning/20 rounded-lg text-warning text-[13px] mb-5">
          <AlertTriangle size={14} /><strong>{s!.low_stock_items} inventory items</strong>&nbsp;below threshold.
          <a href="/pharmacy" className="ml-auto text-[12px] underline">Reorder →</a>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3.5 mb-5">
        <StatCard icon="👥" value={s?.total_patients ?? "—"} label="Total Patients" change="↑ 12% vs last month" trend="up" accent="text-accent" delay="d1" href="/patients" />
        <StatCard icon="📅" value={s?.today_appointments ?? "—"} label="Today's Appointments" change="↑ 8 more than yesterday" trend="up" accent="text-success" delay="d2" href="/appointments" />
        <StatCard icon="🛏" value={`${s?.beds_occupied ?? 0}/${s?.total_beds ?? 0}`} label="Beds Occupied" change={`${occPct}% occupancy`} trend={occPct > 80 ? "up" : "down"} accent="text-warning" delay="d3" href="/wards" />
        <StatCard icon="💰" value={fmt(s?.today_revenue ?? 0)} label="Today's Revenue" change="↑ 18% vs yesterday" trend="up" accent="text-danger" delay="d4" href="/billing" />
      </div>

      {/* Quick stats */}
      <div className="flex gap-3 mb-5">
        <QuickStat icon="🔬" val={s?.pending_labs ?? 0} label="Pending Labs" />
        <QuickStat icon="💊" val={s?.rx_due_refill ?? 0} label="Rx Due Refill" />
        <QuickStat icon="🛡" val={s?.pending_claims ?? 0} label="Claims Pending" />
        <QuickStat icon="⚠️" val={s?.low_stock_items ?? 0} label="Low Stock" />
        <QuickStat icon="📥" val={s?.admissions_today ?? 0} label="Admissions" />
        <QuickStat icon="📤" val={s?.discharges_today ?? 0} label="Discharges" />
        <QuickStat icon="👤" val={s?.new_patients_this_month ?? 0} label="New This Month" />
      </div>

      {/* Panels row 1 */}
      <div className="grid grid-cols-[1fr_310px] gap-4 mb-4">
        {/* Appointments */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Today's Appointments</h3>
            <a href="/appointments" className="text-[12px] text-accent hover:underline">Schedule →</a>
          </div>
          {appts.length === 0 ? (
            <div className="py-10 text-center text-muted text-[13px]">No appointments today</div>
          ) : appts.slice(0, 7).map(a => (
            <div key={a.id} className="flex items-center gap-3 px-5 py-3 border-b border-border last:border-0 hover:bg-surface2 transition-colors cursor-pointer">
              <div className="text-[11px] font-bold text-subtle w-11 text-center leading-tight font-mono">{a.appointment_time}</div>
              <div className="w-2 h-2 rounded-full bg-success flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-white truncate">{a.patient_name}</div>
                <div className="text-[11px] text-subtle">{a.type}</div>
              </div>
              <div className="text-[11px] text-accent flex-shrink-0">{a.doctor_name}</div>
              <span className={`badge ${a.status === "Completed" ? "badge-green" : a.status === "Checked In" ? "badge-blue" : a.status === "Cancelled" ? "badge-red" : "badge-gray"}`}>{a.status}</span>
            </div>
          ))}
        </div>

        {/* Activity */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Recent Activity</h3>
            <a href="/audit" className="text-[12px] text-accent hover:underline">Audit →</a>
          </div>
          <div className="py-1">
            {activity.slice(0, 7).map(log => (
              <div key={log.id} className="flex gap-3 items-start px-5 py-2.5">
                <div className="w-7 h-7 rounded-[7px] bg-accent/10 flex items-center justify-center text-[13px] flex-shrink-0 mt-0.5">📋</div>
                <div>
                  <p className="text-[12.5px] text-muted leading-snug">{log.details ?? log.action}</p>
                  <p className="text-[11px] text-subtle mt-0.5">{log.timestamp}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Panels row 2 */}
      <div className="grid grid-cols-3 gap-4">
        {/* Low stock */}
        <div className="card">
          <div className="card-header"><h3 className="card-title">Inventory Alerts</h3><a href="/pharmacy" className="text-[12px] text-accent hover:underline">Reorder →</a></div>
          {lowStock.slice(0, 5).map(item => {
            const pct = Math.round((item.current_stock / item.max_capacity) * 100);
            return (
              <div key={item.id} className="flex items-center gap-3 px-5 py-2.5 border-b border-border last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-medium text-white truncate mb-1">{item.name}</div>
                  <div className="h-1 bg-surface3 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${pct < 15 ? "bg-danger" : pct < 30 ? "bg-warning" : "bg-accent"}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <div className={`text-[12px] font-semibold w-14 text-right ${pct < 15 ? "text-danger" : pct < 30 ? "text-warning" : "text-muted"}`}>{item.current_stock} {item.unit}</div>
              </div>
            );
          })}
          {lowStock.length === 0 && <div className="py-8 text-center text-success text-[13px]">✓ All stock levels OK</div>}
        </div>

        {/* Rx due refill */}
        <div className="card">
          <div className="card-header"><h3 className="card-title">Prescriptions Due Refill</h3><a href="/prescriptions" className="text-[12px] text-accent hover:underline">View →</a></div>
          {rxDue.slice(0, 5).map(rx => (
            <div key={rx.id} className="flex items-center gap-3 px-5 py-2.5 border-b border-border last:border-0">
              <div className="w-8 h-8 rounded-lg bg-purple/10 flex items-center justify-center text-sm flex-shrink-0">💊</div>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-medium text-white truncate">{rx.drugs[0]?.drug_name ?? "—"}</div>
                <div className="text-[11px] text-subtle truncate">{rx.patient_name}</div>
              </div>
              <span className="badge badge-red">Refill!</span>
            </div>
          ))}
          {rxDue.length === 0 && <div className="py-8 text-center text-success text-[13px]">✓ No refills due</div>}
        </div>

        {/* Claims breakdown */}
        <div className="card">
          <div className="card-header"><h3 className="card-title">Insurance Claims</h3><a href="/insurance" className="text-[12px] text-accent hover:underline">View all →</a></div>
          <div className="p-5 flex flex-col gap-3">
            {[
              { label:"Submitted",    val:4,  color:"bg-accent",   pct:40 },
              { label:"Under Review", val:2,  color:"bg-warning",  pct:20 },
              { label:"Approved",     val:8,  color:"bg-success",  pct:80 },
              { label:"Rejected",     val:1,  color:"bg-danger",   pct:10 },
            ].map(row => (
              <div key={row.label} className="flex items-center gap-3">
                <div className="text-[12px] text-muted w-28 flex-shrink-0">{row.label}</div>
                <div className="flex-1 h-1.5 bg-surface3 rounded-full overflow-hidden">
                  <div className={`h-full ${row.color} rounded-full`} style={{ width: `${row.pct}%` }} />
                </div>
                <div className="text-[12px] font-semibold text-white w-4 text-right">{row.val}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
