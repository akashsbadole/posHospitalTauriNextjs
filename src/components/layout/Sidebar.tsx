"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  LayoutDashboard, Users, CalendarDays, Pill, FlaskConical,
  BedDouble, UserCog, Package, CreditCard, Shield,
  BarChart3, FileText, Settings, Activity, ChevronLeft,
} from "lucide-react";
import { useAppStore } from "@/store";

const NAV = [
  { section: "Overview", items: [
    { href:"/dashboard",    icon:LayoutDashboard, label:"Dashboard" },
    { href:"/analytics",    icon:BarChart3,       label:"Analytics" },
  ]},
  { section: "Clinical", items: [
    { href:"/patients",      icon:Users,        label:"Patients",            badge:3,  bc:"green" },
    { href:"/appointments",  icon:CalendarDays, label:"Appointments",        badge:12 },
    { href:"/prescriptions", icon:Pill,         label:"Prescriptions" },
    { href:"/lab",           icon:FlaskConical, label:"Lab & Diagnostics",   badge:5 },
  ]},
  { section: "Operations", items: [
    { href:"/wards",    icon:BedDouble, label:"Wards & Beds" },
    { href:"/staff",    icon:UserCog,   label:"Doctors & Staff" },
    { href:"/pharmacy", icon:Package,   label:"Pharmacy & Inventory" },
  ]},
  { section: "Finance", items: [
    { href:"/billing",   icon:CreditCard, label:"Billing & Invoice" },
    { href:"/insurance", icon:Shield,     label:"Insurance Claims", badge:2 },
  ]},
  { section: "System", items: [
    { href:"/audit",    icon:FileText, label:"Audit Logs" },
    { href:"/settings", icon:Settings, label:"Settings" },
  ]},
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useAppStore();

  return (
    <aside className={clsx(
      "flex-shrink-0 bg-surface border-r border-border flex flex-col transition-all duration-300",
      sidebarCollapsed ? "w-[60px]" : "w-[240px]"
    )}>
      {/* Logo */}
      <div className="px-4 py-4 border-b border-border flex items-center gap-2.5 min-h-[60px]">
        <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center text-lg flex-shrink-0">🏥</div>
        {!sidebarCollapsed && (
          <div className="flex-1 min-w-0">
            <div className="font-display font-extrabold text-[18px] text-white leading-tight">MediCore</div>
            <div className="text-[10px] text-subtle tracking-[2px] uppercase">HMS Pro</div>
          </div>
        )}
        {!sidebarCollapsed && (
          <button onClick={toggleSidebar} className="text-subtle hover:text-white transition-colors ml-auto">
            <ChevronLeft size={15} />
          </button>
        )}
      </div>

      {/* Search — only when expanded */}
      {!sidebarCollapsed && (
        <div className="px-3 pt-3 pb-2">
          <div className="flex items-center gap-2 bg-surface2 border border-border rounded-lg px-3 py-2 text-subtle text-[13px]">
            <span>🔍</span>
            <input type="text" placeholder="Search…" className="bg-transparent border-none outline-none text-muted text-[13px] flex-1 p-0 w-full" />
            <kbd className="text-[10px] bg-surface3 px-1.5 py-0.5 rounded text-subtle">⌘K</kbd>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-1">
        {NAV.map((section) => (
          <div key={section.section} className="mb-1">
            {!sidebarCollapsed && (
              <div className="text-[10px] font-semibold text-subtle uppercase tracking-[1.5px] px-2.5 py-2">{section.section}</div>
            )}
            {sidebarCollapsed && <div className="h-3" />}
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.href === "/dashboard" && pathname === "/");
              return (
                <Link key={item.href} href={item.href}
                  title={sidebarCollapsed ? item.label : undefined}
                  className={clsx(
                    "flex items-center gap-2.5 py-2 rounded-lg text-[13.5px] font-medium transition-all duration-150 relative mb-px",
                    sidebarCollapsed ? "px-2 justify-center" : "px-2.5",
                    isActive ? "bg-accent/10 text-accent" : "text-muted hover:bg-surface2 hover:text-white"
                  )}
                >
                  {isActive && !sidebarCollapsed && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-accent rounded-r-full" />
                  )}
                  <Icon size={15} className="flex-shrink-0" />
                  {!sidebarCollapsed && <span className="flex-1">{item.label}</span>}
                  {!sidebarCollapsed && item.badge !== undefined && (
                    <span className={clsx(
                      "text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center",
                      item.bc === "green" ? "bg-success/20 text-success" : "bg-danger/20 text-danger"
                    )}>{item.badge}</span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Sync strip */}
      {!sidebarCollapsed && (
        <div className="mx-3 mb-2 px-3 py-2 bg-surface2 border border-border rounded-lg flex items-center gap-2">
          <Activity size={11} className="text-success" />
          <span className="text-[11px] text-muted flex-1">Cloud Sync</span>
          <span className="text-[10px] text-success font-semibold">Live</span>
        </div>
      )}

      {/* User */}
      <div className={clsx("py-3 border-t border-border flex items-center gap-2.5", sidebarCollapsed ? "justify-center px-0" : "px-3.5")}>
        <div className="w-[34px] h-[34px] rounded-full bg-gradient-to-br from-purple to-purple/50 flex items-center justify-center text-[12px] font-bold text-white flex-shrink-0">
          DR
        </div>
        {!sidebarCollapsed && (
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-white truncate">Dr. R. Sharma</div>
            <div className="text-[11px] text-subtle">Admin · Cardiology</div>
          </div>
        )}
        {!sidebarCollapsed && <div className="w-2 h-2 rounded-full bg-success shadow-[0_0_6px_rgba(0,255,157,0.7)]" />}
      </div>
    </aside>
  );
}
