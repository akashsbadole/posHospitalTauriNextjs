# MediCore HMS — Comprehensive Feature List & Workflow

MediCore is a modern, high-performance Hospital Management System (HMS) designed to streamline clinical, administrative, and financial operations. Built with a robust desktop-first architecture (Tauri + Rust + Next.js), it provides a secure and lightning-fast experience for hospitals of all sizes.

---

## 🏥 Main Features

### 1. Patient Management (EMR/EHR)
*   **Comprehensive Patient Profiles:** Full registration with medical history, allergies, chronic conditions, and photo ID.
*   **Activity Logs:** Track every clinical and administrative event for a patient in a unified timeline.
*   **Vital Signs Tracking:** Monitor and trend blood pressure, heart rate, SPO2, temperature, and more.
*   **Medical Records (EMR):** Digital repository for clinical notes, diagnostic reports, imaging, and prescription archives.
*   **Patient Feedback:** Integrated feedback system to collect ratings and comments for quality improvement.

### 2. Outpatient Department (OPD)
*   **OPD Queue Management:** Real-time token system with voice announcements to manage patient flow.
*   **Doctor Assignment:** Intelligent doctor assignment based on department and current load.
*   **Consultation Workflow:** Unified UI for doctors to record diagnoses, order lab tests, and write prescriptions.
*   **Appointment Scheduling:** Calendar-based scheduling with status tracking (Scheduled → Checked In → Completed).
*   **Video Consultations:** Support for telemedicine with integrated video links.

### 3. Inpatient Department (IPD)
*   **Visual Bed Map:** Real-time floor plan view of wards and beds (Available, Occupied, Maintenance).
*   **Admission/Transfer/Discharge:** Simplified workflows for managing patient stays and ward transfers.
*   **Ward Management:** Configure different ward types (General, ICU, Private) with custom base charges.
*   **Discharge Summaries:** Professional PDF generation with procedure details, medication advice, and follow-up plans.

### 4. Clinical Services
*   **Laboratory Information System (LIS):** Manage the full test lifecycle (Ordered → Sample Collected → Processing → Ready → Reviewed).
*   **Pharmacy & Inventory:**
    *   Digital Rx processing with automated stock deduction.
    *   Allergy alerts: Prevents prescribing drugs matching a patient's allergy list.
    *   Expiry tracking: Automated alerts for items expiring within 30 days.
    *   Low-stock notifications.
*   **Operation Theatre (OT):** Surgery scheduling with surgeon and anesthesiologist assignment, priority levels, and OT theatre management.

### 5. Emergency & Critical Care
*   **Emergency Case Management:** Triage-based registration (Red, Orange, Yellow, Green) for immediate care.
*   **Ambulance Tracking:** Manage ambulance fleet, dispatch calls, and track pickup/arrival times.
*   **Blood Bank:** Manage donor database, blood inventory (by group and component), and patient blood requests.

### 6. Financial & Billing
*   **Automated Billing:** Aggregates costs from consultations, lab tests, pharmacy, and ward stays into a single invoice.
*   **GST-Compliant Invoicing:** Detailed tax breakdown (CGST/SGST/IGST) with HSN code support.
*   **Insurance Claims:** Submit and track claims from registration to settlement with approved amount adjustments.
*   **Expense Management:** Track hospital overheads, vendor payments, and category-wise spending.
*   **Professional PDF Export:** Professional, print-ready PDFs for invoices and receipts.

### 7. Human Resources & Payroll
*   **Staff Roster:** Manage shifts and schedules for doctors, nurses, and administrative staff.
*   **Attendance System:** Robust check-in/check-out tracking with work hour calculations.
*   **Payroll Processing:** Automated salary calculation based on basic pay, allowances, and deductions.
*   **Leave Management:** Digital workflow for leave requests and approvals.

### 8. Administrative Support
*   **Asset Management:** Track hospital equipment, depreciation, and maintenance schedules.
*   **Housekeeping & Maintenance:** Task-based management for cleaning, sanitation, and infrastructure repairs.
*   **Support Tickets:** Internal helpdesk for managing patient inquiries or IT support requests.
*   **Messaging System:** Integrated SMS and WhatsApp notifications for appointment reminders and reports.

---

## 📈 Hospital Benefits

### Operational Efficiency
*   **Reduced Paperwork:** Fully digital workflows from registration to discharge.
*   **Real-time Visibility:** Live dashboard with KPIs for patient flow, bed occupancy, and revenue.
*   **Automation:** Automated token generation, billing aggregation, and inventory alerts.

### Clinical Excellence
*   **Patient Safety:** Integrated allergy alerts and contraindication warnings.
*   **Better Data Access:** Instant access to patient history and previous reports from any terminal.
*   **Standardization:** Use of standardized templates for prescriptions and discharge summaries.

### Financial Control
*   **Revenue Leakage Prevention:** Automated billing ensures every service provided is recorded and invoiced.
*   **GST Compliance:** Hassle-free tax reporting and CSV exports for accounting.
*   **Inventory Optimization:** Prevent stockouts and reduce waste from expired medicines.

---

## 🔄 System Workflows

### The Patient Journey (OPD)
1.  **Registration:** Front desk registers patient and collects basic details.
2.  **Appointment/Token:** Patient is assigned a doctor and a queue token.
3.  **Vitals:** Nurse records vitals (BP, Heart Rate) which are instantly visible to the doctor.
4.  **Consultation:** Doctor reviews history, updates diagnosis, and orders tests/medicines.
5.  **Diagnostics/Pharmacy:** Patient visits Lab or Pharmacy; services are linked to the active visit.
6.  **Billing:** All services are aggregated into a single bill for payment.

### The Patient Journey (IPD)
1.  **Admission:** Doctor recommends admission; bed is assigned in the relevant ward.
2.  **Clinical Care:** Ongoing vitals monitoring, nursing notes, and medication administration.
3.  **Discharge:** Doctor prepares discharge summary; final bill is settled.
4.  **Follow-up:** Automated SMS reminder sent for the next follow-up date.

---

## 🛠 Technical Features
*   **Cloud Sync:** Local-first database with seamless background synchronization to Neon PostgreSQL.
*   **Role-Based Access Control (RBAC):** Granular permissions for Admin, Doctor, Nurse, Receptionist, and Pharmacist.
*   **Audit Trails:** Comprehensive logging of all system actions for security and compliance.
*   **Offline Capability:** Works without internet; syncs data automatically when connection is restored.
*   **Cross-Platform:** High-performance desktop application for Windows, macOS, and Linux.
