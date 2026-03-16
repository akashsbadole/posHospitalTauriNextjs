"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getDoctors, updateDoctorStatus, getStaff } from "@/lib/tauri";
import { useState } from "react";
import { Plus, Search, Edit, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Doctor, Staff } from "@/types";
import { NewDoctorModal } from "@/components/modules/NewDoctorModal";
import { EditDoctorModal } from "@/components/modules/EditDoctorModal";
import { EditStaffModal } from "@/components/modules/EditStaffModal";

const AVAIL_BADGE: Record<Doctor["availability_status"],string> = {
  "Available":"badge-green","In Surgery":"badge-yellow","On Round":"badge-blue","Off Duty":"badge-gray","On Leave":"badge-red",
};
const AVAIL_DOT: Record<Doctor["availability_status"],string> = {
  "Available":"bg-success","In Surgery":"bg-warning","On Round":"bg-accent","Off Duty":"bg-muted","On Leave":"bg-danger",
};
const SHIFT_BADGE: Record<Doctor["shift"],string> = { Morning:"badge-yellow", Evening:"badge-blue", Night:"badge-purple" };

export default function StaffPage() {
  const [tab, setTab] = useState<"doctors"|"staff"|"schedule">("doctors");
  const [search, setSearch] = useState("");
  const [showNewModal, setShowNewModal] = useState(false);
  const [editDoctor, setEditDoctor] = useState<Doctor | null>(null);
  const [editStaff, setEditStaff] = useState<Staff | null>(null);
  const qc = useQueryClient();

  const { data: doctors = [], isLoading: loadingDocs } = useQuery({ queryKey:["doctors"], queryFn:getDoctors });
  const { data: staff = [], isLoading: loadingStaff } = useQuery({ queryKey:["staff"], queryFn:getStaff });

  const statusMut = useMutation({
    mutationFn:({id,status}:{id:number;status:Doctor["availability_status"]})=>updateDoctorStatus(id,status),
    onSuccess:()=>{qc.invalidateQueries({queryKey:["doctors"]});toast.success("Status updated");},
  });

  const filteredDocs = doctors.filter(d=>!search||d.full_name.toLowerCase().includes(search.toLowerCase())||d.specialization.toLowerCase().includes(search.toLowerCase()));
  const filteredStaff = staff.filter(s=>!search||s.full_name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Doctors & Staff</h1><p className="page-subtitle">{doctors.length} doctors, {staff.length} staff members</p></div>
        <button onClick={() => setShowNewModal(true)} className="btn btn-primary"><Plus size={14} />Add Doctor</button>
      </div>

      {/* Summary */}
      <div className="flex gap-3 mb-5">
        {(["Available","In Surgery","On Round","Off Duty"] as Doctor["availability_status"][]).map(s=>(
          <div key={s} className="card flex-1 px-4 py-3">
            <div className="flex items-center gap-2 mb-1"><div className={`w-2 h-2 rounded-full ${AVAIL_DOT[s]}`} /><div className="text-[11px] text-subtle">{s}</div></div>
            <div className="font-display font-extrabold text-xl text-white">{doctors.filter(d=>d.availability_status===s).length}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-5 border-b border-border">
        {(["doctors","staff","schedule"] as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            className={`pb-3 text-[13px] font-medium capitalize border-b-2 transition-all ${tab===t?"border-accent text-accent":"border-transparent text-muted hover:text-white"}`}>{t === "schedule" ? "Duty Roster" : t}</button>
        ))}
      </div>

      <div className="flex gap-3 mb-4">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name or specialization…" className="pl-9" />
        </div>
      </div>

      {tab === "doctors" && (
        <div className="card">
          {loadingDocs ? <div className="py-12 text-center text-muted">Loading…</div>
          : <div className="overflow-x-auto">
              <table className="data-table">
                <thead><tr><th>Doctor</th><th>Code</th><th>Specialization</th><th>Qualification</th><th>Experience</th><th>Fee</th><th>Shift</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {filteredDocs.map((d,i)=>{
                    const colors=["bg-accent/20 text-accent","bg-purple/20 text-purple","bg-success/20 text-success","bg-danger/20 text-danger","bg-warning/20 text-warning"];
                    return (
                      <tr key={d.id}>
                        <td>
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold flex-shrink-0 ${colors[i%colors.length]}`}>
                              {d.full_name.split(" ").slice(0,2).map((w: string)=>w[0]).join("")}
                            </div>
                            <div>
                              <div className="font-medium text-white">{d.full_name}</div>
                              <div className="text-[11px] text-subtle">{d.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="font-mono text-[12px] text-subtle">{d.staff_code}</td>
                        <td><span className="badge badge-blue text-[10px]">{d.specialization}</span></td>
                        <td className="text-muted text-[12px]">{d.qualification}</td>
                        <td className="text-muted text-[12px]">{d.experience_years}y</td>
                        <td className="text-muted text-[12px]">₹{d.consultation_fee}</td>
                        <td><span className={`badge ${SHIFT_BADGE[d.shift]}`}>{d.shift}</span></td>
                        <td>
                          <select value={d.availability_status} onChange={e=>statusMut.mutate({id:d.id,status:e.target.value as Doctor["availability_status"]})}
                            className="text-[11px] py-1 px-2 rounded-lg w-auto h-auto">
                            {["Available","In Surgery","On Round","Off Duty","On Leave"].map(s=><option key={s}>{s}</option>)}
                          </select>
                        </td>
                        <td><div className="flex gap-1.5"><button onClick={() => setEditDoctor(d)} className="icon-btn hover:!text-accent"><Edit size={12} /></button><button className="icon-btn hover:!text-danger"><Trash2 size={12} /></button></div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>}
        </div>
      )}

      {tab === "staff" && (
        <div className="card">
          {loadingStaff ? <div className="py-12 text-center text-muted">Loading…</div>
          : <div className="overflow-x-auto">
              <table className="data-table">
                <thead><tr><th>Staff Member</th><th>Code</th><th>Role</th><th>Department</th><th>Shift</th><th>Phone</th><th>Joined</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {filteredStaff.map((s,i)=>{
                    const colors=["bg-accent/20 text-accent","bg-purple/20 text-purple","bg-success/20 text-success","bg-danger/20 text-danger","bg-warning/20 text-warning"];
                    return (
                      <tr key={s.id}>
                        <td><div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold flex-shrink-0 ${colors[i%colors.length]}`}>{s.full_name.split(" ").slice(0,2).map((w:string)=>w[0]).join("")}</div>
                          <div><div className="font-medium text-white">{s.full_name}</div><div className="text-[11px] text-subtle">{s.email}</div></div>
                        </div></td>
                        <td className="font-mono text-[12px] text-subtle">{s.staff_code}</td>
                        <td><span className="badge badge-purple text-[10px]">{s.role}</span></td>
                        <td><span className="badge badge-blue text-[10px]">{s.department}</span></td>
                        <td><span className={`badge ${s.shift==="Morning"?"badge-yellow":s.shift==="Evening"?"badge-blue":"badge-purple"}`}>{s.shift}</span></td>
                        <td className="text-muted text-[12px] font-mono">{s.phone}</td>
                        <td className="text-muted text-[12px]">{s.join_date}</td>
                        <td><span className={`badge ${s.status==="Active"?"badge-green":s.status==="On Leave"?"badge-yellow":"badge-red"}`}>{s.status}</span></td>
                        <td><div className="flex gap-1.5"><button className="icon-btn hover:!text-accent"><Edit size={12} /></button><button className="icon-btn hover:!text-danger"><Trash2 size={12} /></button></div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>}
        </div>
      )}

      {tab === "schedule" && (
        <div className="card">
          <div className="p-4 border-b border-border">
            <h3 className="font-display font-bold text-lg">Doctor Duty Roster - This Week</h3>
            <p className="text-sm text-muted">Weekly schedule view for all doctors</p>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Doctor</th>
                  <th>Specialization</th>
                  <th>Mon</th>
                  <th>Tue</th>
                  <th>Wed</th>
                  <th>Thu</th>
                  <th>Fri</th>
                  <th>Sat</th>
                  <th>Sun</th>
                </tr>
              </thead>
              <tbody>
                {doctors.map(doc => (
                  <tr key={doc.id}>
                    <td className="font-medium text-white">{doc.full_name}</td>
                    <td className="text-muted text-xs">{doc.specialization}</td>
                    <td><span className={`badge ${SHIFT_BADGE[doc.shift]}`}>{doc.shift}</span></td>
                    <td><span className={`badge ${SHIFT_BADGE[doc.shift]}`}>{doc.shift}</span></td>
                    <td><span className={`badge ${doc.shift === "Morning" ? "badge-yellow" : doc.shift === "Evening" ? "badge-blue" : "badge-purple"}`}>{doc.shift}</span></td>
                    <td><span className={`badge ${SHIFT_BADGE[doc.shift]}`}>{doc.shift}</span></td>
                    <td><span className={`badge ${doc.shift === "Night" ? "badge-purple" : "badge-yellow"}`}>{doc.shift === "Night" ? "Night" : "Morning"}</span></td>
                    <td><span className="badge badge-gray">Off</span></td>
                    <td><span className="badge badge-gray">Off</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <NewDoctorModal open={showNewModal} onClose={() => setShowNewModal(false)} />
      <EditDoctorModal open={!!editDoctor} onClose={() => setEditDoctor(null)} doctor={editDoctor} />
      <EditStaffModal open={!!editStaff} onClose={() => setEditStaff(null)} staffMember={editStaff} />
    </div>
  );
}
