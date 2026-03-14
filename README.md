# MediCore HMS — Hospital Management System

A full-featured desktop Hospital Management System built with **Tauri 2 + Next.js 14 + Rust**.

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Tauri 2 |
| Frontend | Next.js 14 (App Router, Static Export) |
| UI styling | Tailwind CSS + custom design tokens |
| State | Zustand (persist) + TanStack React Query |
| Forms | React Hook Form + Zod |
| Charts | Recharts |
| Local DB | SQLite via rusqlite + r2d2 (bundled) |
| Cloud sync | Neon PostgreSQL (tokio-postgres) |
| Notifications | @tauri-apps/plugin-notification |
| File access | @tauri-apps/plugin-fs |

---

## Modules

| Module | Features |
|---|---|
| **Dashboard** | Live stats, alerts, activity feed, quick KPIs |
| **Patients** | Full EMR — registration, vitals, history, allergies |
| **Appointments** | Calendar, time slots, status workflow (Scheduled → Checked In → Completed) |
| **Prescriptions** | Digital Rx, drug list, refill tracking, expiry |
| **Lab & Diagnostics** | Test pipeline, result entry, report upload |
| **Wards & Beds** | Visual bed map, admit/discharge, ward management |
| **Doctors & Staff** | Availability, shifts, staff roster |
| **Pharmacy & Inventory** | Stock levels, low-stock alerts, expiry tracking |
| **Billing & Invoices** | Line-item invoices, payments, PDF export |
| **Insurance Claims** | Submit, review, approve/reject workflow |
| **Analytics** | Revenue charts, patient flow, department stats |
| **Audit Logs** | Full activity trail with entity/user filtering |
| **Settings** | Hospital info, DB config, cloud sync, notifications, security |

---

## Prerequisites

```bash
# Node.js 18+
node --version

# Rust (stable)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Tauri CLI prerequisites (Linux)
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev

# Tauri CLI prerequisites (macOS)
xcode-select --install
```

---

## Installation & Development

```bash
# 1. Clone / extract project
cd medicore

# 2. Install Node dependencies
npm install

# 3. Run in development mode (launches Next.js + Tauri window)
npm run tauri

# 4. Build production desktop app
npm run tauri:build
```

---

## Project Structure

```
medicore/
├── src/                        # Next.js frontend
│   ├── app/
│   │   ├── layout.tsx          # Root layout
│   │   ├── globals.css         # Design tokens + Tailwind
│   │   ├── dashboard/page.tsx  # Dashboard
│   │   ├── patients/page.tsx   # Patient Records
│   │   ├── appointments/page.tsx
│   │   ├── prescriptions/page.tsx
│   │   ├── lab/page.tsx
│   │   ├── wards/page.tsx
│   │   ├── staff/page.tsx
│   │   ├── pharmacy/page.tsx
│   │   ├── billing/page.tsx
│   │   ├── insurance/page.tsx
│   │   ├── analytics/page.tsx
│   │   ├── audit/page.tsx
│   │   └── settings/page.tsx
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx    # Main layout wrapper
│   │   │   ├── Sidebar.tsx     # Nav sidebar
│   │   │   ├── Topbar.tsx      # Top header
│   │   │   └── Providers.tsx   # React Query + Sonner
│   │   └── modules/
│   │       └── NewPatientModal.tsx
│   ├── lib/
│   │   └── tauri.ts            # All invoke() calls
│   ├── store/
│   │   └── index.ts            # Zustand global store
│   └── types/
│       └── index.ts            # All TypeScript interfaces
│
├── src-tauri/                  # Rust backend
│   ├── src/
│   │   ├── main.rs             # Entry point
│   │   ├── lib.rs              # App setup + command registration
│   │   ├── db.rs               # SQLite pool + full schema migrations
│   │   ├── models.rs           # Serde structs (all entities)
│   │   ├── commands.rs         # All Tauri commands (~800 lines)
│   │   ├── audit.rs            # Audit log helper
│   │   └── sync.rs             # Neon PostgreSQL cloud sync
│   ├── Cargo.toml
│   ├── build.rs
│   └── tauri.conf.json
│
├── package.json
├── next.config.js
├── tailwind.config.ts
└── tsconfig.json
```

---

## Cloud Sync Setup (Neon PostgreSQL)

1. Create a free Neon project at [neon.tech](https://neon.tech)
2. Copy your connection string
3. In **Settings → Cloud Sync**, paste the connection string
4. The app will auto-sync all local changes to the cloud

To enable real sync in `src-tauri/src/sync.rs`, uncomment the `tokio_postgres` section and replace the simulated sync with actual queries.

---

## Environment Variables

```env
NEON_DATABASE_URL=postgresql://user:pass@ep-xxx.neon.tech/medicore
```

---

## Database

The SQLite database is stored at:
- **Windows:** `%APPDATA%\com.medicore.hms\medicore.db`
- **macOS:** `~/Library/Application Support/com.medicore.hms/medicore.db`
- **Linux:** `~/.local/share/com.medicore.hms/medicore.db`

---

## License

MIT
