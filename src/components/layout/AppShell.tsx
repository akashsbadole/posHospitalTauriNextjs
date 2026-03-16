"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { useAppStore } from "@/store";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { Lock } from "lucide-react";

const TITLES: Record<string, string> = {
  "/dashboard":    "Dashboard",
  "/patients":     "Patient Records",
  "/appointments": "Appointment Scheduling",
  "/prescriptions":"Prescription Management",
  "/lab":          "Lab & Diagnostics",
  "/wards":        "Ward & Bed Management",
  "/staff":        "Doctors & Staff",
  "/pharmacy":     "Pharmacy & Inventory",
  "/billing":      "Billing & Invoices",
  "/insurance":    "Insurance Claims",
  "/analytics":    "Analytics & Reports",
  "/audit":        "Audit Logs",
  "/settings":     "Settings",
  "/hr":           "Payroll & HR",
  "/messages":     "SMS & WhatsApp",
  "/assets":       "Asset Management",
  "/opd-queue":   "OPD Queue",
  "/discharge":    "Discharge Summary",
  "/revenue":      "Revenue Cycle",
  "/ot":           "Operation Theatre",
  "/emergency":    "Emergency / ER",
  "/blood-bank":   "Blood Bank",
  "/ambulance":    "Ambulance",
  "/expenses":     "Expense Management",
};

const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes default

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, authUser } = useAppStore();
  const [lastActivity, setLastActivity] = useState(Date.now());
  const [showLockScreen, setShowLockScreen] = useState(false);

  const title = TITLES[pathname] ?? "MediCore";

  const resetActivity = useCallback(() => {
    setLastActivity(Date.now());
    if (showLockScreen) setShowLockScreen(false);
  }, [showLockScreen]);

  useEffect(() => {
    if (!isAuthenticated || !authUser) return;
    
    const events = ["mousedown", "keydown", "scroll", "touchstart"];
    events.forEach(e => window.addEventListener(e, resetActivity));

    const interval = setInterval(() => {
      const timeout = parseInt(localStorage.getItem("session_timeout") || "30") * 60 * 1000;
      if (Date.now() - lastActivity > timeout) {
        setShowLockScreen(true);
      }
    }, 10000);

    return () => {
      events.forEach(e => window.removeEventListener(e, resetActivity));
      clearInterval(interval);
    };
  }, [isAuthenticated, authUser, lastActivity, resetActivity]);

  const handleUnlock = () => {
    resetActivity();
  };

  if (showLockScreen) {
    return (
      <div className="h-screen bg-bg flex items-center justify-center p-4">
        <div className="bg-surface border border-border rounded-2xl p-8 shadow-card text-center max-w-sm">
          <div className="w-16 h-16 bg-surface2 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Lock size={32} className="text-accent" />
          </div>
          <h1 className="font-display font-bold text-xl text-white mb-2">Session Locked</h1>
          <p className="text-sm text-muted mb-6">Your session has expired due to inactivity</p>
          <button onClick={handleUnlock} className="btn btn-primary w-full">
            Unlock Session
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar title={title} />
        <main className="flex-1 overflow-y-auto p-6 bg-bg">
          {children}
        </main>
      </div>
    </div>
  );
}
