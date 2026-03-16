"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAppointments, updateAppointmentStatus } from "@/lib/tauri";
import { useState } from "react";
import { format, addDays, subDays } from "date-fns";
import { ChevronLeft, ChevronRight, Plus, Check, X, Clock, Calendar, List, UserCheck } from "lucide-react";
import type { AppointmentStatus } from "@/types";
import { toast } from "sonner";
import { NewAppointmentModal } from "@/components/modules/NewAppointmentModal";
import { WeeklyCalendar } from "@/components/modules/WeeklyCalendar";

const STATUS_BADGE: Record<AppointmentStatus,string> = {
  "Scheduled":"badge-blue","Checked In":"badge-green","In Progress":"badge-yellow",
  "Completed":"badge-gray","Cancelled":"badge-red","No Show":"badge-red",
};

const SLOTS = ["08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30","12:00","14:00","14:30","15:00","15:30","16:00","16:30","17:00","17:30"];

export default function AppointmentsPage() {
  const [date, setDate] = useState(new Date());
  const [showNewModal, setShowNewModal] = useState(false);
  const [view, setView] = useState<"day"|"week"|"queue">("day");
  const qc = useQueryClient();
  const ds = format(date, "yyyy-MM-dd");

  const { data: appts = [], isLoading } = useQuery({ queryKey:["appointments",ds], queryFn:()=>getAppointments(ds) });
  const mut = useMutation({
    mutationFn: ({ id, status }: { id:number; status:AppointmentStatus }) => updateAppointmentStatus(id, status),
    onSuccess: () => { qc.invalidateQueries({ queryKey:["appointments"] }); toast.success("Status updated"); },
  });

  const counts = { total:appts.length, scheduled:appts.filter(a=>a.status==="Scheduled").length, checkedIn:appts.filter(a=>a.status==="Checked In").length, completed:appts.filter(a=>a.status==="Completed").length };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Appointment Scheduling</h1>
          <p className="page-subtitle">{format(date,"EEEE, MMMM d yyyy")}</p>
        </div>
        <div className="flex gap-2">
          <div className="flex bg-surface border border-border rounded-lg p-1">
            <button onClick={() => setView("queue")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${view === "queue" ? "bg-surface2 text-white" : "text-muted hover:text-white"}`}>
              <UserCheck size={12} /> Queue
            </button>
            <button onClick={() => setView("day")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${view === "day" ? "bg-surface2 text-white" : "text-muted hover:text-white"}`}>
              <List size={12} /> Day
            </button>
            <button onClick={() => setView("week")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${view === "week" ? "bg-surface2 text-white" : "text-muted hover:text-white"}`}>
              <Calendar size={12} /> Week
            </button>
          </div>
          <button onClick={() => setShowNewModal(true)} className="btn btn-primary"><Plus size={14} />New Appointment</button>
        </div>
      </div>

      {view === "week" ? (
        <WeeklyCalendar onDateSelect={(d) => { setDate(d); setView("day"); }} />
      ) : view === "queue" ? (
        <div className="space-y-4">
          <div className="card p-6">
            <h3 className="font-display font-bold text-lg mb-4">OPD Token Queue - {format(date, "dd MMM yyyy")}</h3>
            <div className="grid gap-3">
              {appts.filter(a => a.status === "Scheduled" || a.status === "Checked In").length === 0 ? (
                <p className="text-muted text-center py-8">No patients in queue</p>
              ) : (
                appts.filter(a => a.status === "Scheduled" || a.status === "Checked In").map((appt, idx) => (
                  <div key={appt.id} className="flex items-center gap-4 p-4 bg-surface2 rounded-xl border border-border">
                    <div className="w-10 h-10 rounded-full bg-accent/20 text-accent flex items-center justify-center font-bold text-lg">
                      {idx + 1}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">{appt.patient_name}</div>
                      <div className="text-xs text-muted">{appt.appointment_time} - {appt.doctor_name}</div>
                    </div>
                    <div className="flex gap-2">
                      {appt.status === "Scheduled" && (
                        <button onClick={() => mut.mutate({ id: appt.id, status: "Checked In" })} className="btn btn-primary btn-sm">
                          Check In
                        </button>
                      )}
                      {appt.status === "Checked In" && (
                        <button onClick={() => mut.mutate({ id: appt.id, status: "In Progress" })} className="btn btn-success btn-sm">
                          Start
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex gap-3 mb-5">
            {[["Total",counts.total,"text-white"],["Scheduled",counts.scheduled,"text-accent"],["Checked In",counts.checkedIn,"text-success"],["Completed",counts.completed,"text-muted"]].map(([l,v,c]) => (
              <div key={l as string} className="card px-5 py-3 flex items-center gap-3 flex-1">
                <div><div className={`font-display font-extrabold text-xl ${c}`}>{v}</div><div className="text-[11px] text-subtle">{l}</div></div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-[1fr_260px] gap-4">
            <div className="card">
              <div className="card-header">
                <div className="flex items-center gap-3">
                  <button onClick={()=>setDate(d=>subDays(d,1))} className="icon-btn"><ChevronLeft size={14} /></button>
                  <span className="font-medium text-[13px]">{format(date,"MMM d, yyyy")}</span>
                  <button onClick={()=>setDate(d=>addDays(d,1))} className="icon-btn"><ChevronRight size={14} /></button>
                </div>
                <button onClick={()=>setDate(new Date())} className="btn btn-ghost btn-sm">Today</button>
              </div>
              {isLoading ? <div className="py-12 text-center text-muted text-[13px]">Loading…</div>
              : appts.length === 0 ? <div className="py-14 text-center text-muted text-[13px]">No appointments for this date</div>
              : <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead><tr><th>Time</th><th>Patient</th><th>Type</th><th>Doctor</th><th>Dept</th><th>Status</th><th>Notes</th><th>Actions</th></tr></thead>
                    <tbody>
                      {appts.map(a => (
                        <tr key={a.id}>
                          <td className="font-mono text-[12px] text-muted">{a.appointment_time}</td>
                          <td className="font-medium text-white">{a.patient_name}</td>
                          <td className="text-muted text-[12px]">{a.type}</td>
                          <td className="text-accent text-[12px]">{a.doctor_name}</td>
                          <td><span className="badge badge-blue text-[10px]">{a.department}</span></td>
                          <td><span className={`badge ${STATUS_BADGE[a.status]}`}>{a.status}</span></td>
                          <td className="text-muted text-[12px] max-w-[120px] truncate">{a.notes ?? "—"}</td>
                          <td>
                            <div className="flex gap-1.5">
                              {a.status === "Scheduled" && <button onClick={()=>mut.mutate({id:a.id,status:"Checked In"})} className="icon-btn hover:!text-success" title="Check In"><Check size={11} /></button>}
                              {a.status === "Checked In" && <button onClick={()=>mut.mutate({id:a.id,status:"Completed"})} className="icon-btn hover:!text-accent" title="Complete"><Clock size={11} /></button>}
                              {(a.status==="Scheduled"||a.status==="Checked In") && <button onClick={()=>mut.mutate({id:a.id,status:"Cancelled"})} className="icon-btn hover:!text-danger" title="Cancel"><X size={11} /></button>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>}
            </div>

            <div className="card">
              <div className="card-header"><h3 className="card-title">Time Slots</h3></div>
              <div className="p-3 grid grid-cols-2 gap-2">
                {SLOTS.map(slot => {
                  const booked = appts.some(a => a.appointment_time === slot);
                  return (
                    <button key={slot} disabled={booked}
                      className={`py-2 rounded-lg text-[12px] font-medium border transition-all ${booked ? "bg-danger/10 border-danger/20 text-danger cursor-not-allowed" : "bg-surface2 border-border text-muted hover:border-accent hover:text-accent"}`}>
                      {slot}{booked ? " ✕" : ""}
                    </button>
                  );
                })}
              </div>
              <div className="px-4 pb-4 pt-1 flex gap-3 text-[11px]">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-success/50 inline-block" />Available</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-danger/50 inline-block" />Booked</span>
              </div>
            </div>
          </div>
        </>
      )}

      <NewAppointmentModal open={showNewModal} onClose={() => setShowNewModal(false)} defaultDate={ds} />
    </div>
  );
}
