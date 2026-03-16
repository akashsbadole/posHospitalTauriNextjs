"use client";
import { X, TrendingUp, TrendingDown, Package } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getAuditLogs } from "@/lib/tauri";

interface StockHistoryModalProps {
  itemId: number;
  itemName: string;
  open: boolean;
  onClose: () => void;
}

export function StockHistoryModal({ itemId, itemName, open, onClose }: StockHistoryModalProps) {
  const { data: logs = [] } = useQuery({
    queryKey: ["inventory-audit", itemId],
    queryFn: () => getAuditLogs(100),
  });

  if (!open) return null;

  const stockLogs = logs.filter(log => 
    log.entity.toLowerCase() === "inventory" && 
    log.details?.includes(`id:${itemId}`)
  );

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center anim-fade-in">
      <div className="bg-surface border border-border2 rounded-2xl w-[520px] max-h-[80vh] flex flex-col shadow-card">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="font-display font-bold text-base">Stock History</h2>
            <p className="text-xs text-muted">{itemName}</p>
          </div>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {stockLogs.length === 0 ? (
            <div className="text-center py-8 text-muted">
              <Package size={32} className="mx-auto mb-2 opacity-50" />
              <p>No stock movements recorded</p>
            </div>
          ) : (
            <div className="space-y-2">
              {stockLogs.map(log => {
                const isAddition = log.action.toLowerCase().includes("add") || log.action.toLowerCase().includes("created");
                const isSubtraction = log.action.toLowerCase().includes("delete") || log.action.toLowerCase().includes("use");

                return (
                  <div key={log.id} className="flex items-center gap-3 p-3 bg-surface2 border border-border rounded-lg">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      isAddition ? "bg-success/20 text-success" : 
                      isSubtraction ? "bg-danger/20 text-danger" : 
                      "bg-muted/20 text-muted"
                    }`}>
                      {isAddition ? <TrendingUp size={14} /> : 
                       isSubtraction ? <TrendingDown size={14} /> : 
                       <Package size={14} />}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-white">{log.action}</div>
                      <div className="text-xs text-muted">{log.details || "No details"}</div>
                    </div>
                    <div className="text-xs text-subtle">
                      {new Date(log.timestamp).toLocaleDateString()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
