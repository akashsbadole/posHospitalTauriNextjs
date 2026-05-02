"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { useAppStore } from "@/store";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { Lock } from "lucide-react";
import { loginUser } from "@/lib/tauri";

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
  "/housekeeping": "Housekeeping",
  "/maintenance":  "Maintenance",
};

const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes default

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, authUser, setIsAuthenticated } = useAppStore();
  const [lastActivity, setLastActivity] = useState(Date.now());
  const [showLockScreen, setShowLockScreen] = useState(false);
  const [password, setPassword] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  const title = TITLES[pathname] ?? "MediCore";

  const resetActivity = useCallback(() => {
    setLastActivity(Date.now());
    // Only reset activity and hide lock screen if not currently showing lock screen
    // This prevents bypassing the lock screen via user activity
    if (!showLockScreen) {
      // Activity resets the timer but doesn't unlock if locked
    }
  }, [showLockScreen]);

  useEffect(() => {
    if (!isAuthenticated || !authUser) return;
    
    const events = ["mousedown", "keydown", "scroll", "touchstart"];
    events.forEach(e => window.addEventListener(e, resetActivity));

    const interval = setInterval(() => {
      const rawTimeout = parseInt(localStorage.getItem("session_timeout") || "30");
      const timeout = Math.max(5, Math.min(120, rawTimeout)) * 60 * 1000; // Clamp between 5-120 minutes
      if (Date.now() - lastActivity > timeout) {
        setShowLockScreen(true);
      }
    }, 10000);

    return () => {
      events.forEach(e => window.removeEventListener(e, resetActivity));
      clearInterval(interval);
    };
  }, [isAuthenticated, authUser, lastActivity, resetActivity]);

  const handleUnlock = async () => {
    setUnlockError(null);
    if (!authUser) return;
    setUnlocking(true);
    try {
      await loginUser(authUser.username, password);
      setPassword("");
      setShowLockScreen(false);
    } catch (err: any) {
      setUnlockError(err.message || "Invalid credentials");
      setPassword("");
    } finally {
      setUnlocking(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !unlocking) handleUnlock();
  };

  const handleLock = () => {
    setShowLockScreen(true);
    setPassword("");
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
          <p className="text-sm text-muted mb-4">Please re-enter your password to continue</p>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Password"
            className="w-full mb-3"
            disabled={unlocking}
          />
          {unlockError && <p className="text-danger text-sm mb-3">{unlockError}</p>}
          <button onClick={handleUnlock} className="btn btn-primary w-full" disabled={unlocking}>
            {unlocking ? "Verifying..." : "Unlock"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar onLock={handleLock} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar title={title} />
        <main className="flex-1 overflow-y-auto p-6 bg-bg">
          {children}
        </main>
      </div>
    </div>
  );
}
