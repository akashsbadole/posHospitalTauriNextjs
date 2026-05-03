"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useAppStore } from "@/store";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

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
  const { isAuthenticated, setIsAuthenticated, setAuthUser } = useAppStore();
  const lastActivity = useRef(Date.now());

  const title = TITLES[pathname] ?? "MediCore";

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }

    const resetActivity = () => {
      lastActivity.current = Date.now();
    };

    const events = ["mousedown", "keydown", "scroll", "touchstart"];
    events.forEach(e => window.addEventListener(e, resetActivity));

    const interval = setInterval(() => {
      const rawTimeout = parseInt(localStorage.getItem("session_timeout") || "30");
      const timeout = Math.max(5, Math.min(120, rawTimeout)) * 60 * 1000;
      if (Date.now() - lastActivity.current > timeout) {
        setIsAuthenticated(false);
        setAuthUser(null);
        router.replace("/login");
      }
    }, 10000);

    return () => {
      events.forEach(e => window.removeEventListener(e, resetActivity));
      clearInterval(interval);
    };
  }, [isAuthenticated, router, setIsAuthenticated, setAuthUser]);

  const handleLogout = () => {
    setIsAuthenticated(false);
    setAuthUser(null);
    router.replace("/login");
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar onLock={handleLogout} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar title={title} />
        <main className="flex-1 overflow-y-auto p-6 bg-bg">
          {children}
        </main>
      </div>
    </div>
  );
}