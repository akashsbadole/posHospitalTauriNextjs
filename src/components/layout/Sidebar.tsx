"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  LayoutDashboard, Users, CalendarDays, Pill, FlaskConical,
  BedDouble, UserCog, Package, CreditCard, Shield,
  BarChart3, FileText, Settings, Activity,
  QrCode, MessageSquare, Wallet, Briefcase, MonitorPlay,
  Scissors, AlertTriangle, Droplet, Car, DollarSign,
  LifeBuoy, Sparkles, Wrench, ChevronLeft
} from "lucide-react";
import { useAppStore } from "@/store";

type NavItem = {
  href: string;
  icon: any; // Lucide icon component
  label: string;
  description: string;
  badge?: number;
  bc?: string;
  roles: string[]; // Allowed roles
};

type NavSection = {
  section: string;
  items: NavItem[];
};

const NAV: NavSection[] = [
  { section: "Overview", items: [
    { href:"/dashboard",    icon:LayoutDashboard, label:"Dashboard", description:"Hospital overview and key metrics", roles:["Admin","Doctor","Nurse","Receptionist","Pharmacist","Accountant"] },
    { href:"/analytics",    icon:BarChart3,       label:"Analytics", description:"Data insights and reports", roles:["Admin","Doctor"] },
  ]},
  { section: "Clinical", items: [
    { href:"/patients",      icon:Users,        label:"Patients",            description:"Patient management and records", badge:3,  bc:"green", roles:["Admin","Doctor","Nurse","Receptionist"] },
    { href:"/appointments",  icon:CalendarDays, label:"Appointments",        description:"Schedule and manage appointments", badge:12, roles:["Admin","Doctor","Nurse","Receptionist"] },
    { href:"/prescriptions", icon:Pill,         label:"Prescriptions",        description:"Medication orders and history", roles:["Admin","Doctor","Nurse","Pharmacist"] },
    { href:"/lab",           icon:FlaskConical, label:"Lab & Diagnostics",   description:"Laboratory tests and results", badge:5, roles:["Admin","Doctor","Nurse"] },
    { href:"/discharge",     icon:FileText,     label:"Discharge Summary",    description:"Patient discharge documents", roles:["Admin","Doctor","Nurse"] },
    { href:"/feedback",      icon:MessageSquare,label:"Patient Feedback",     description:"Collect and view feedback", roles:["Admin","Doctor","Nurse","Receptionist"] },
    { href:"/opd-queue",    icon:MonitorPlay,  label:"OPD Queue",             description:"Outpatient department queue", roles:["Admin","Doctor","Nurse","Receptionist"] },
    { href:"/emergency",     icon:AlertTriangle,label:"Emergency / ER",        description:"Emergency room management", roles:["Admin","Doctor","Nurse"] },
    { href:"/ot",            icon:Scissors,     label:"Operation Theatre",     description:"Surgical procedures and scheduling", roles:["Admin","Doctor","Nurse"] },
  ]},
  { section: "Operations", items: [
    { href:"/wards",    icon:BedDouble, label:"Wards & Beds",      description:"Bed allocation and ward management", roles:["Admin","Doctor","Nurse","Receptionist"] },
    { href:"/staff",    icon:UserCog,   label:"Doctors & Staff",    description:"Medical staff and personnel", roles:["Admin","Accountant"] },
    { href:"/pharmacy", icon:Package,   label:"Pharmacy & Inventory", description:"Medication and supply management", roles:["Admin","Pharmacist"] },
    { href:"/assets",   icon:QrCode,    label:"Asset Management",   description:"Equipment and asset tracking", roles:["Admin"] },
    { href:"/blood-bank", icon:Droplet,  label:"Blood Bank",         description:"Blood donation and inventory", roles:["Admin","Nurse","Pharmacist"] },
    { href:"/ambulance",   icon:Car,      label:"Ambulance",          description:"Ambulance services and dispatch", roles:["Admin","Nurse"] },
    { href:"/housekeeping", icon:Sparkles, label:"Housekeeping",      description:"Facility cleaning and maintenance", roles:["Admin"] },
    { href:"/maintenance",  icon:Wrench,   label:"Maintenance",       description:"Equipment repair and upkeep", roles:["Admin"] },
  ]},
  { section: "Finance", items: [
    { href:"/billing",     icon:CreditCard,   label:"Billing & Invoice", description:"Financial billing and invoicing", roles:["Admin","Accountant","Receptionist"] },
    { href:"/insurance",   icon:Shield,       label:"Insurance Claims",  description:"Insurance processing and claims", badge:2, roles:["Admin","Accountant"] },
    { href:"/revenue",     icon:Wallet,       label:"Revenue Cycle",     description:"Revenue management and tracking", roles:["Admin","Accountant"] },
    { href:"/expenses",    icon:DollarSign,   label:"Expenses",           description:"Expense tracking and reports", roles:["Admin","Accountant"] },
  ]},
  { section: "HR & Payroll", items: [
    { href:"/hr",          icon:Briefcase,    label:"Payroll & HR",       description:"Human resources and payroll", roles:["Admin","Accountant"] },
    { href:"/messages",    icon:MessageSquare, label:"SMS & WhatsApp",    description:"Messaging and communication", roles:["Admin","Receptionist"] },
    { href:"/support",     icon:LifeBuoy,      label:"Support Center",     description:"Help and support resources", roles:["Admin","Receptionist"] },
  ]},
  { section: "System", items: [
    { href:"/audit",    icon:FileText, label:"Audit Logs", description:"System activity and logs", roles:["Admin"] },
    { href:"/settings", icon:Settings, label:"Settings",   description:"Application configuration", roles:["Admin"] },
  ]},
];

export function Sidebar({ onLock }: { onLock: () => void }) {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar, authUser } = useAppStore();

  const filteredNav = NAV.map(section => ({
    ...section,
    items: section.items.filter(item =>
      item.roles.includes(authUser?.role || "")
    )
  })).filter(section => section.items.length > 0);

  return (
    <aside className={clsx(
      "flex-shrink-0 bg-surface border-r border-border flex flex-col transition-all duration-300",
      sidebarCollapsed ? "w-[70px]" : "w-[300px]"
    )}>
      {/* Logo */}
      <div className={clsx(
        "px-4 py-4 border-b border-border flex items-center gap-2.5 min-h-[60px]",
        sidebarCollapsed ? "justify-center" : ""
      )}>
        <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center text-lg flex-shrink-0">🏥</div>
        {!sidebarCollapsed && (
          <div className="flex-1 min-w-0">
            <div className="font-display font-extrabold text-[18px] text-white leading-tight">MediCore</div>
            <div className="text-[10px] text-subtle tracking-[2px] uppercase">HMS Pro</div>
          </div>
        )}
        {!sidebarCollapsed && (
          <button onClick={toggleSidebar} className="text-subtle hover:text-white transition-colors ml-auto" aria-label="Collapse sidebar">
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
        {filteredNav.map((section) => (
          <div key={section.section} className="mb-1">
            {!sidebarCollapsed && (
              <div className="text-[10px] font-semibold text-subtle uppercase tracking-[1.5px] px-2.5 py-2">{section.section}</div>
            )}
            {sidebarCollapsed && <div className="h-3" />}
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.href === "/dashboard" && pathname === "/") || (item.href !== "/dashboard" && pathname.startsWith(item.href));
              return (
                <Link key={item.href} href={item.href}
                  title={sidebarCollapsed ? item.label : undefined}
                  className={clsx(
                    "flex items-center gap-2.5 py-2 rounded-lg text-[13.5px] font-medium transition-all duration-150 relative mb-px",
                    sidebarCollapsed ? "px-2 justify-center w-[44px]" : "px-2.5",
                    isActive ? "bg-accent/10 text-accent" : "text-muted hover:bg-surface2 hover:text-white"
                  )}
                >
                  {isActive && !sidebarCollapsed && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-accent rounded-r-full" />
                  )}
                  <Icon size={15} className="flex-shrink-0" />
                  {!sidebarCollapsed && (
                    <>
                      <span className="flex-1 font-medium truncate">{item.label}</span>
                      {item.badge !== undefined && (
                        <span className={clsx(
                          "text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center flex-shrink-0",
                          item.bc === "green" ? "bg-success/20 text-success" : "bg-danger/20 text-danger"
                        )}>{item.badge}</span>
                      )}
                    </>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Expand button when collapsed */}
      {sidebarCollapsed && (
        <div className="px-2 py-2 border-t border-border">
          <button onClick={toggleSidebar} className="flex items-center justify-center w-full py-2 rounded-lg text-muted hover:bg-surface2 hover:text-white transition-all" aria-label="Expand sidebar">
            <ChevronLeft size={15} className="rotate-180" />
          </button>
        </div>
      )}

      {/* Sync strip — only when expanded */}
      {!sidebarCollapsed && (
        <div className="mx-3 mb-2 px-3 py-2 bg-surface2 border border-border rounded-lg flex items-center gap-2">
          <Activity size={11} className="text-success" />
          <span className="text-[11px] text-muted flex-1">Cloud Sync</span>
          <span className="text-[10px] text-success font-semibold">Live</span>
        </div>
      )}

      {/* User — only when expanded */}
      {!sidebarCollapsed ? (
        <div className="py-3 border-t border-border flex items-center gap-2.5 px-3.5">
          <div className="w-[34px] h-[34px] rounded-full bg-gradient-to-br from-purple to-purple/50 flex items-center justify-center text-[12px] font-bold text-white flex-shrink-0">
            {authUser?.full_name?.slice(0, 2).toUpperCase() || "U"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-white truncate">{authUser?.full_name || "User"}</div>
            <div className="text-[11px] text-subtle">{authUser?.role || "User"} · {authUser?.department || ""}</div>
          </div>
          <div className="w-2 h-2 rounded-full bg-success shadow-[0_0_6px_rgba(0,255,157,0.7)]" />
        </div>
      ) : (
        <div className="py-3 border-t border-border flex justify-center">
          <div className="w-[34px] h-[34px] rounded-full bg-gradient-to-br from-purple to-purple/50 flex items-center justify-center text-[12px] font-bold text-white flex-shrink-0">
            {authUser?.full_name?.slice(0, 2).toUpperCase() || "U"}
          </div>
        </div>
      )}

      {/* Lock button */}
      <div className={clsx("border-t border-border", sidebarCollapsed ? "px-2 py-2" : "px-3.5 py-2")}>
        <button onClick={onLock} title="Lock / Logout"
          className={clsx("flex items-center gap-2.5 py-2 rounded-lg text-[13px] font-medium text-muted hover:bg-surface2 hover:text-white transition-all w-full",
            sidebarCollapsed ? "justify-center px-2" : "px-2.5")}>
          <span>⏻</span>
          {!sidebarCollapsed && <span>Lock / Logout</span>}
        </button>
      </div>
    </aside>
  );
}
