"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getOpdTokens } from "@/lib/tauri";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { Monitor, Clock, Volume2 } from "lucide-react";

export default function QueueDisplayPage() {
  const today = new Date().toISOString().split("T")[0];
  const [time, setTime] = useState(new Date().toLocaleTimeString());
  const qc = useQueryClient();

  const { data: tokens = [] } = useQuery({
    queryKey: ["opd-tokens", today],
    queryFn: () => getOpdTokens(today),
    refetchInterval: 10000, // Reduced polling as we use events
  });

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
    const unlisten = listen("opd_queue_updated", () => {
      qc.invalidateQueries({ queryKey: ["opd-tokens"] });
    });

    return () => {
      clearInterval(timer);
      unlisten.then(f => f());
    };
  }, [qc]);

  const currentlyServing = tokens.filter(t => t.status === "InProgress");
  const recentlyCalled = tokens.filter(t => t.status === "Called").slice(0, 3);
  const waitingQueue = tokens.filter(t => t.status === "Waiting").slice(0, 8);

  return (
    <div className="fixed inset-0 bg-bg p-8 flex flex-col gap-8 overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center bg-surface border border-border p-6 rounded-2xl">
        <div className="flex items-center gap-4 text-accent">
          <Monitor size={48} />
          <div>
            <h1 className="text-4xl font-display font-bold">OPD QUEUE DISPLAY</h1>
            <p className="text-subtle">Please wait for your token number to be called</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-5xl font-mono font-bold text-white">{time}</div>
          <div className="text-xl text-subtle">{new Date().toDateString()}</div>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-3 gap-8 min-h-0">
        {/* Now Serving */}
        <div className="col-span-2 flex flex-col gap-6">
          <div className="flex-1 bg-accent/5 border-2 border-accent/30 rounded-3xl p-8 flex flex-col">
            <h2 className="text-2xl font-bold text-accent mb-6 flex items-center gap-3">
              <Volume2 className="animate-pulse" /> NOW SERVING
            </h2>
            <div className="flex-1 grid grid-cols-2 gap-6">
              {currentlyServing.length > 0 ? currentlyServing.map(token => (
                <div key={token.id} className="bg-surface border border-accent/50 p-6 rounded-2xl flex flex-col items-center justify-center text-center anim-fade-in">
                  <div className="text-9xl font-display font-black text-white mb-4">#{token.token_number}</div>
                  <div className="text-3xl font-bold text-accent mb-2 uppercase">{token.patient_name}</div>
                  <div className="text-xl text-subtle">DR. {token.doctor_name?.toUpperCase()}</div>
                  <div className="mt-4 badge badge-blue text-lg px-4 py-1">{token.department}</div>
                </div>
              )) : (
                <div className="col-span-2 flex items-center justify-center text-muted text-2xl italic">
                  No patient currently in progress
                </div>
              )}
            </div>
          </div>

          <div className="bg-surface border border-border rounded-3xl p-6 h-64">
            <h2 className="text-xl font-bold text-warning mb-4">RECENTLY CALLED</h2>
            <div className="grid grid-cols-3 gap-4">
              {recentlyCalled.map(token => (
                <div key={token.id} className="bg-warning/10 border border-warning/30 p-4 rounded-xl text-center animate-bounce-short">
                  <div className="text-4xl font-bold text-warning">#{token.token_number}</div>
                  <div className="text-sm font-medium text-white truncate">{token.patient_name}</div>
                  <div className="text-[10px] text-subtle">ROOM {token.id % 10 + 1}</div>
                </div>
              ))}
              {recentlyCalled.length === 0 && <div className="col-span-3 text-center text-muted py-12">No recently called tokens</div>}
            </div>
          </div>
        </div>

        {/* Waiting List */}
        <div className="bg-surface border border-border rounded-3xl p-6 flex flex-col min-h-0">
          <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <Clock size={20} className="text-subtle" /> WAITING QUEUE
          </h2>
          <div className="flex-1 space-y-3 overflow-y-auto pr-2 custom-scrollbar">
            {waitingQueue.map(token => (
              <div key={token.id} className={`p-4 rounded-xl border flex items-center justify-between ${token.priority > 0 ? "bg-red-500/10 border-red-500/30" : "bg-surface2 border-border"}`}>
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${token.priority > 0 ? "bg-red-500 text-white shadow-lg shadow-red-500/20" : "bg-surface3 text-white"}`}>
                    {token.token_number}
                  </div>
                  <div>
                    <div className="font-medium text-white text-sm">{token.patient_name}</div>
                    <div className="text-[10px] text-subtle">DR. {token.doctor_name}</div>
                  </div>
                </div>
                {token.priority > 0 && <span className="badge badge-red text-[9px] px-1.5 py-0">URGENT</span>}
              </div>
            ))}
            {waitingQueue.length === 0 && <div className="text-center text-muted py-12">No patients waiting</div>}
          </div>
          <div className="mt-6 pt-6 border-t border-border text-center text-xs text-subtle">
            Displaying top 8 waiting patients
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes bounce-short {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        .animate-bounce-short {
          animation: bounce-short 2s infinite;
        }
      `}</style>
    </div>
  );
}
