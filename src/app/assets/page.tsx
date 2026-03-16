"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAssetCategories, createAssetCategory, getAssets, createAsset, getAssetMaintenance, createAssetMaintenance } from "@/lib/tauri";
import { toast } from "sonner";
import { QrCode, Plus, Wrench, AlertTriangle } from "lucide-react";

type Tab = "assets" | "categories" | "maintenance";

export default function AssetsPage() {
  const [tab, setTab] = useState<Tab>("assets");
  const [showAddAsset, setShowAddAsset] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showAddMaintenance, setShowAddMaintenance] = useState(false);
  const qc = useQueryClient();

  const { data: categories = [], isLoading: catLoading } = useQuery({ queryKey: ["asset-categories"], queryFn: getAssetCategories });
  const { data: assets = [], isLoading: assetLoading } = useQuery({ queryKey: ["assets"], queryFn: () => getAssets() });
  const { data: maintenance = [], isLoading: maintLoading } = useQuery({ queryKey: ["asset-maintenance"], queryFn: () => getAssetMaintenance() });

  const createCatMut = useMutation({ mutationFn: createAssetCategory, onSuccess: () => { qc.invalidateQueries({ queryKey: ["asset-categories"] }); toast.success("Category created!"); setShowAddCategory(false); }, onError: () => toast.error("Failed") });
  const createAssetMut = useMutation({ mutationFn: createAsset, onSuccess: () => { qc.invalidateQueries({ queryKey: ["assets"] }); toast.success("Asset added!"); setShowAddAsset(false); }, onError: () => toast.error("Failed") });
  const createMaintMut = useMutation({ mutationFn: createAssetMaintenance, onSuccess: () => { qc.invalidateQueries({ queryKey: ["asset-maintenance"] }); toast.success("Maintenance logged!"); setShowAddMaintenance(false); }, onError: () => toast.error("Failed") });

  const totalValue = assets.reduce((sum, a) => sum + a.current_value, 0);
  const activeAssets = assets.filter(a => a.status === "Active").length;
  const underMaintenance = assets.filter(a => a.status === "Under Maintenance").length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Asset Management</h1>
          <p className="page-subtitle">Track hospital equipment, maintenance & depreciation</p>
        </div>
        <div className="flex gap-2">
          {tab === "assets" && <button onClick={() => setShowAddAsset(true)} className="btn btn-primary"><Plus size={16} /> Add Asset</button>}
          {tab === "categories" && <button onClick={() => setShowAddCategory(true)} className="btn btn-primary"><Plus size={16} /> Add Category</button>}
          {tab === "maintenance" && <button onClick={() => setShowAddMaintenance(true)} className="btn btn-primary"><Plus size={16} /> Log Maintenance</button>}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3.5 mb-5">
        <div className="stat-card anim-fade-up d1">
          <div className="stat-value text-accent">₹{(totalValue / 100000).toFixed(1)}L</div>
          <div className="stat-label">Total Value</div>
        </div>
        <div className="stat-card anim-fade-up d2">
          <div className="stat-value text-success">{assets.length}</div>
          <div className="stat-label">Total Assets</div>
        </div>
        <div className="stat-card anim-fade-up d3">
          <div className="stat-value text-success">{activeAssets}</div>
          <div className="stat-label">Active</div>
        </div>
        <div className="stat-card anim-fade-up d4">
          <div className="stat-value text-warning">{underMaintenance}</div>
          <div className="stat-label">Under Maintenance</div>
        </div>
      </div>

      <div className="tab-bar mb-4">
        <button onClick={() => setTab("assets")} className={`tab-item ${tab === "assets" ? "active" : ""}`}>Assets</button>
        <button onClick={() => setTab("categories")} className={`tab-item ${tab === "categories" ? "active" : ""}`}>Categories</button>
        <button onClick={() => setTab("maintenance")} className={`tab-item ${tab === "maintenance" ? "active" : ""}`}>Maintenance</button>
      </div>

      <div className="card">
        {tab === "assets" && (assetLoading ? <div className="py-12 text-center text-muted">Loading...</div> : (
          <table className="data-table">
            <thead><tr><th>Code</th><th>Name</th><th>Category</th><th>Location</th><th>Purchase Cost</th><th>Current Value</th><th>Status</th></tr></thead>
            <tbody>
              {assets.map(a => (
                <tr key={a.id}>
                  <td className="font-mono text-subtle">{a.asset_code}</td>
                  <td className="font-medium text-white">{a.asset_name}</td>
                  <td>{a.category_name}</td>
                  <td>{a.location || "-"}</td>
                  <td>₹{a.purchase_cost.toLocaleString()}</td>
                  <td>₹{a.current_value.toLocaleString()}</td>
                  <td><span className={`badge ${a.status === "Active" ? "badge-green" : a.status === "Under Maintenance" ? "badge-yellow" : "badge-red"}`}>{a.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}

        {tab === "categories" && (catLoading ? <div className="py-12 text-center text-muted">Loading...</div> : (
          <table className="data-table">
            <thead><tr><th>Category Name</th><th>Depreciation Rate</th><th>Description</th></tr></thead>
            <tbody>
              {categories.map(c => (
                <tr key={c.id}>
                  <td className="font-medium text-white">{c.category_name}</td>
                  <td>{c.depreciation_rate}%</td>
                  <td className="text-muted">{c.description || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}

        {tab === "maintenance" && (maintLoading ? <div className="py-12 text-center text-muted">Loading...</div> : (
          <table className="data-table">
            <thead><tr><th>Asset</th><th>Type</th><th>Description</th><th>Date</th><th>Cost</th><th>Vendor</th></tr></thead>
            <tbody>
              {maintenance.map(m => (
                <tr key={m.id}>
                  <td className="font-medium text-white">{m.asset_name}</td>
                  <td><span className={`badge ${m.maintenance_type === "Preventive" ? "badge-green" : m.maintenance_type === "Corrective" ? "badge-red" : "badge-yellow"}`}>{m.maintenance_type}</span></td>
                  <td className="text-muted max-w-[200px] truncate">{m.description}</td>
                  <td>{m.maintenance_date}</td>
                  <td>₹{m.cost.toLocaleString()}</td>
                  <td>{m.vendor || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>

      {showAddAsset && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-surface border border-border2 rounded-2xl w-[500px] p-6 space-y-4">
            <h2 className="font-display font-bold text-lg">Add Asset</h2>
            <form onSubmit={e => { e.preventDefault(); const f = e.target as HTMLFormElement; createAssetMut.mutate({ asset_name: (f.elements.namedItem("asset_name") as HTMLInputElement).value, category_id: parseInt((f.elements.namedItem("category_id") as HTMLSelectElement).value), purchase_date: (f.elements.namedItem("purchase_date") as HTMLInputElement).value, purchase_cost: parseFloat((f.elements.namedItem("purchase_cost") as HTMLInputElement).value), location: (f.elements.namedItem("location") as HTMLInputElement).value || undefined }); }}>
              <div className="space-y-4">
                <div><label className="form-label">Asset Name *</label><input name="asset_name" required className="input" /></div>
                <div><label className="form-label">Category *</label><select name="category_id" required className="select"><option value="">Select Category</option>{categories.map(c => <option key={c.id} value={c.id}>{c.category_name}</option>)}</select></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="form-label">Purchase Date *</label><input name="purchase_date" type="date" required className="input" /></div>
                  <div><label className="form-label">Purchase Cost *</label><input name="purchase_cost" type="number" required className="input" /></div>
                </div>
                <div><label className="form-label">Location</label><input name="location" className="input" placeholder="e.g., Room 101" /></div>
                <div className="flex gap-3 justify-end pt-2">
                  <button type="button" onClick={() => setShowAddAsset(false)} className="btn btn-ghost">Cancel</button>
                  <button type="submit" className="btn btn-primary">Add Asset</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddCategory && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-surface border border-border2 rounded-2xl w-[400px] p-6 space-y-4">
            <h2 className="font-display font-bold text-lg">Add Category</h2>
            <form onSubmit={e => { e.preventDefault(); const f = e.target as HTMLFormElement; createCatMut.mutate({ category_name: (f.elements.namedItem("category_name") as HTMLInputElement).value, depreciation_rate: parseFloat((f.elements.namedItem("depreciation_rate") as HTMLInputElement).value), description: (f.elements.namedItem("description") as HTMLInputElement).value || undefined }); }}>
              <div className="space-y-4">
                <div><label className="form-label">Category Name *</label><input name="category_name" required className="input" /></div>
                <div><label className="form-label">Depreciation Rate (%)</label><input name="depreciation_rate" type="number" defaultValue="10" className="input" /></div>
                <div><label className="form-label">Description</label><textarea name="description" className="textarea" /></div>
                <div className="flex gap-3 justify-end pt-2">
                  <button type="button" onClick={() => setShowAddCategory(false)} className="btn btn-ghost">Cancel</button>
                  <button type="submit" className="btn btn-primary">Add</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddMaintenance && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-surface border border-border2 rounded-2xl w-[500px] p-6 space-y-4">
            <h2 className="font-display font-bold text-lg">Log Maintenance</h2>
            <form onSubmit={e => { e.preventDefault(); const f = e.target as HTMLFormElement; createMaintMut.mutate({ asset_id: parseInt((f.elements.namedItem("asset_id") as HTMLSelectElement).value), maintenance_type: (f.elements.namedItem("maintenance_type") as HTMLSelectElement).value, description: (f.elements.namedItem("description") as HTMLTextAreaElement).value, maintenance_date: (f.elements.namedItem("maintenance_date") as HTMLInputElement).value, cost: parseFloat((f.elements.namedItem("cost") as HTMLInputElement).value) || 0, vendor: (f.elements.namedItem("vendor") as HTMLInputElement).value || undefined }); }}>
              <div className="space-y-4">
                <div><label className="form-label">Asset *</label><select name="asset_id" required className="select"><option value="">Select Asset</option>{assets.map(a => <option key={a.id} value={a.id}>{a.asset_name}</option>)}</select></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="form-label">Type *</label><select name="maintenance_type" required className="select"><option value="Preventive">Preventive</option><option value="Corrective">Corrective</option><option value="Upgrade">Upgrade</option><option value="Inspection">Inspection</option></select></div>
                  <div><label className="form-label">Date *</label><input name="maintenance_date" type="date" required className="input" /></div>
                </div>
                <div><label className="form-label">Description *</label><textarea name="description" required className="textarea" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="form-label">Cost</label><input name="cost" type="number" className="input" /></div>
                  <div><label className="form-label">Vendor</label><input name="vendor" className="input" /></div>
                </div>
                <div className="flex gap-3 justify-end pt-2">
                  <button type="button" onClick={() => setShowAddMaintenance(false)} className="btn btn-ghost">Cancel</button>
                  <button type="submit" className="btn btn-primary">Log</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
