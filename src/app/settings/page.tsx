"use client";
import { useState, useEffect } from "react";
import { Save, Database, Cloud, Bell, Shield, Palette, Building, RefreshCw } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getAllSettings, setSetting, backupDatabase, getSyncStatus, syncToCloud } from "@/lib/tauri";

const SECTIONS = ["Hospital Info","Database","Cloud Sync","Notifications","Security","Appearance"] as const;
type Section = typeof SECTIONS[number];

const ICONS: Record<Section, React.ReactNode> = {
  "Hospital Info": <Building size={15} />,
  "Database":      <Database size={15} />,
  "Cloud Sync":    <Cloud size={15} />,
  "Notifications": <Bell size={15} />,
  "Security":      <Shield size={15} />,
  "Appearance":    <Palette size={15} />,
};

const DEFAULT_SETTINGS: Record<string, string> = {
  hospital_name: "MediCore General Hospital",
  hospital_reg: "MH/2020/4821",
  hospital_address: "42 Health Colony, Sector 12",
  hospital_city: "Mumbai, Maharashtra",
  hospital_phone: "+91 22 4821 0000",
  hospital_email: "admin@medicore.in",
  hospital_website: "https://medicore.in",
  hospital_type: "Multi-specialty",
  backup_interval: "Daily",
  backup_location: "$APP_DATA/backups/",
  backup_days: "30",
  neon_connection: "",
  sync_mode: "Manual only",
  sync_direction: "Bidirectional",
  theme: "Dark",
  accent_color: "#00d4ff",
  font_size: "Default",
  date_format: "DD/MM/YYYY",
  session_timeout: "30",
  max_login_attempts: "5",
  require_password: "true",
  enable_2fa: "false",
  audit_changes: "true",
  auto_lock: "true",
  notify_low_stock: "true",
  notify_appointments: "true",
  notify_lab_results: "true",
  notify_rx_refill: "true",
  notify_overdue: "false",
  notify_sync: "false",
};

export default function SettingsPage() {
  const [active, setActive] = useState<Section>("Hospital Info");
  const [settings, setSettings] = useState<Record<string, string>>(DEFAULT_SETTINGS);
  const qc = useQueryClient();

  const { data: settingsData, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: getAllSettings,
  });

  const { data: syncData } = useQuery({
    queryKey: ["sync-status"],
    queryFn: getSyncStatus,
  });

  useEffect(() => {
    if (settingsData) {
      const loaded: Record<string, string> = { ...DEFAULT_SETTINGS };
      settingsData.forEach((s: { key: string; value: string }) => {
        loaded[s.key] = s.value;
      });
      setSettings(loaded);
    }
  }, [settingsData]);

  const saveMut = useMutation({
    mutationFn: async (key: string) => {
      await setSetting(key, settings[key]);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
  });

  const backupMut = useMutation({
    mutationFn: backupDatabase,
    onSuccess: (path) => {
      toast.success(`Database backed up to ${path}`);
    },
    onError: () => {
      toast.error("Backup failed");
    },
  });

  const syncMut = useMutation({
    mutationFn: syncToCloud,
    onSuccess: (data) => {
      toast.success(`Synced ${data.synced} records to cloud`);
      qc.invalidateQueries({ queryKey: ["sync-status"] });
    },
    onError: () => {
      toast.error("Sync failed");
    },
  });

  function handleSave() {
    const promises = Object.keys(settings).map(key => saveMut.mutateAsync(key));
    Promise.all(promises)
      .then(() => toast.success("All settings saved!"))
      .catch(() => toast.error("Some settings failed to save"));
  }

  function updateSetting(key: string, value: string) {
    setSettings(prev => ({ ...prev, [key]: value }));
  }

  const isSaving = saveMut.isPending;

  if (isLoading) {
    return <div className="p-8 text-center text-muted">Loading settings...</div>;
  }

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Settings</h1><p className="page-subtitle">Configure your MediCore installation</p></div>
        <button onClick={handleSave} disabled={isSaving} className="btn btn-primary">
          <Save size={13} />{isSaving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      <div className="grid grid-cols-[220px_1fr] gap-4">
        <div className="card p-2">
          {SECTIONS.map(s=>(
            <button key={s} onClick={()=>setActive(s)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all mb-0.5 ${active===s?"bg-accent/10 text-accent":"text-muted hover:bg-surface2 hover:text-white"}`}>
              {ICONS[s]}{s}
            </button>
          ))}
        </div>

        <div className="card p-6">
          {active === "Hospital Info" && (
            <div className="grid grid-cols-2 gap-5">
              <div className="col-span-2"><h3 className="text-[15px] font-display font-bold mb-1">Hospital Information</h3><p className="text-[12px] text-muted">Basic details about your facility</p></div>
              <div><label className="form-label">Hospital Name</label><input value={settings.hospital_name} onChange={e => updateSetting("hospital_name", e.target.value)} /></div>
              <div><label className="form-label">Registration Number</label><input value={settings.hospital_reg} onChange={e => updateSetting("hospital_reg", e.target.value)} /></div>
              <div><label className="form-label">Address Line 1</label><input value={settings.hospital_address} onChange={e => updateSetting("hospital_address", e.target.value)} /></div>
              <div><label className="form-label">City / State</label><input value={settings.hospital_city} onChange={e => updateSetting("hospital_city", e.target.value)} /></div>
              <div><label className="form-label">Phone</label><input value={settings.hospital_phone} onChange={e => updateSetting("hospital_phone", e.target.value)} /></div>
              <div><label className="form-label">Email</label><input value={settings.hospital_email} onChange={e => updateSetting("hospital_email", e.target.value)} /></div>
              <div><label className="form-label">Website</label><input value={settings.hospital_website} onChange={e => updateSetting("hospital_website", e.target.value)} /></div>
              <div><label className="form-label">Type</label>
                <select value={settings.hospital_type} onChange={e => updateSetting("hospital_type", e.target.value)}>
                  {["Clinic","General Hospital","Multi-specialty","Teaching Hospital","Trauma Centre"].map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="col-span-2"><label className="form-label">Logo Upload</label>
                <div className="border-2 border-dashed border-border2 rounded-xl p-8 text-center text-muted text-[13px] hover:border-accent transition-colors cursor-pointer">
                  Click or drag to upload hospital logo (PNG, SVG)
                </div>
              </div>
            </div>
          )}

          {active === "Database" && (
            <div className="flex flex-col gap-5">
              <div><h3 className="text-[15px] font-display font-bold mb-1">Local Database</h3><p className="text-[12px] text-muted">SQLite configuration and maintenance</p></div>
              <div className="bg-surface2 border border-border rounded-xl p-4 flex items-center gap-4">
                <Database size={24} className="text-accent flex-shrink-0" />
                <div className="flex-1">
                  <div className="text-[13px] font-medium text-white">SQLite Database</div>
                  <div className="text-[11px] text-muted mt-0.5">medicore.db · Local storage</div>
                </div>
                <span className="badge badge-green">Healthy</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="form-label">Auto Backup Interval</label>
                  <select value={settings.backup_interval} onChange={e => updateSetting("backup_interval", e.target.value)}>
                    <option>Hourly</option><option>Daily</option><option>Weekly</option>
                  </select>
                </div>
                <div><label className="form-label">Keep Backups (days)</label><input type="number" value={settings.backup_days} onChange={e => updateSetting("backup_days", e.target.value)} /></div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => backupMut.mutate()} disabled={backupMut.isPending} className="btn btn-ghost">
                  <RefreshCw size={14} className={backupMut.isPending ? "animate-spin" : ""} />
                  {backupMut.isPending ? "Backing up..." : "Backup Now"}
                </button>
              </div>
            </div>
          )}

          {active === "Cloud Sync" && (
            <div className="flex flex-col gap-5">
              <div><h3 className="text-[15px] font-display font-bold mb-1">Neon PostgreSQL Cloud Sync</h3><p className="text-[12px] text-muted">Configure cloud backup and sync</p></div>
              <div><label className="form-label">Neon Connection String</label>
                <input type="password" value={settings.neon_connection} onChange={e => updateSetting("neon_connection", e.target.value)} placeholder="postgresql://user:pass@ep-xxx.neon.tech/medicore" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="form-label">Sync Mode</label>
                  <select value={settings.sync_mode} onChange={e => updateSetting("sync_mode", e.target.value)}>
                    <option>Real-time</option><option>Every 5 minutes</option><option>Hourly</option><option>Manual only</option>
                  </select>
                </div>
                <div><label className="form-label">Sync Direction</label>
                  <select value={settings.sync_direction} onChange={e => updateSetting("sync_direction", e.target.value)}>
                    <option>Bidirectional</option><option>Local → Cloud only</option><option>Cloud → Local only</option>
                  </select>
                </div>
              </div>
              <div className="bg-surface2 border border-border rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${syncData?.pending === 0 ? "bg-success shadow-[0_0_8px_rgba(0,255,157,0.8)]" : "bg-warning shadow-[0_0_8px_rgba(255,217,61,0.8)]"}`} />
                  <div>
                    <div className="text-[13px] font-medium text-white">{syncData?.pending === 0 ? "Connected" : `${syncData?.pending || 0} pending`}</div>
                    <div className="text-[11px] text-muted">Last sync: {syncData?.last_sync || "Never"}</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => syncMut.mutate()} disabled={syncMut.isPending} className="btn btn-ghost btn-sm">
                    {syncMut.isPending ? "Syncing..." : "Sync Now"}
                  </button>
                </div>
              </div>
              <div className="text-xs text-muted">
                <p>To connect Neon PostgreSQL:</p>
                <ol className="list-decimal list-inside mt-2 space-y-1">
                  <li>Create a project at <a href="https://console.neon.tech" target="_blank" className="text-accent hover:underline">console.neon.tech</a></li>
                  <li>Copy your connection string</li>
                  <li>Paste it in the field above</li>
                </ol>
              </div>
            </div>
          )}

          {active === "Notifications" && (
            <div className="flex flex-col gap-4">
              <div><h3 className="text-[15px] font-display font-bold mb-1">Notification Preferences</h3><p className="text-[12px] text-muted">Control system alerts and reminders</p></div>
              {[
                {k:"notify_low_stock",l:"Low stock alerts",d:"Notify when inventory falls below threshold"},
                {k:"notify_appointments",l:"Appointment reminders",d:"Send reminder before scheduled appointments"},
                {k:"notify_lab_results",l:"Lab result ready",d:"Alert when lab results are available"},
                {k:"notify_rx_refill",l:"Prescription refill due",d:"Notify when patient prescriptions need renewal"},
                {k:"notify_overdue",l:"Overdue invoices",d:"Alert for unpaid invoices past due date"},
                {k:"notify_sync",l:"Sync status",d:"Notify on cloud sync failures or completions"},
              ].map(n=>(
                <div key={n.k} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                  <div>
                    <div className="text-[13px] font-medium text-white">{n.l}</div>
                    <div className="text-[11px] text-muted">{n.d}</div>
                  </div>
                  <button
                    onClick={() => updateSetting(n.k, settings[n.k] === "true" ? "false" : "true")}
                    className={`w-10 h-5 rounded-full cursor-pointer transition-all relative ${settings[n.k] === "true" ? "bg-accent" : "bg-surface3"}`}>
                    <div className={`w-3.5 h-3.5 bg-white rounded-full absolute top-[3px] transition-all ${settings[n.k] === "true" ? "right-[3px]" : "left-[3px]"}`} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {active === "Security" && (
            <div className="flex flex-col gap-5">
              <div><h3 className="text-[15px] font-display font-bold mb-1">Security Settings</h3><p className="text-[12px] text-muted">Manage access control and audit</p></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="form-label">Session Timeout (minutes)</label><input type="number" value={settings.session_timeout} onChange={e => updateSetting("session_timeout", e.target.value)} /></div>
                <div><label className="form-label">Max Login Attempts</label><input type="number" value={settings.max_login_attempts} onChange={e => updateSetting("max_login_attempts", e.target.value)} /></div>
              </div>
              {[
                {k:"require_password",l:"Require password on startup"},
                {k:"enable_2fa",l:"Enable 2FA"},
                {k:"audit_changes",l:"Audit all data changes"},
                {k:"auto_lock",l:"Auto-lock screen on idle"},
              ].map(s=>(
                <div key={s.k} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                  <div className="text-[13px] font-medium text-white">{s.l}</div>
                  <button
                    onClick={() => updateSetting(s.k, settings[s.k] === "true" ? "false" : "true")}
                    className={`w-10 h-5 rounded-full cursor-pointer relative ${settings[s.k] === "true" ? "bg-accent" : "bg-surface3"}`}>
                    <div className={`w-3.5 h-3.5 bg-white rounded-full absolute top-[3px] transition-all ${settings[s.k] === "true" ? "right-[3px]" : "left-[3px]"}`} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {active === "Appearance" && (
            <div className="flex flex-col gap-5">
              <div><h3 className="text-[15px] font-display font-bold mb-1">Appearance</h3><p className="text-[12px] text-muted">Customize the look and feel</p></div>
              <div><label className="form-label">Theme</label>
                <div className="flex gap-3">
                  {["Dark","Light","System"].map(t=>(
                    <div key={t} onClick={() => updateSetting("theme", t)}
                      className={`flex-1 py-3 rounded-xl border text-center text-[13px] cursor-pointer transition-all ${settings.theme === t ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:border-border2"}`}>{t}</div>
                  ))}
                </div>
              </div>
              <div><label className="form-label">Accent Color</label>
                <div className="flex gap-3 flex-wrap">
                  {["#00d4ff","#00ff9d","#c77dff","#ffd93d","#ff6b6b","#f97316"].map(c=>(
                    <div key={c} onClick={() => updateSetting("accent_color", c)}
                      className={`w-8 h-8 rounded-full cursor-pointer border-2 transition-all ${settings.accent_color === c ? "border-white" : "border-transparent hover:border-white"}`}
                      style={{background:c}} />
                  ))}
                </div>
              </div>
              <div><label className="form-label">Font Size</label>
                <select value={settings.font_size} onChange={e => updateSetting("font_size", e.target.value)}>
                  <option>Small (12px)</option><option>Default (14px)</option><option>Large (16px)</option>
                </select>
              </div>
              <div><label className="form-label">Date Format</label>
                <select value={settings.date_format} onChange={e => updateSetting("date_format", e.target.value)}>
                  <option>DD/MM/YYYY</option><option>MM/DD/YYYY</option><option>YYYY-MM-DD</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
