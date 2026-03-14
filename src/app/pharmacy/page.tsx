"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getInventory, getLowStockItems, updateStock, createInventoryItem } from "@/lib/tauri";
import { useState } from "react";
import { Plus, Search, AlertTriangle, TrendingUp, TrendingDown, Package } from "lucide-react";
import { toast } from "sonner";
import type { InventoryItem } from "@/types";

const CAT_BADGE: Record<InventoryItem["category"],string> = {
  Medicine:"badge-green", Consumable:"badge-blue", Equipment:"badge-purple",
  "Lab Reagent":"badge-yellow", PPE:"badge-gray",
};

export default function PharmacyPage() {
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("");
  const [tab, setTab] = useState<"all"|"low">("all");
  const qc = useQueryClient();

  const { data: items = [], isLoading } = useQuery({ queryKey:["inventory",cat], queryFn:()=>getInventory(cat as InventoryItem["category"]||undefined) });
  const { data: lowItems = [] } = useQuery({ queryKey:["low-stock"], queryFn: getLowStockItems });

  const stockMut = useMutation({
    mutationFn:({id,qty,op}:{id:number;qty:number;op:"add"|"subtract"})=>updateStock(id,qty,op),
    onSuccess:()=>{ qc.invalidateQueries({queryKey:["inventory"]}); qc.invalidateQueries({queryKey:["low-stock"]}); toast.success("Stock updated"); },
  });

  const display = tab === "low" ? lowItems : items.filter(i=>!search||i.name.toLowerCase().includes(search.toLowerCase()));
  const totalValue = items.reduce((s,i)=>s+i.current_stock*i.unit_price,0);

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Pharmacy & Inventory</h1><p className="page-subtitle">{items.length} items tracked</p></div>
        <div className="flex gap-2.5">
          <button className="btn btn-ghost"><Package size={13} />Reorder All Low</button>
          <button className="btn btn-primary"><Plus size={14} />Add Item</button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-3.5 mb-5">
        <div className="stat-card anim-fade-up d1">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-accent to-transparent" />
          <div className="text-xl mb-2">📦</div>
          <div className="stat-value text-accent">{items.length}</div>
          <div className="stat-label">Total Items</div>
        </div>
        <div className="stat-card anim-fade-up d2">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-danger to-transparent" />
          <div className="text-xl mb-2">⚠️</div>
          <div className="stat-value text-danger">{lowItems.length}</div>
          <div className="stat-label">Low Stock Alerts</div>
        </div>
        <div className="stat-card anim-fade-up d3">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-warning to-transparent" />
          <div className="text-xl mb-2">📅</div>
          <div className="stat-value text-warning">{items.filter(i=>i.expiry_date && new Date(i.expiry_date) < new Date(Date.now()+30*24*60*60*1000)).length}</div>
          <div className="stat-label">Expiring in 30 days</div>
        </div>
        <div className="stat-card anim-fade-up d4">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-success to-transparent" />
          <div className="text-xl mb-2">💰</div>
          <div className="stat-value text-success">₹{(totalValue/1000).toFixed(0)}K</div>
          <div className="stat-label">Total Stock Value</div>
        </div>
      </div>

      {lowItems.length > 0 && (
        <div className="flex items-center gap-2.5 px-4 py-2.5 bg-danger/8 border border-danger/20 rounded-lg text-danger text-[13px] mb-4">
          <AlertTriangle size={14} /><strong>{lowItems.length} items</strong>&nbsp;below minimum threshold — immediate reorder required.
        </div>
      )}

      <div className="flex gap-3 mb-4">
        <div className="tab-bar">
          <div onClick={()=>setTab("all")} className={`tab-item ${tab==="all"?"active":""}`}>All Items</div>
          <div onClick={()=>setTab("low")} className={`tab-item ${tab==="low"?"active":""} ${lowItems.length>0?"text-danger":""}`}>
            Low Stock {lowItems.length > 0 && <span className="ml-1 text-[10px] bg-danger/20 text-danger px-1.5 py-0.5 rounded-full">{lowItems.length}</span>}
          </div>
        </div>
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name, supplier…" className="pl-9" />
        </div>
        <select value={cat} onChange={e=>setCat(e.target.value)} className="w-40">
          <option value="">All Categories</option>
          {["Medicine","Consumable","Equipment","Lab Reagent","PPE"].map(c=><option key={c}>{c}</option>)}
        </select>
      </div>

      <div className="card">
        {isLoading ? <div className="py-12 text-center text-muted">Loading…</div>
        : display.length === 0 ? <div className="py-12 text-center text-muted">No items found</div>
        : <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr>
                <th>Item Code</th><th>Name</th><th>Category</th><th>Stock</th><th>Stock Level</th>
                <th>Unit Price</th><th>Supplier</th><th>Expiry</th><th>Location</th><th>Actions</th>
              </tr></thead>
              <tbody>
                {display.map(item => {
                  const pct = Math.round((item.current_stock / item.max_capacity)*100);
                  const isLow = item.current_stock <= item.min_threshold;
                  return (
                    <tr key={item.id}>
                      <td className="font-mono text-[12px] text-subtle">{item.item_code}</td>
                      <td className="font-medium text-white">{item.name}</td>
                      <td><span className={`badge ${CAT_BADGE[item.category]} text-[10px]`}>{item.category}</span></td>
                      <td className={`font-semibold ${isLow?"text-danger":pct<40?"text-warning":"text-success"}`}>
                        {item.current_stock} {item.unit}
                      </td>
                      <td className="min-w-[100px]">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-surface3 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${isLow?"bg-danger":pct<40?"bg-warning":"bg-success"}`} style={{width:`${pct}%`}} />
                          </div>
                          <span className="text-[10px] text-subtle w-7">{pct}%</span>
                        </div>
                      </td>
                      <td className="text-muted text-[12px]">₹{item.unit_price}</td>
                      <td className="text-muted text-[12px]">{item.supplier ?? "—"}</td>
                      <td className={`text-[12px] ${item.expiry_date && new Date(item.expiry_date)<new Date(Date.now()+30*86400000)?"text-danger":"text-muted"}`}>{item.expiry_date ?? "—"}</td>
                      <td className="text-muted text-[12px]">{item.location ?? "—"}</td>
                      <td>
                        <div className="flex gap-1.5">
                          <button onClick={()=>stockMut.mutate({id:item.id,qty:10,op:"add"})} className="icon-btn hover:!text-success" title="Add stock"><TrendingUp size={12} /></button>
                          <button onClick={()=>stockMut.mutate({id:item.id,qty:1,op:"subtract"})} className="icon-btn hover:!text-danger" title="Use stock"><TrendingDown size={12} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>}
      </div>
    </div>
  );
}
