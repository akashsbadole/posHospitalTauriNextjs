"use client";
import { usePathname } from "next/navigation";
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
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const title = TITLES[pathname] ?? "MediCore";
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
