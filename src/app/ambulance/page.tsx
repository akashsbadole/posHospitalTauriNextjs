"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAmbulances, createAmbulance, getAmbulanceCalls, createAmbulanceCall, updateAmbulanceStatus, getPatients } from "@/lib/tauri";
import { toast } from "sonner";
import { Car, Plus, MapPin, Phone } from "lucide-react";

type Tab = "calls" | "fleet";

export default function AmbulancePage() {
  const [tab, setTab] = useState<Tab>("calls");
  const [showAddAmbulance, setShowAddAmbulance] = useState(false);
  const [showAddCall, setShowAddCall] = useState(false);
  const qc = useQueryClient();

  const { data: ambulances = [] } = useQuery({ queryKey: ["ambulances"], queryFn: getAmbulances });
  const { data: calls = [] } = useQuery({ queryKey: ["ambulance-calls"], queryFn: () => getAmbulanceCalls() });
  const { data: patients = [] } = useQuery({ queryKey: ["patients"], queryFn: () => getPatients() });

  const createAmbMut = useMutation({ mutationFn: createAmbulance, onSuccess: () => { qc.invalidateQueries({ queryKey: ["ambulances"] }); toast.success("Ambulance added!"); setShowAddAmbulance(false); }, onError: () => toast.error("Failed") });
  const createCallMut = useMutation({ mutationFn: createAmbulanceCall, onSuccess: () => { qc.invalidateQueries({ queryKey: ["ambulance-calls"] }); toast.success("Call dispatched!"); setShowAddCall(false); }, onError: () => toast.error("Failed") });
  const updateMut = useMutation({ mutationFn: ({ id, status }: { id: number; status: string }) => updateAmbulanceStatus(id, status), onSuccess: () => { qc.invalidateQueries({ queryKey: ["ambulance-calls"] }); toast.success("Status updated!"); }, onError: () => toast.error("Failed") });

  const available = ambulances.filter(a => a.status === "Available").length;
  const activeCalls = calls.filter(c => c.status !== "Completed").length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Ambulance</h1>
          <p className="page-subtitle">Fleet management and emergency dispatch</p>
        </div>
        <div className="flex gap-2">
          {tab === "fleet" && <button onClick={() => setShowAddAmbulance(true)} className="btn btn-primary"><Plus size={16} /> Add Ambulance</button>}
          {tab === "calls" && <button onClick={() => setShowAddCall(true)} className="btn btn-danger"><Plus size={16} /> New Call</button>}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3.5 mb-5">
        <div className="stat-card anim-fade-up d1">
          <div className="stat-value text-accent">{ambulances.length}</div>
          <div className="stat-label">Total Fleet</div>
        </div>
        <div className="stat-card anim-fade-up d2">
          <div className="stat-value text-success">{available}</div>
          <div className="stat-label">Available</div>
        </div>
        <div className="stat-card anim-fade-up d3">
          <div className="stat-value text-warning">{activeCalls}</div>
          <div className="stat-label">Active Calls</div>
        </div>
        <div className="stat-card anim-fade-up d4">
          <div className="stat-value text-purple">{calls.filter(c => c.status === "Completed").length}</div>
          <div className="stat-label">Completed Today</div>
        </div>
      </div>

      <div className="tab-bar mb-4">
        <button onClick={() => setTab("calls")} className={`tab-item ${tab === "calls" ? "active" : ""}`}>Calls</button>
        <button onClick={() => setTab("fleet")} className={`tab-item ${tab === "fleet" ? "active" : ""}`}>Fleet</button>
      </div>

      <div className="card">
        {tab === "calls" && (
          <table className="data-table">
            <thead><tr><th>Call</th><th>Patient</th><th>Pickup</th><th>Destination</th><th>Ambulance</th><th>Time</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {calls.map(c => (
                <tr key={c.id}>
                  <td className="font-mono text-subtle">{c.call_code}</td>
                  <td className="font-medium text-white">{c.patient_name}</td>
                  <td className="max-w-[150px] truncate">{c.pickup_address}</td>
                  <td>{c.destination || "-"}</td>
                  <td>{c.ambulance_number || "-"}</td>
                  <td className="text-muted">{new Date(c.call_time).toLocaleTimeString()}</td>
                  <td><span className={`badge ${c.status === "Completed" ? "badge-green" : c.status === "Dispatched" ? "badge-yellow" : "badge-blue"}`}>{c.status}</span></td>
                  <td>
                    {c.status !== "Completed" && (
                      <div className="flex gap-1">
                        <button onClick={() => updateMut.mutate({ id: c.id, status: "PickedUp" })} className="btn btn-sm btn-ghost">Pickup</button>
                        <button onClick={() => updateMut.mutate({ id: c.id, status: "Completed" })} className="btn btn-sm btn-success">Done</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === "fleet" && (
          <table className="data-table">
            <thead><tr><th>Number</th><th>Type</th><th>License</th><th>Insurance</th><th>Last Service</th><th>Status</th></tr></thead>
            <tbody>
              {ambulances.map(a => (
                <tr key={a.id}>
                  <td className="font-mono font-bold text-accent">{a.ambulance_number}</td>
                  <td>{a.vehicle_type}</td>
                  <td className="text-muted">{a.license_number}</td>
                  <td>{a.insurance_expiry || "-"}</td>
                  <td>{a.last_service || "-"}</td>
                  <td><span className={`badge ${a.status === "Available" ? "badge-green" : a.status === "On Call" ? "badge-yellow" : "badge-red"}`}>{a.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAddAmbulance && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-surface border border-border2 rounded-2xl w-[400px] p-6">
            <h2 className="font-display font-bold text-lg mb-4">Add Ambulance</h2>
            <form onSubmit={e => { e.preventDefault(); const f = e.target as HTMLFormElement; createAmbMut.mutate({ ambulance_number: (f.elements.namedItem("ambulance_number") as HTMLInputElement).value, vehicle_type: (f.elements.namedItem("vehicle_type") as HTMLSelectElement).value, license_number: (f.elements.namedItem("license_number") as HTMLInputElement).value }); }}>
              <div className="space-y-4">
                <div><label className="form-label">Ambulance Number *</label><input name="ambulance_number" required className="input" placeholder="e.g., KA-01-AB-1234" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="form-label">Type</label><select name="vehicle_type" className="select"><option value="ALS">ALS</option><option value="BLS">BLS</option></select></div>
                  <div><label className="form-label">License Number *</label><input name="license_number" required className="input" /></div>
                </div>
                <div className="flex gap-3 justify-end pt-2">
                  <button type="button" onClick={() => setShowAddAmbulance(false)} className="btn btn-ghost">Cancel</button>
                  <button type="submit" className="btn btn-primary">Add</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddCall && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-surface border border-border2 rounded-2xl w-[450px] p-6">
            <h2 className="font-display font-bold text-lg mb-4">New Ambulance Call</h2>
            <form onSubmit={e => { e.preventDefault(); const f = e.target as HTMLFormElement; createCallMut.mutate({ patient_name: (f.elements.namedItem("patient_name") as HTMLInputElement).value, patient_phone: (f.elements.namedItem("patient_phone") as HTMLInputElement).value, pickup_address: (f.elements.namedItem("pickup_address") as HTMLInputElement).value, destination: (f.elements.namedItem("destination") as HTMLInputElement).value || undefined }); }}>
              <div className="space-y-4">
                <div><label className="form-label">Patient Name *</label><input name="patient_name" required className="input" /></div>
                <div><label className="form-label">Phone *</label><input name="patient_phone" required className="input" /></div>
                <div><label className="form-label">Pickup Address *</label><textarea name="pickup_address" required className="textarea" /></div>
                <div><label className="form-label">Destination Hospital</label><input name="destination" className="input" placeholder="Current hospital if transfer" /></div>
                <div className="flex gap-3 justify-end pt-2">
                  <button type="button" onClick={() => setShowAddCall(false)} className="btn btn-ghost">Cancel</button>
                  <button type="submit" className="btn btn-danger">Dispatch</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
