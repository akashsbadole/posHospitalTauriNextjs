"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getWards, getBeds, dischargePatient, updateBedStatus } from "@/lib/tauri";
import { useState } from "react";
import { Plus, LogOut } from "lucide-react";
import { clsx } from "clsx";
import { toast } from "sonner";
import type { Bed, BedStatus } from "@/types";

const BED_COLOR: Record<BedStatus,string> = {
  Occupied:"bg-danger/15 border-danger/30 text-danger",
  Available:"bg-success/10 border-success/20 text-success",
  Reserved:"bg-warning/10 border-warning/20 text-warning",
  Maintenance:"bg-muted/10 border-muted/20 text-muted",
};

export default function WardsPage() {
  const [selectedWard, setSelectedWard] = useState<number|null>(null);
  const [hoveredBed, setHoveredBed] = useState<Bed|null>(null);
  const qc = useQueryClient();

  const { data: wards = [] } = useQuery({ queryKey:["wards"], queryFn: getWards });
  const { data: beds = [] } = useQuery({ queryKey:["beds", selectedWard], queryFn:()=>getBeds(selectedWard??undefined) });

  const dischargeMut = useMutation({
    mutationFn: dischargePatient,
    onSuccess: () => { qc.invalidateQueries({queryKey:["beds"]}); toast.success("Patient discharged"); },
  });

  const activeWard = wards.find(w=>w.id===selectedWard) ?? wards[0];
  const occupied = beds.filter(b=>b.status==="Occupied").length;
  const available = beds.filter(b=>b.status==="Available").length;

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Ward & Bed Management</h1><p className="page-subtitle">{occupied} occupied, {available} available</p></div>
        <button className="btn btn-primary"><Plus size={14} />Add Ward</button>
      </div>

      {/* Summary */}
      <div className="flex gap-3 mb-5">
        {[["Total Beds",beds.length,"text-white"],["Occupied",occupied,"text-danger"],["Available",available,"text-success"],["Reserved",beds.filter(b=>b.status==="Reserved").length,"text-warning"],["Maintenance",beds.filter(b=>b.status==="Maintenance").length,"text-muted"]].map(([l,v,c]) => (
          <div key={l as string} className="card flex-1 px-4 py-3">
            <div className={`font-display font-extrabold text-xl ${c}`}>{v}</div>
            <div className="text-[11px] text-subtle">{l}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[220px_1fr] gap-4">
        {/* Ward list */}
        <div className="card">
          <div className="card-header"><h3 className="card-title">Wards</h3></div>
          <div className="p-2">
            {wards.map(w => (
              <button key={w.id} onClick={()=>setSelectedWard(w.id)}
                className={clsx("w-full text-left px-3 py-2.5 rounded-lg text-[13px] transition-all mb-1",
                  selectedWard===w.id ? "bg-accent/10 text-accent" : "text-muted hover:bg-surface2 hover:text-white")}>
                <div className="font-medium">{w.ward_name}</div>
                <div className="text-[10px] text-subtle mt-0.5">{w.ward_type} · {w.total_beds} beds</div>
              </button>
            ))}
          </div>
        </div>

        {/* Bed grid */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">{activeWard?.ward_name ?? "Select a ward"}</h3>
            <div className="flex gap-3 text-[11px]">
              {(["Available","Occupied","Reserved","Maintenance"] as BedStatus[]).map(s=>(
                <span key={s} className="flex items-center gap-1.5">
                  <span className={clsx("w-2 h-2 rounded-sm inline-block",
                    s==="Occupied"?"bg-danger/60":s==="Available"?"bg-success/60":s==="Reserved"?"bg-warning/60":"bg-muted/60")} />{s}
                </span>
              ))}
            </div>
          </div>

          {beds.length === 0 ? <div className="py-12 text-center text-muted">Select a ward to see beds</div>
          : <div className="p-5">
              <div className="grid grid-cols-8 gap-3">
                {beds.map(bed => (
                  <div key={bed.id}
                    onMouseEnter={()=>setHoveredBed(bed)}
                    onMouseLeave={()=>setHoveredBed(null)}
                    className={clsx("aspect-square rounded-lg border flex flex-col items-center justify-center cursor-pointer transition-all hover:scale-105 relative text-[11px] font-bold", BED_COLOR[bed.status])}>
                    {bed.bed_number}
                    {bed.status==="Occupied" && bed.patient_name && (
                      <div className="text-[9px] font-normal text-center leading-tight mt-0.5 px-1 truncate w-full text-center opacity-80">
                        {bed.patient_name.split(" ")[0]}
                      </div>
                    )}
                    {hoveredBed?.id === bed.id && bed.status === "Occupied" && (
                      <button onClick={()=>dischargeMut.mutate(bed.id)}
                        className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-danger flex items-center justify-center"
                        title="Discharge">
                        <LogOut size={10} className="text-white" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>}

          {/* Admitted patients list */}
          {beds.some(b=>b.status==="Occupied") && (
            <div className="border-t border-border">
              <div className="p-4 text-[11px] font-semibold text-subtle uppercase tracking-wider">Current Admissions</div>
              <table className="data-table">
                <thead><tr><th>Bed</th><th>Patient</th><th>Admitted</th><th>Expected Discharge</th><th>Notes</th><th>Action</th></tr></thead>
                <tbody>
                  {beds.filter(b=>b.status==="Occupied").map(b=>(
                    <tr key={b.id}>
                      <td className="font-mono text-accent text-[12px]">{b.bed_number}</td>
                      <td className="font-medium text-white">{b.patient_name}</td>
                      <td className="text-muted text-[12px]">{b.admission_date ?? "—"}</td>
                      <td className="text-muted text-[12px]">{b.expected_discharge ?? "—"}</td>
                      <td className="text-muted text-[12px]">{b.notes ?? "—"}</td>
                      <td><button onClick={()=>dischargeMut.mutate(b.id)} className="btn btn-danger btn-sm">Discharge</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
