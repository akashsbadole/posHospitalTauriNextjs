"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getMessageTemplates, createMessageTemplate, sendMessage, getMessageLogs, deleteMessageTemplate } from "@/lib/tauri";
import { toast } from "sonner";
import { MessageSquare, Send, Plus, Phone, CheckCircle, XCircle, Mail, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/modules/ConfirmDialog";

export default function MessagesPage() {
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [showSendMessage, setShowSendMessage] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const qc = useQueryClient();

  const { data: templates = [], isLoading: tmplLoading } = useQuery({
    queryKey: ["message-templates"],
    queryFn: () => getMessageTemplates(),
  });

  const { data: logs = [], isLoading: logsLoading } = useQuery({
    queryKey: ["message-logs"],
    queryFn: () => getMessageLogs(50),
  });

  const createTmplMut = useMutation({
    mutationFn: createMessageTemplate,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["message-templates"] }); toast.success("Template created!"); setShowAddTemplate(false); },
    onError: () => toast.error("Failed to create template"),
  });

  const sendMsgMut = useMutation({
    mutationFn: sendMessage,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["message-logs"] }); toast.success("Message sent!"); setShowSendMessage(false); },
    onError: () => toast.error("Failed to send message"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteMessageTemplate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["message-templates"] });
      toast.success("Template deleted");
      setDeleteId(null);
    },
    onError: () => toast.error("Delete failed"),
  });

  const sentCount = logs.filter(l => l.status === "Sent").length;
  const pendingCount = logs.filter(l => l.status === "Pending").length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Communication Center</h1>
          <p className="page-subtitle">SMS, WhatsApp & Email integration</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAddTemplate(true)} className="btn btn-primary"><Plus size={16} /> Add Template</button>
          <button onClick={() => setShowSendMessage(true)} className="btn btn-success"><Send size={16} /> Send Message</button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3.5 mb-5">
        <div className="stat-card anim-fade-up d1">
          <div className="stat-value text-accent">{templates.length}</div>
          <div className="stat-label">Templates</div>
        </div>
        <div className="stat-card anim-fade-up d2">
          <div className="stat-value text-success">{sentCount}</div>
          <div className="stat-label">Sent</div>
        </div>
        <div className="stat-card anim-fade-up d3">
          <div className="stat-value text-warning">{pendingCount}</div>
          <div className="stat-label">Pending</div>
        </div>
        <div className="stat-card anim-fade-up d4">
          <div className="stat-value text-purple">{logs.length}</div>
          <div className="stat-label">Total Messages</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Message Templates</h3>
          </div>
          <div className="p-4">
            {tmplLoading ? <div className="text-center text-muted py-8">Loading...</div> : (
              <div className="space-y-3">
                {templates.map(tmpl => (
                  <div key={tmpl.id} className="p-3 bg-surface2 rounded-lg border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{tmpl.template_name}</span>
                        <span className={`badge ${
                          tmpl.message_type === "WhatsApp" ? "badge-green" :
                          tmpl.message_type === "SMS" ? "badge-blue" :
                          tmpl.message_type === "Email" ? "badge-purple" : "badge-orange"
                        }`}>{tmpl.message_type}</span>
                      </div>
                      <button onClick={() => setDeleteId(tmpl.id)} className="icon-btn hover:!text-danger"><Trash2 size={12} /></button>
                    </div>
                    <p className="text-xs text-muted line-clamp-2">{tmpl.template_body}</p>
                  </div>
                ))}
                {templates.length === 0 && <p className="text-center text-muted py-4">No templates yet</p>}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Recent Messages</h3>
          </div>
          <div className="p-4">
            {logsLoading ? <div className="text-center text-muted py-8">Loading...</div> : (
              <div className="space-y-3">
                {logs.slice(0, 10).map(log => (
                  <div key={log.id} className="p-3 bg-surface2 rounded-lg border border-border flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {log.message_type === 'Email' ? <Mail size={12} className="text-subtle" /> : <Phone size={12} className="text-subtle" />}
                        <span className="text-sm text-white truncate">
                          {log.message_type === 'Email' ? log.email : log.phone}
                        </span>
                        <span className={`badge ${log.status === "Sent" ? "badge-green" : "badge-yellow"}`}>{log.status}</span>
                      </div>
                      <p className="text-xs text-muted truncate">{log.message_body}</p>
                    </div>
                    <div className="text-xs text-subtle ml-2 whitespace-nowrap">{log.sent_at ? new Date(log.sent_at).toLocaleTimeString() : "-"}</div>
                  </div>
                ))}
                {logs.length === 0 && <p className="text-center text-muted py-4">No messages yet</p>}
              </div>
            )}
          </div>
        </div>
      </div>

      {showAddTemplate && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center anim-fade-in">
          <div className="bg-surface border border-border2 rounded-2xl w-[500px] flex flex-col shadow-card">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h2 className="font-display font-bold text-base">Add Message Template</h2>
              <button onClick={() => setShowAddTemplate(false)} className="text-subtle hover:text-white"><XCircle size={18} /></button>
            </div>
            <form onSubmit={e => {
              e.preventDefault();
              const f = e.target as HTMLFormElement;
              createTmplMut.mutate({
                template_name: (f.elements.namedItem("template_name") as HTMLInputElement).value,
                message_type: (f.elements.namedItem("message_type") as HTMLSelectElement).value,
                template_body: (f.elements.namedItem("template_body") as HTMLTextAreaElement).value
              });
            }} className="p-6 space-y-4">
              <div><label className="form-label">Template Name *</label><input name="template_name" required className="input" placeholder="e.g., Appointment Reminder" /></div>
              <div><label className="form-label">Message Type *</label><select name="message_type" required className="select"><option value="SMS">SMS</option><option value="WhatsApp">WhatsApp</option><option value="Email">Email</option><option value="Both">SMS & WhatsApp</option><option value="All">All Channels</option></select></div>
              <div><label className="form-label">Template Body *</label><textarea name="template_body" required className="textarea h-32" placeholder="Use {'{patient_name}'} for dynamic fields" /></div>
              <div className="flex gap-3 justify-end pt-4">
                <button type="button" onClick={() => setShowAddTemplate(false)} className="btn btn-ghost">Cancel</button>
                <button type="submit" className="btn btn-primary">Create Template</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        title="Delete Template"
        message="Are you sure you want to delete this message template?"
        confirmLabel="Delete"
        variant="danger"
        loading={deleteMut.isPending}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        onCancel={() => setDeleteId(null)}
      />

      {showSendMessage && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center anim-fade-in">
          <div className="bg-surface border border-border2 rounded-2xl w-[600px] flex flex-col shadow-card">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h2 className="font-display font-bold text-base">Send Message</h2>
              <button onClick={() => setShowSendMessage(false)} className="text-subtle hover:text-white"><XCircle size={18} /></button>
            </div>
            <form onSubmit={e => {
              e.preventDefault();
              const f = e.target as HTMLFormElement;
              sendMsgMut.mutate({
                phone: (f.elements.namedItem("phone") as HTMLInputElement).value,
                email: (f.elements.namedItem("email") as HTMLInputElement).value || undefined,
                message_type: (f.elements.namedItem("message_type") as HTMLSelectElement).value,
                template_name: (f.elements.namedItem("template_name") as HTMLSelectElement).value || undefined,
                message_body: (f.elements.namedItem("message_body") as HTMLTextAreaElement).value
              });
            }} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="form-label">Phone Number</label><input name="phone" required className="input" placeholder="+91XXXXXXXXXX" /></div>
                <div><label className="form-label">Email Address</label><input name="email" className="input" placeholder="patient@example.com" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="form-label">Message Type *</label><select name="message_type" required className="select"><option value="SMS">SMS</option><option value="WhatsApp">WhatsApp</option><option value="Email">Email</option><option value="Both">SMS & WA</option><option value="All">All</option></select></div>
                <div><label className="form-label">Template (optional)</label><select name="template_name" className="select"><option value="">Custom Message</option>{templates.map(t => <option key={t.id} value={t.template_name}>{t.template_name}</option>)}</select></div>
              </div>
              <div><label className="form-label">Message *</label><textarea name="message_body" required className="textarea h-24" placeholder="Enter your message..." /></div>
              <div className="flex gap-3 justify-end pt-4">
                <button type="button" onClick={() => setShowSendMessage(false)} className="btn btn-ghost">Cancel</button>
                <button type="submit" className="btn btn-success"><Send size={14} /> Send</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
