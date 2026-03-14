"use client";
import { useQuery } from "@tanstack/react-query";
import { getDashboardStats } from "@/lib/tauri";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area } from "recharts";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MOCK_REVENUE = MONTHS.map((m,i)=>({ month:m, revenue: 180000 + Math.sin(i*0.8)*40000 + i*8000, expenses: 90000 + Math.sin(i)*20000 }));
const MOCK_PATIENTS = MONTHS.map((m,i)=>({ month:m, new: 40+Math.round(Math.sin(i)*15), discharged: 35+Math.round(Math.cos(i)*10) }));
const MOCK_DEPT = [
  {name:"Cardiology",val:24},{name:"General",val:38},{name:"Neurology",val:18},
  {name:"Ortho",val:22},{name:"Gynecology",val:16},{name:"Pediatrics",val:20},
];
const MOCK_BED = Array.from({length:30},(_,i)=>({ day:i+1, occupied:38+Math.round(Math.sin(i*0.4)*8), available:26-Math.round(Math.sin(i*0.4)*8) }));
const COLORS = ["#00d4ff","#00ff9d","#c77dff","#ffd93d","#ff6b6b","#8899bb"];

const TIP = { contentStyle:{background:"#161d2a",border:"1px solid #1f2d42",borderRadius:"8px",fontSize:"12px",color:"#e8f0fe"}, cursor:{fill:"rgba(255,255,255,0.04)"} };

export default function AnalyticsPage() {
  const { data: stats } = useQuery({ queryKey:["dashboard-stats"], queryFn:getDashboardStats });
  const fmt = (n:number)=>`₹${(n/1000).toFixed(0)}K`;

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Analytics & Reports</h1><p className="page-subtitle">Full operational overview</p></div>
        <div className="flex gap-2">
          {["This Month","Last 3 Months","This Year"].map(r=>(
            <button key={r} className={`btn btn-sm ${r==="This Month"?"btn-primary":"btn-ghost"}`}>{r}</button>
          ))}
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-3.5 mb-6">
        {[
          {l:"Monthly Revenue",v:`₹${((stats?.monthly_revenue??0)/100000).toFixed(1)}L`,c:"text-accent"},
          {l:"New Patients",v:stats?.new_patients_this_month??0,c:"text-success"},
          {l:"Avg Bed Occupancy",v:`${stats?Math.round((stats.beds_occupied/stats.total_beds)*100):0}%`,c:"text-warning"},
          {l:"Pending Claims",v:stats?.pending_claims??0,c:"text-danger"},
        ].map(k=>(
          <div key={k.l} className="stat-card anim-fade-up">
            <div className={`stat-value ${k.c}`}>{k.v}</div>
            <div className="stat-label">{k.l}</div>
          </div>
        ))}
      </div>

      {/* Revenue + Patients */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="card">
          <div className="card-header"><h3 className="card-title">Revenue vs Expenses (12 months)</h3></div>
          <div className="p-4">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={MOCK_REVENUE}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#00d4ff" stopOpacity={0.15}/><stop offset="95%" stopColor="#00d4ff" stopOpacity={0}/></linearGradient>
                  <linearGradient id="exp" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ff6b6b" stopOpacity={0.1}/><stop offset="95%" stopColor="#ff6b6b" stopOpacity={0}/></linearGradient>
                </defs>
                <XAxis dataKey="month" tick={{fill:"#4a607a",fontSize:11}} axisLine={false} tickLine={false} />
                <YAxis tick={{fill:"#4a607a",fontSize:11}} axisLine={false} tickLine={false} tickFormatter={fmt} />
                <Tooltip {...TIP} formatter={(v:number)=>[fmt(v)]} />
                <Area type="monotone" dataKey="revenue" stroke="#00d4ff" strokeWidth={2} fill="url(#rev)" name="Revenue" />
                <Area type="monotone" dataKey="expenses" stroke="#ff6b6b" strokeWidth={2} fill="url(#exp)" name="Expenses" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3 className="card-title">Patient Flow (12 months)</h3></div>
          <div className="p-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={MOCK_PATIENTS}>
                <XAxis dataKey="month" tick={{fill:"#4a607a",fontSize:11}} axisLine={false} tickLine={false} />
                <YAxis tick={{fill:"#4a607a",fontSize:11}} axisLine={false} tickLine={false} />
                <Tooltip {...TIP} />
                <Bar dataKey="new" fill="#00d4ff" radius={[3,3,0,0]} name="New Patients" />
                <Bar dataKey="discharged" fill="#4a607a" radius={[3,3,0,0]} name="Discharged" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Dept distribution + Bed occupancy */}
      <div className="grid grid-cols-[320px_1fr] gap-4 mb-4">
        <div className="card">
          <div className="card-header"><h3 className="card-title">Patients by Department</h3></div>
          <div className="p-4 flex flex-col items-center">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={MOCK_DEPT} dataKey="val" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3}>
                  {MOCK_DEPT.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip {...TIP} />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 w-full mt-2">
              {MOCK_DEPT.map((d,i) => (
                <div key={d.name} className="flex items-center gap-1.5 text-[11px]">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{background:COLORS[i%COLORS.length]}} />
                  <span className="text-muted flex-1">{d.name}</span>
                  <span className="text-white font-semibold">{d.val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3 className="card-title">Bed Occupancy (30 days)</h3></div>
          <div className="p-4">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={MOCK_BED}>
                <defs>
                  <linearGradient id="occ" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ffd93d" stopOpacity={0.15}/><stop offset="95%" stopColor="#ffd93d" stopOpacity={0}/></linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{fill:"#4a607a",fontSize:10}} axisLine={false} tickLine={false} />
                <YAxis tick={{fill:"#4a607a",fontSize:11}} axisLine={false} tickLine={false} />
                <Tooltip {...TIP} />
                <Area type="monotone" dataKey="occupied" stroke="#ffd93d" strokeWidth={2} fill="url(#occ)" name="Occupied" />
                <Line type="monotone" dataKey="available" stroke="#4a607a" strokeWidth={1} dot={false} name="Available" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Top metrics table */}
      <div className="card">
        <div className="card-header"><h3 className="card-title">Department Performance Summary</h3></div>
        <table className="data-table">
          <thead><tr><th>Department</th><th>Total Patients</th><th>Avg Stay (days)</th><th>Revenue</th><th>Occupancy Rate</th><th>Satisfaction</th></tr></thead>
          <tbody>
            {[
              {dept:"Cardiology",patients:124,stay:4.2,rev:420000,occ:78,sat:94},
              {dept:"General Medicine",patients:238,stay:2.1,rev:180000,occ:65,sat:88},
              {dept:"Neurology",patients:87,stay:6.8,rev:310000,occ:82,sat:91},
              {dept:"Orthopedics",patients:103,stay:5.4,rev:290000,occ:71,sat:90},
              {dept:"Gynecology",patients:96,stay:3.2,rev:220000,occ:69,sat:95},
            ].map(r=>(
              <tr key={r.dept}>
                <td className="font-medium text-white">{r.dept}</td>
                <td className="text-muted">{r.patients}</td>
                <td className="text-muted">{r.stay}d</td>
                <td className="text-success font-semibold">₹{(r.rev/1000).toFixed(0)}K</td>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-surface3 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${r.occ>80?"bg-danger":r.occ>60?"bg-warning":"bg-success"}`} style={{width:`${r.occ}%`}} />
                    </div>
                    <span className="text-[12px] text-muted w-8">{r.occ}%</span>
                  </div>
                </td>
                <td><span className={`badge ${r.sat>=90?"badge-green":"badge-yellow"}`}>{r.sat}%</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
