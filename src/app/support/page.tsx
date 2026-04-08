"use client";
import { useState, useEffect } from "react";
import {
  LifeBuoy, Search, Filter, Plus,
  MessageSquare, Clock, CheckCircle2,
  AlertCircle, ChevronRight, User, Tag,
  MoreHorizontal, Send
} from "lucide-react";
import { clsx } from "clsx";
import { getSupportTickets, createSupportTicket, updateSupportTicket, getPatients, getUsers } from "@/lib/tauri";
import type { SupportTicket, Patient, User as AppUser } from "@/types";
import { toast } from "sonner";
import { format } from "date-fns";

export default function SupportPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showNewModal, setShowNewModal] = useState(false);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [staff, setStaff] = useState<AppUser[]>([]);

  // New ticket form
  const [newTicket, setNewTicket] = useState({
    patient_id: "" as string | number,
    subject: "",
    description: "",
    category: "General",
    priority: "Medium",
    assigned_to: "" as string | number,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [tData, pData, sData] = await Promise.all([
        getSupportTickets(),
        getPatients(),
        getUsers(),
      ]);
      setTickets(tData);
      setPatients(pData);
      setStaff(sData.filter(u => u.is_active));
    } catch (err) {
      console.error(err);
      toast.error("Failed to load support data");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!newTicket.subject || !newTicket.description) {
        toast.error("Please fill in subject and description");
        return;
      }
      await createSupportTicket({
        ...newTicket,
        patient_id: newTicket.patient_id ? Number(newTicket.patient_id) : undefined,
        assigned_to: Number(newTicket.assigned_to) || staff[0]?.id || 1,
      });
      toast.success("Ticket created successfully");
      setShowNewModal(false);
      fetchData();
    } catch (err) {
      toast.error("Failed to create ticket");
    }
  };

  const handleUpdateStatus = async (id: number, status: string) => {
    try {
      await updateSupportTicket(id, { status });
      toast.success("Ticket status updated");
      fetchData();
    } catch (err) {
      toast.error("Failed to update status");
    }
  };

  const filteredTickets = tickets.filter(t => {
    const matchesSearch = t.subject.toLowerCase().includes(search.toLowerCase()) ||
                         t.ticket_code.toLowerCase().includes(search.toLowerCase()) ||
                         t.patient_name?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Open": return "bg-blue/10 text-blue";
      case "InProgress": return "bg-warning/10 text-warning";
      case "Resolved": return "bg-success/10 text-success";
      case "Closed": return "bg-subtle/10 text-subtle";
      default: return "bg-surface3 text-muted";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "Urgent": return "text-danger";
      case "High": return "text-warning";
      case "Medium": return "text-accent";
      default: return "text-subtle";
    }
  };

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-white flex items-center gap-2">
            <LifeBuoy className="text-accent" />
            Support Center
          </h1>
          <p className="text-subtle text-sm mt-1">Manage patient inquiries and support requests</p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="bg-accent hover:bg-accent-dark text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors w-fit"
        >
          <Plus size={18} />
          New Ticket
        </button>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Tickets", value: tickets.length, icon: MessageSquare, color: "text-accent" },
          { label: "Open", value: tickets.filter(t => t.status === "Open").length, icon: AlertCircle, color: "text-blue" },
          { label: "In Progress", value: tickets.filter(t => t.status === "InProgress").length, icon: Clock, color: "text-warning" },
          { label: "Resolved", value: tickets.filter(t => t.status === "Resolved").length, icon: CheckCircle2, color: "text-success" },
        ].map(stat => (
          <div key={stat.label} className="bg-surface border border-border rounded-xl p-4 flex items-center gap-4">
            <div className={clsx("p-2 rounded-lg bg-surface2", stat.color)}>
              <stat.icon size={20} />
            </div>
            <div>
              <div className="text-2xl font-bold text-white">{stat.value}</div>
              <div className="text-xs text-subtle uppercase tracking-wider">{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="bg-surface border border-border rounded-xl p-4 flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" size={18} />
          <input
            type="text"
            placeholder="Search tickets by subject, code or patient..."
            className="w-full bg-surface2 border border-border rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-accent"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={18} className="text-subtle" />
          <select
            className="bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="Open">Open</option>
            <option value="InProgress">In Progress</option>
            <option value="Resolved">Resolved</option>
            <option value="Closed">Closed</option>
          </select>
        </div>
      </div>

      {/* Tickets List */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-subtle">Loading tickets...</div>
        ) : filteredTickets.length === 0 ? (
          <div className="p-12 text-center text-subtle flex flex-col items-center gap-4">
            <MessageSquare size={48} className="opacity-20" />
            <p>No tickets found matching your filters.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredTickets.map(ticket => (
              <div key={ticket.id} className="p-4 hover:bg-surface2/50 transition-colors group">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-[10px] font-mono bg-surface3 text-subtle px-1.5 py-0.5 rounded">
                        #{ticket.ticket_code}
                      </span>
                      <span className={clsx("text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full", getStatusColor(ticket.status))}>
                        {ticket.status}
                      </span>
                      <span className={clsx("text-[10px] font-bold flex items-center gap-1", getPriorityColor(ticket.priority))}>
                        <div className={clsx("w-1.5 h-1.5 rounded-full",
                          ticket.priority === "Urgent" ? "bg-danger" :
                          ticket.priority === "High" ? "bg-warning" : "bg-accent"
                        )} />
                        {ticket.priority}
                      </span>
                    </div>
                    <h3 className="text-base font-semibold text-white group-hover:text-accent transition-colors truncate">
                      {ticket.subject}
                    </h3>
                    <p className="text-sm text-muted line-clamp-1 mt-1">{ticket.description}</p>

                    <div className="flex flex-wrap items-center gap-y-2 gap-x-4 mt-3">
                      <div className="flex items-center gap-1.5 text-xs text-subtle">
                        <User size={14} />
                        <span>Patient: {ticket.patient_name || "N/A"}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-subtle">
                        <Tag size={14} />
                        <span>Category: {ticket.category}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-subtle">
                        <User size={14} className="text-accent" />
                        <span>Assigned to: {ticket.assigned_user_name || "Unassigned"}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-subtle">
                        <Clock size={14} />
                        <span>{format(new Date(ticket.created_at), "MMM d, h:mm a")}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2">
                      {ticket.status === "Open" && (
                        <button
                          onClick={() => handleUpdateStatus(ticket.id, "InProgress")}
                          className="text-[11px] bg-accent/10 text-accent hover:bg-accent hover:text-white px-2 py-1 rounded transition-colors"
                        >
                          Start Work
                        </button>
                      )}
                      {ticket.status === "InProgress" && (
                        <button
                          onClick={() => handleUpdateStatus(ticket.id, "Resolved")}
                          className="text-[11px] bg-success/10 text-success hover:bg-success hover:text-white px-2 py-1 rounded transition-colors"
                        >
                          Resolve
                        </button>
                      )}
                      <button className="p-1.5 hover:bg-surface3 rounded-lg text-subtle hover:text-white">
                        <MoreHorizontal size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New Ticket Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-surface2/50">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Plus className="text-accent" size={20} />
                Create Support Ticket
              </h2>
              <button onClick={() => setShowNewModal(false)} className="text-subtle hover:text-white transition-colors">
                <ChevronRight className="rotate-90" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-subtle uppercase tracking-wider">Patient (Optional)</label>
                  <select
                    className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
                    value={newTicket.patient_id}
                    onChange={(e) => setNewTicket({ ...newTicket, patient_id: e.target.value })}
                  >
                    <option value="">Select Patient</option>
                    {patients.map(p => (
                      <option key={p.id} value={p.id}>{p.full_name} ({p.patient_code})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-subtle uppercase tracking-wider">Category</label>
                  <select
                    className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
                    value={newTicket.category}
                    onChange={(e) => setNewTicket({ ...newTicket, category: e.target.value })}
                  >
                    <option value="General">General Inqury</option>
                    <option value="Billing">Billing Issue</option>
                    <option value="Lab">Lab Results</option>
                    <option value="Appointment">Appointment Help</option>
                    <option value="Technical">Technical Issue</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-subtle uppercase tracking-wider">Subject</label>
                <input
                  type="text"
                  placeholder="Summary of the issue"
                  className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
                  value={newTicket.subject}
                  onChange={(e) => setNewTicket({ ...newTicket, subject: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-subtle uppercase tracking-wider">Description</label>
                <textarea
                  rows={4}
                  placeholder="Detailed description of the inquiry..."
                  className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent resize-none"
                  value={newTicket.description}
                  onChange={(e) => setNewTicket({ ...newTicket, description: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-subtle uppercase tracking-wider">Priority</label>
                  <select
                    className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
                    value={newTicket.priority}
                    onChange={(e) => setNewTicket({ ...newTicket, priority: e.target.value })}
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-subtle uppercase tracking-wider">Assign To</label>
                  <select
                    className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
                    value={newTicket.assigned_to}
                    onChange={(e) => setNewTicket({ ...newTicket, assigned_to: e.target.value })}
                  >
                    <option value="">Select User</option>
                    {staff.map(u => (
                      <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="flex-1 bg-surface3 hover:bg-surface2 text-white py-2 rounded-lg text-sm font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-accent hover:bg-accent-dark text-white py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <Send size={16} />
                  Create Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
