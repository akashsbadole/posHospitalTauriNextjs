"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getBloodDonors, createBloodDonor, getBloodInventory, createBloodInventory, getBloodRequests, createBloodRequest, getPatients } from "@/lib/tauri";
import { toast } from "sonner";
import { Droplet, Plus, User, Package } from "lucide-react";

type Tab = "inventory" | "donors" | "requests";

export default function BloodBankPage() {
  const [tab, setTab] = useState<Tab>("inventory");
  const [showAddDonor, setShowAddDonor] = useState(false);
  const [showAddBlood, setShowAddBlood] = useState(false);
  const [showAddRequest, setShowAddRequest] = useState(false);
  const qc = useQueryClient();

  const { data: donors = [] } = useQuery({ queryKey: ["blood-donors"], queryFn: () => getBloodDonors() });
  const { data: inventory = [] } = useQuery({ queryKey: ["blood-inventory"], queryFn: getBloodInventory });
  const { data: requests = [] } = useQuery({ queryKey: ["blood-requests"], queryFn: () => getBloodRequests() });
  const { data: patients = [] } = useQuery({ queryKey: ["patients"], queryFn: () => getPatients() });

  const createDonorMut = useMutation({ mutationFn: createBloodDonor, onSuccess: () => { qc.invalidateQueries({ queryKey: ["blood-donors"] }); toast.success("Donor added!"); setShowAddDonor(false); }, onError: () => toast.error("Failed") });
  const createInvMut = useMutation({ mutationFn: createBloodInventory, onSuccess: () => { qc.invalidateQueries({ queryKey: ["blood-inventory"] }); toast.success("Blood added!"); setShowAddBlood(false); }, onError: () => toast.error("Failed") });
  const createReqMut = useMutation({ mutationFn: createBloodRequest, onSuccess: () => { qc.invalidateQueries({ queryKey: ["blood-requests"] }); toast.success("Request created!"); setShowAddRequest(false); }, onError: () => toast.error("Failed") });

  const totalUnits = inventory.filter(i => i.status === "Available").reduce((s, i) => s + i.units, 0);
  const bloodGroups = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Blood Bank</h1>
          <p className="page-subtitle">Donor management and blood inventory</p>
        </div>
        <div className="flex gap-2">
          {tab === "donors" && <button onClick={() => setShowAddDonor(true)} className="btn btn-primary"><Plus size={16} /> Add Donor</button>}
          {tab === "inventory" && <button onClick={() => setShowAddBlood(true)} className="btn btn-danger"><Plus size={16} /> Add Blood</button>}
          {tab === "requests" && <button onClick={() => setShowAddRequest(true)} className="btn btn-primary"><Plus size={16} /> New Request</button>}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3.5 mb-5">
        <div className="stat-card anim-fade-up d1">
          <div className="stat-value text-danger">{totalUnits}</div>
          <div className="stat-label">Available Units</div>
        </div>
        <div className="stat-card anim-fade-up d2">
          <div className="stat-value text-accent">{donors.length}</div>
          <div className="stat-label">Registered Donors</div>
        </div>
        <div className="stat-card anim-fade-up d3">
          <div className="stat-value text-warning">{requests.filter(r => r.status === "Pending").length}</div>
          <div className="stat-label">Pending Requests</div>
        </div>
        <div className="stat-card anim-fade-up d4">
          <div className="stat-value text-purple">{inventory.filter(i => new Date(i.expiry_date) < new Date(Date.now() + 7*24*60*60*1000)).length}</div>
          <div className="stat-label">Expiring Soon</div>
        </div>
      </div>

      <div className="tab-bar mb-4">
        <button onClick={() => setTab("inventory")} className={`tab-item ${tab === "inventory" ? "active" : ""}`}>Inventory</button>
        <button onClick={() => setTab("donors")} className={`tab-item ${tab === "donors" ? "active" : ""}`}>Donors</button>
        <button onClick={() => setTab("requests")} className={`tab-item ${tab === "requests" ? "active" : ""}`}>Requests</button>
      </div>

      <div className="card">
        {tab === "inventory" && (
          <table className="data-table">
            <thead><tr><th>Bag No.</th><th>Blood Group</th><th>Component</th><th>Units</th><th>Collected</th><th>Expires</th><th>Status</th></tr></thead>
            <tbody>
              {inventory.map(i => (
                <tr key={i.id}>
                  <td className="font-mono text-subtle">{i.bag_number}</td>
                  <td className="font-medium text-danger">{i.blood_group}</td>
                  <td>{i.component}</td>
                  <td>{i.units}</td>
                  <td>{i.collection_date}</td>
                  <td>{i.expiry_date}</td>
                  <td><span className={`badge ${i.status === "Available" ? "badge-green" : "badge-gray"}`}>{i.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === "donors" && (
          <table className="data-table">
            <thead><tr><th>Code</th><th>Name</th><th>Phone</th><th>Blood Group</th><th>Donations</th><th>Status</th></tr></thead>
            <tbody>
              {donors.map(d => (
                <tr key={d.id}>
                  <td className="font-mono text-subtle">{d.donor_code}</td>
                  <td className="font-medium text-white">{d.full_name}</td>
                  <td>{d.phone}</td>
                  <td className="text-danger font-bold">{d.blood_group}</td>
                  <td>{d.donation_count}</td>
                  <td><span className={`badge ${d.status === "Active" ? "badge-green" : "badge-gray"}`}>{d.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === "requests" && (
          <table className="data-table">
            <thead><tr><th>Request</th><th>Patient</th><th>Blood Group</th><th>Units</th><th>Urgency</th><th>Status</th></tr></thead>
            <tbody>
              {requests.map(r => (
                <tr key={r.id}>
                  <td className="font-mono text-subtle">{r.request_code}</td>
                  <td className="font-medium text-white">{r.patient_name}</td>
                  <td className="text-danger font-bold">{r.blood_group}</td>
                  <td>{r.units_required}</td>
                  <td><span className={`badge ${r.urgency === "Emergency" ? "badge-red" : "badge-yellow"}`}>{r.urgency}</span></td>
                  <td><span className={`badge ${r.status === "Approved" ? "badge-green" : r.status === "Pending" ? "badge-yellow" : "badge-gray"}`}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAddDonor && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-surface border border-border2 rounded-2xl w-[450px] p-6">
            <h2 className="font-display font-bold text-lg mb-4">Add Blood Donor</h2>
            <form onSubmit={e => { e.preventDefault(); const f = e.target as HTMLFormElement; createDonorMut.mutate({ full_name: (f.elements.namedItem("full_name") as HTMLInputElement).value, phone: (f.elements.namedItem("phone") as HTMLInputElement).value, blood_group: (f.elements.namedItem("blood_group") as HTMLSelectElement).value, dob: (f.elements.namedItem("dob") as HTMLInputElement).value || undefined, gender: (f.elements.namedItem("gender") as HTMLSelectElement).value || undefined }); }}>
              <div className="space-y-4">
                <div><label className="form-label">Full Name *</label><input name="full_name" required className="input" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="form-label">Phone *</label><input name="phone" required className="input" /></div>
                  <div><label className="form-label">Blood Group *</label><select name="blood_group" required className="select">{bloodGroups.map(b => <option key={b} value={b}>{b}</option>)}</select></div>
                </div>
                <div className="flex gap-3 justify-end pt-2">
                  <button type="button" onClick={() => setShowAddDonor(false)} className="btn btn-ghost">Cancel</button>
                  <button type="submit" className="btn btn-primary">Add Donor</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddBlood && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-surface border border-border2 rounded-2xl w-[450px] p-6">
            <h2 className="font-display font-bold text-lg mb-4">Add Blood to Inventory</h2>
            <form onSubmit={e => { e.preventDefault(); const f = e.target as HTMLFormElement; createInvMut.mutate({ blood_group: (f.elements.namedItem("blood_group") as HTMLSelectElement).value, units: parseInt((f.elements.namedItem("units") as HTMLInputElement).value), collection_date: (f.elements.namedItem("collection_date") as HTMLInputElement).value, expiry_date: (f.elements.namedItem("expiry_date") as HTMLInputElement).value }); }}>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="form-label">Blood Group *</label><select name="blood_group" required className="select">{bloodGroups.map(b => <option key={b} value={b}>{b}</option>)}</select></div>
                  <div><label className="form-label">Units *</label><input name="units" type="number" required className="input" /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="form-label">Collection Date *</label><input name="collection_date" type="date" required className="input" /></div>
                  <div><label className="form-label">Expiry Date *</label><input name="expiry_date" type="date" required className="input" /></div>
                </div>
                <div className="flex gap-3 justify-end pt-2">
                  <button type="button" onClick={() => setShowAddBlood(false)} className="btn btn-ghost">Cancel</button>
                  <button type="submit" className="btn btn-danger">Add Blood</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddRequest && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-surface border border-border2 rounded-2xl w-[450px] p-6">
            <h2 className="font-display font-bold text-lg mb-4">New Blood Request</h2>
            <form onSubmit={e => { e.preventDefault(); const f = e.target as HTMLFormElement; createReqMut.mutate({ patient_id: parseInt((f.elements.namedItem("patient_id") as HTMLSelectElement).value), blood_group: (f.elements.namedItem("blood_group") as HTMLSelectElement).value, units_required: parseInt((f.elements.namedItem("units_required") as HTMLInputElement).value), urgency: (f.elements.namedItem("urgency") as HTMLSelectElement).value }); }}>
              <div className="space-y-4">
                <div><label className="form-label">Patient *</label><select name="patient_id" required className="select"><option value="">Select Patient</option>{patients.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="form-label">Blood Group *</label><select name="blood_group" required className="select">{bloodGroups.map(b => <option key={b} value={b}>{b}</option>)}</select></div>
                  <div><label className="form-label">Units *</label><input name="units_required" type="number" required className="input" /></div>
                </div>
                <div><label className="form-label">Urgency</label><select name="urgency" className="select"><option value="Normal">Normal</option><option value="Emergency">Emergency</option></select></div>
                <div className="flex gap-3 justify-end pt-2">
                  <button type="button" onClick={() => setShowAddRequest(false)} className="btn btn-ghost">Cancel</button>
                  <button type="submit" className="btn btn-primary">Submit Request</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
