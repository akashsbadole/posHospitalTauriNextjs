"use client";
import { Bell, Upload, Plus, RefreshCw, X, Check, AlertTriangle, Info } from "lucide-react";
import { useState } from "react";
import { syncToCloud, getDashboardStats } from "@/lib/tauri";
import { toast } from "sonner";
import { NewPatientModal } from "@/components/modules/NewPatientModal";
import { useAppStore } from "@/store";
import { format } from "date-fns";

export function Topbar({ title }: { title: string }) {
  const [syncing, setSyncing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const { notifications, clearNotification, clearAll } = useAppStore();

  const unreadCount = notifications.filter(n => !n.read).length;

  async function handleSync() {
    setSyncing(true);
    try {
      const r = await syncToCloud();
      toast.success(`Synced ${r.synced} records to cloud`);
    } catch {
      toast.error("Sync failed — check connection");
    } finally {
      setSyncing(false);
    }
  }

  const markAsRead = (id: string) => {
    clearNotification(id);
  };

  return (
    <>
      <header className="h-[60px] bg-surface border-b border-border flex items-center px-6 gap-4 flex-shrink-0">
        <h1 className="font-display font-bold text-[18px] text-white flex-1">{title}</h1>
        <div className="flex items-center gap-2">
          <button onClick={handleSync} disabled={syncing} title="Sync to cloud"
            className="icon-btn w-9 h-9">
            <RefreshCw size={15} className={syncing ? "animate-spin text-accent" : ""} />
          </button>
          
          <div className="relative">
            <button onClick={() => setShowNotifs(!showNotifs)} className="relative icon-btn w-9 h-9">
              <Bell size={15} />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-danger border border-surface" />
              )}
            </button>
            
            {showNotifs && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-surface border border-border2 rounded-xl shadow-card z-50 anim-fade-in">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <span className="font-medium text-white text-sm">Notifications</span>
                  <div className="flex gap-2">
                    {notifications.length > 0 && (
                      <button onClick={clearAll} className="text-xs text-subtle hover:text-white">Clear all</button>
                    )}
                    <button onClick={() => setShowNotifs(false)}><X size={14} className="text-subtle" /></button>
                  </div>
                </div>
                
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center text-muted text-sm">No notifications</div>
                  ) : (
                    notifications.map(n => (
                      <div key={n.id} className="px-4 py-3 border-b border-border last:border-0 hover:bg-surface2/50">
                        <div className="flex items-start gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                            n.type === "error" ? "bg-danger/20 text-danger" :
                            n.type === "warning" ? "bg-warning/20 text-warning" :
                            n.type === "success" ? "bg-success/20 text-success" :
                            "bg-accent/20 text-accent"
                          }`}>
                            {n.type === "error" ? <AlertTriangle size={14} /> :
                             n.type === "warning" ? <AlertTriangle size={14} /> :
                             n.type === "success" ? <Check size={14} /> :
                             <Info size={14} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-white">{n.title}</div>
                            <div className="text-xs text-muted mt-0.5">{n.message}</div>
                            <div className="text-[10px] text-subtle mt-1">{format(new Date(n.timestamp), "MMM d, h:mm a")}</div>
                          </div>
                          <button onClick={() => markAsRead(n.id)} className="text-subtle hover:text-white">
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          
          <button className="btn btn-ghost h-9"><Upload size={13} />Export</button>
          <button onClick={() => setShowModal(true)} className="btn btn-primary h-9">
            <Plus size={14} />New Patient
          </button>
        </div>
      </header>
      <NewPatientModal open={showModal} onClose={() => setShowModal(false)} />
    </>
  );
}
