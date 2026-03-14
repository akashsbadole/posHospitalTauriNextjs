"use client";
import { Bell, Upload, Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { syncToCloud } from "@/lib/tauri";
import { toast } from "sonner";
import { NewPatientModal } from "@/components/modules/NewPatientModal";

export function Topbar({ title }: { title: string }) {
  const [syncing, setSyncing] = useState(false);
  const [showModal, setShowModal] = useState(false);

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

  return (
    <>
      <header className="h-[60px] bg-surface border-b border-border flex items-center px-6 gap-4 flex-shrink-0">
        <h1 className="font-display font-bold text-[18px] text-white flex-1">{title}</h1>
        <div className="flex items-center gap-2">
          <button onClick={handleSync} disabled={syncing} title="Sync to cloud"
            className="icon-btn w-9 h-9">
            <RefreshCw size={15} className={syncing ? "animate-spin text-accent" : ""} />
          </button>
          <button className="relative icon-btn w-9 h-9">
            <Bell size={15} />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-danger border border-surface" />
          </button>
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
