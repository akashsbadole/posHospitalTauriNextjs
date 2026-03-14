"use client";
import { useState } from "react";
import { Save, Database, Cloud, Bell, Shield, Palette, Building } from "lucide-react";
import { toast } from "sonner";

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

export default function SettingsPage() {
  const [active, setActive] = useState<Section>("Hospital Info");
  const [saved, setSaved] = useState(false);

  function handleSave() {
    toast.success("Settings saved");
    setSaved(true);
    setTimeout(()=>setSaved(false),2000);
  }

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Settings</h1><p className="page-subtitle">Configure your MediCore installation</p></div>
        <button onClick={handleSave} className="btn btn-primary"><Save size={13} />{saved?"Saved!":"Save Changes"}</button>
      </div>

      <div className="grid grid-cols-[220px_1fr] gap-4">
        {/* Sidebar */}
        <div className="card p-2">
          {SECTIONS.map(s=>(
            <button key={s} onClick={()=>setActive(s)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all mb-0.5 ${active===s?"bg-accent/10 text-accent":"text-muted hover:bg-surface2 hover:text-white"}`}>
              {ICONS[s]}{s}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="card p-6">
          {active === "Hospital Info" && (
            <div className="grid grid-cols-2 gap-5">
              <div className="col-span-2"><h3 className="text-[15px] font-display font-bold mb-1">Hospital Information</h3><p className="text-[12px] text-muted">Basic details about your facility</p></div>
              <div><label className="form-label">Hospital Name</label><input defaultValue="MediCore General Hospital" /></div>
              <div><label className="form-label">Registration Number</label><input defaultValue="MH/2020/4821" /></div>
              <div><label className="form-label">Address Line 1</label><input defaultValue="42 Health Colony, Sector 12" /></div>
              <div><label className="form-label">City / State</label><input defaultValue="Mumbai, Maharashtra" /></div>
              <div><label className="form-label">Phone</label><input defaultValue="+91 22 4821 0000" /></div>
              <div><label className="form-label">Email</label><input defaultValue="admin@medicore.in" /></div>
              <div><label className="form-label">Website</label><input defaultValue="https://medicore.in" /></div>
              <div><label className="form-label">Type</label>
                <select defaultValue="Multi-specialty">
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
                  <div className="text-[11px] text-muted mt-0.5">medicore.db · Last backed up: Today 03:00 AM · Size: 48.2 MB</div>
                </div>
                <span className="badge badge-green">Healthy</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="form-label">Database Path</label><input defaultValue="$APP_DATA/medicore.db" /></div>
                <div><label className="form-label">Auto Backup Interval</label>
                  <select defaultValue="Daily"><option>Hourly</option><option>Daily</option><option>Weekly</option></select>
                </div>
                <div><label className="form-label">Backup Location</label><input defaultValue="$APP_DATA/backups/" /></div>
                <div><label className="form-label">Keep Backups (days)</label><input type="number" defaultValue={30} /></div>
              </div>
              <div className="flex gap-3">
                <button className="btn btn-ghost">🔄 Compact Database</button>
                <button className="btn btn-ghost">💾 Backup Now</button>
                <button className="btn btn-danger">⚠️ Reset Database</button>
              </div>
            </div>
          )}

          {active === "Cloud Sync" && (
            <div className="flex flex-col gap-5">
              <div><h3 className="text-[15px] font-display font-bold mb-1">Neon PostgreSQL Cloud Sync</h3><p className="text-[12px] text-muted">Configure cloud backup and sync</p></div>
              <div><label className="form-label">Neon Connection String</label>
                <input type="password" defaultValue="postgresql://user:pass@ep-xxx.neon.tech/medicore" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="form-label">Sync Mode</label>
                  <select><option>Real-time</option><option>Every 5 minutes</option><option>Hourly</option><option>Manual only</option></select>
                </div>
                <div><label className="form-label">Sync Direction</label>
                  <select><option>Bidirectional</option><option>Local → Cloud only</option><option>Cloud → Local only</option></select>
                </div>
              </div>
              <div className="bg-surface2 border border-border rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-success shadow-[0_0_8px_rgba(0,255,157,0.8)]" />
                  <div>
                    <div className="text-[13px] font-medium text-white">Connected to Neon Cloud</div>
                    <div className="text-[11px] text-muted">Last synced: 2 minutes ago · 0 pending changes</div>
                  </div>
                </div>
                <button className="btn btn-ghost btn-sm">Test Connection</button>
              </div>
            </div>
          )}

          {active === "Notifications" && (
            <div className="flex flex-col gap-4">
              <div><h3 className="text-[15px] font-display font-bold mb-1">Notification Preferences</h3><p className="text-[12px] text-muted">Control system alerts and reminders</p></div>
              {[
                {l:"Low stock alerts",d:"Notify when inventory falls below threshold",on:true},
                {l:"Appointment reminders",d:"Send reminder before scheduled appointments",on:true},
                {l:"Lab result ready",d:"Alert when lab results are available",on:true},
                {l:"Prescription refill due",d:"Notify when patient prescriptions need renewal",on:true},
                {l:"Overdue invoices",d:"Alert for unpaid invoices past due date",on:false},
                {l:"Sync status",d:"Notify on cloud sync failures or completions",on:false},
              ].map(n=>(
                <div key={n.l} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                  <div>
                    <div className="text-[13px] font-medium text-white">{n.l}</div>
                    <div className="text-[11px] text-muted">{n.d}</div>
                  </div>
                  <div className={`w-10 h-5 rounded-full cursor-pointer transition-all relative ${n.on?"bg-accent":"bg-surface3"}`}>
                    <div className={`w-3.5 h-3.5 bg-white rounded-full absolute top-[3px] transition-all ${n.on?"right-[3px]":"left-[3px]"}`} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {active === "Security" && (
            <div className="flex flex-col gap-5">
              <div><h3 className="text-[15px] font-display font-bold mb-1">Security Settings</h3><p className="text-[12px] text-muted">Manage access control and audit</p></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="form-label">Session Timeout (minutes)</label><input type="number" defaultValue={30} /></div>
                <div><label className="form-label">Max Login Attempts</label><input type="number" defaultValue={5} /></div>
              </div>
              {[{l:"Require password on startup",on:true},{l:"Enable 2FA",on:false},{l:"Audit all data changes",on:true},{l:"Auto-lock screen on idle",on:true}].map(s=>(
                <div key={s.l} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                  <div className="text-[13px] font-medium text-white">{s.l}</div>
                  <div className={`w-10 h-5 rounded-full cursor-pointer relative ${s.on?"bg-accent":"bg-surface3"}`}>
                    <div className={`w-3.5 h-3.5 bg-white rounded-full absolute top-[3px] transition-all ${s.on?"right-[3px]":"left-[3px]"}`} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {active === "Appearance" && (
            <div className="flex flex-col gap-5">
              <div><h3 className="text-[15px] font-display font-bold mb-1">Appearance</h3><p className="text-[12px] text-muted">Customize the look and feel</p></div>
              <div><label className="form-label">Theme</label>
                <div className="flex gap-3">
                  {["Dark (Default)","Light","System"].map(t=>(
                    <div key={t} className={`flex-1 py-3 rounded-xl border text-center text-[13px] cursor-pointer transition-all ${t==="Dark (Default)"?"border-accent bg-accent/10 text-accent":"border-border text-muted hover:border-border2"}`}>{t}</div>
                  ))}
                </div>
              </div>
              <div><label className="form-label">Accent Color</label>
                <div className="flex gap-3 flex-wrap">
                  {["#00d4ff","#00ff9d","#c77dff","#ffd93d","#ff6b6b","#f97316"].map(c=>(
                    <div key={c} className="w-8 h-8 rounded-full cursor-pointer border-2 border-transparent hover:border-white transition-all" style={{background:c}} />
                  ))}
                </div>
              </div>
              <div><label className="form-label">Font Size</label>
                <select><option>Small (12px)</option><option>Default (14px)</option><option>Large (16px)</option></select>
              </div>
              <div><label className="form-label">Date Format</label>
                <select><option>DD/MM/YYYY</option><option>MM/DD/YYYY</option><option>YYYY-MM-DD</option></select>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
