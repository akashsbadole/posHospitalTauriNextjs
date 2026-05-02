# HMS Code Review - Bugfix Requirements Document

## Introduction

This document identifies all bugs, issues, and problems found during a comprehensive code review of the MediCore Hospital Management System (HMS). The review covered frontend React/Next.js components, backend Tauri/Rust commands, database operations, state management, and type definitions.

---

## HMS Workflow Mapping

Each bug is mapped to the relevant HMS workflow section:

| Bug ID | Workflow Section |
|--------|-----------------|
| 1.1, 1.2, 1.3, 1.4, 1.5 | Security (Applies to all) |
| 1.6, 1.7, 1.8, 1.9, 1.10 | 1. Patient Registration & Admission |
| 1.21, 1.22 | 4. Billing & Insurance |
| 1.23 | 5. Laboratory & Radiology |
| 1.24 | 9. Administrative & Support Services (HR) |
| 1.25 | Key Integrations |
| 1.11, 1.12, 1.13, 1.14 | Error Handling (System-wide) |
| 1.15, 1.16, 1.17, 1.18, 1.19, 1.20 | Frontend UI (All modules) |
| 1.26, 1.27, 1.28 | Type Safety (System-wide) |

---

## Bug Analysis

### Current Behavior (Defect)

#### Security Issues (Applies to All Workflows)

1.1 WHEN a user logs in with invalid credentials THEN the system returns a generic error message but does NOT implement rate limiting, allowing unlimited brute-force attempts

1.2 WHEN a user session times out in AppShell.tsx THEN the "Unlock Session" button only calls resetActivity() without requiring re-authentication, allowing bypass of the lock screen

1.3 WHEN the application starts in development mode THEN the Tauri backend defaults to "admin" user for all permission checks if no username is provided, creating a security backdoor (line 34-35 in commands.rs)

1.4 WHEN patients are exported to CSV THEN the export function in commands.rs does not validate user permissions, allowing any authenticated user to export sensitive patient data

1.5 WHEN role-based access control is performed in AuthGuard.tsx THEN the check runs only after the component mounts, causing a brief flash of unauthorized content before redirect

#### Data Integrity Issues (Related to: Patient Registration, Admission, Ward Management)

1.6 WHEN a patient is deleted THEN the system does not cascade delete related records (appointments, prescriptions, lab tests, invoices), leaving orphaned data in the database

1.7 WHEN an invoice is deleted THEN the associated payment records are not cleaned up, breaking referential integrity

1.8 WHEN a doctor is deleted THEN existing appointments still reference the deleted doctor_id, causing foreign key issues

1.9 WHEN a bed is transferred via transfer_patient command THEN the function does not validate that the target bed is available, allowing double-booking

1.10 WHEN calculating patient age in patients/page.tsx THEN the code uses `new Date().getFullYear() - new Date(p.dob).getFullYear()` which is inaccurate for dates near the birthday and doesn't handle invalid date formats

#### Error Handling Issues (System-wide - All Workflows)

1.11 WHEN a database query fails in any Tauri command THEN errors are converted to strings but not logged, making debugging difficult in production

1.12 WHEN the database file is corrupted or missing THEN the application panics without a user-friendly error message

1.13 WHEN a PDF export fails (e.g., missing fonts, disk full) THEN the error is not caught and displayed to the user properly

1.14 WHEN network requests to Tauri backend fail THEN there is no global error boundary to catch and display errors gracefully

#### Frontend Issues (UI - Affects All Modules)

1.15 WHEN the sidebar is collapsed AND a user hovers over nav items THEN the tooltip shows but the layout shifts unexpectedly due to missing width constraints

1.16 WHEN searching patients with debounce THEN the search timeout is not cleared on component unmount, potentially causing memory leaks

1.17 WHEN pagination is used AND the user changes search filters THEN the page number is not reset to 1, causing display of empty results

1.18 WHEN the WeeklyCalendar component renders AND appointments have times outside the defined HOURS array THEN those appointments are silently hidden from view

1.19 WHEN the login page loads AND localStorage contains stale auth data THEN the page may briefly show before redirecting to dashboard

1.20 WHEN multiple modals are open AND user presses Escape THEN only the topmost modal closes, but state may become inconsistent

#### Backend Logic Issues (Related to: Billing, Lab, HR, Integrations)

1.21 WHEN creating a prescription with drugs THEN the function does not validate that drug quantities don't exceed available inventory

1.22 WHEN recording a partial payment THEN the system does not check if the payment amount exceeds the remaining balance, allowing overpayment

1.23 WHEN updating lab results THEN the is_abnormal flag is not automatically calculated based on reference ranges

1.24 WHEN calculating payroll THEN the function does not validate that all required data (attendance, leaves) exists before calculation

1.25 WHEN syncing to cloud AND the sync fails mid-way THEN partial data may be synced without proper rollback mechanism

#### Type Safety Issues

1.26 WHEN using the createPatient function in tauri.ts THEN the Omit type excludes fields that may still be required by the backend

1.27 WHEN receiving data from the backend THEN many fields are typed as optional but are actually required, leading to potential null pointer issues

1.28 WHEN using the getVisitCharges function THEN the return type is `any`, losing type safety for the items array

---

## Fix Workflow Requirements

This section maps each bug fix to the workflow step that needs to be created/enhanced:

### Step 1: Security & Authentication (All workflows require this)
- Fix 1.1: Add rate limiting to login
- Fix 1.2: Implement proper session lock with re-authentication
- Fix 1.3: Remove admin backdoor in permission checks
- Fix 1.4: Add permission validation to CSV export
- Fix 1.5: Fix AuthGuard to check before render

### Step 2: Patient Registration & Admission
- Fix 1.6: Implement cascade delete for patients
- Fix 1.7: Clean up payment records on invoice delete
- Fix 1.8: Handle doctor deletion properly
- Fix 1.9: Validate bed availability on transfer
- Fix 1.10: Fix age calculation

### Step 3: Billing & Insurance
- Fix 1.21: Validate inventory on prescription
- Fix 1.22: Prevent overpayment on partial payments

### Step 4: Laboratory & Radiology
- Fix 1.23: Auto-calculate is_abnormal flag

### Step 5: Administrative (HR)
- Fix 1.24: Validate data before payroll calculation

### Step 6: System-wide Improvements
- Fix 1.11: Add error logging
- Fix 1.12: Handle database corruption gracefully
- Fix 1.13: Catch PDF export errors
- Fix 1.14: Add global error boundary

### Step 7: Frontend UI Improvements
- Fix 1.15: Fix sidebar tooltip layout
- Fix 1.16: Clear search timeout on unmount
- Fix 1.17: Reset pagination on filter change
- Fix 1.18: Handle appointments outside hours
- Fix 1.19: Check auth before render on login
- Fix 1.20: Fix modal state consistency

### Step 8: Type Safety Improvements
- Fix 1.26: Match types with backend
- Fix 1.27: Fix optional vs required fields
- Fix 1.28: Add proper types to getVisitCharges

---

### Expected Behavior (Correct)

2.1 WHEN a user logs in with invalid credentials THEN the system SHALL implement rate limiting (e.g., 5 attempts per 15 minutes) and return specific error messages

2.2 WHEN a user session times out THEN the system SHALL require full re-authentication (username + password) to unlock

2.3 WHEN the application starts THEN permission checks SHALL always require a valid username and reject requests without authentication

2.4 WHEN patients are exported to CSV THEN the system SHALL verify the user has permission to export patient data

2.5 WHEN role-based access control is performed THEN the check SHALL complete before rendering any protected content

2.6 WHEN a patient is deleted THEN the system SHALL either cascade delete related records OR mark them as deleted with proper foreign key handling

2.7 WHEN an invoice is deleted THEN associated payment records SHALL be cleaned up or marked as void

2.8 WHEN a doctor is deleted THEN existing appointments SHALL be either reassigned or cancelled

2.9 WHEN transferring a patient to a new bed THEN the system SHALL verify the target bed is available (status = 'Available')

2.10 WHEN calculating patient age THEN the system SHALL use proper date difference calculation accounting for months and days

2.11 WHEN a database query fails THEN errors SHALL be logged with stack traces for debugging

2.12 WHEN the database file is corrupted THEN the system SHALL display a user-friendly error with recovery options

2.13 WHEN a PDF export fails THEN the error SHALL be caught and displayed to the user with actionable information

2.14 WHEN network requests fail THEN a global error boundary SHALL catch errors and display fallback UI

2.15 WHEN the sidebar is collapsed AND items are hovered THEN tooltips SHALL display without layout shift

2.16 WHEN searching with debounce THEN the timeout SHALL be cleared on component unmount

2.17 WHEN search filters change THEN pagination SHALL reset to page 1

2.18 WHEN WeeklyCalendar renders THEN appointments outside defined hours SHALL be shown in a separate "other" slot or handled gracefully

2.19 WHEN login page loads AND stale auth exists THEN the page SHALL check auth state during initialization before rendering

2.20 WHEN multiple modals are open AND Escape is pressed THEN all modals SHALL close in reverse order with consistent state

2.21 WHEN creating a prescription THEN the system SHALL validate drug availability before creation

2.22 WHEN recording a partial payment THEN the system SHALL reject payments exceeding the remaining balance

2.23 WHEN updating lab results THEN the system SHALL auto-calculate is_abnormal based on reference ranges if not provided

2.24 WHEN calculating payroll THEN the system SHALL validate data completeness before calculation

2.25 WHEN syncing fails mid-way THEN the system SHALL implement proper transaction rollback

2.26 WHEN using createPatient THEN the type definitions SHALL match backend requirements exactly

2.27 WHEN receiving data from backend THEN required fields SHALL be properly typed as non-optional

2.28 WHEN using getVisitCharges THEN proper TypeScript types SHALL be defined for the return value

### Unchanged Behavior (Regression Prevention)

3.1 WHEN users authenticate with valid credentials THEN the system SHALL CONTINUE TO allow login and set auth state

3.2 WHEN the dashboard loads THEN the system SHALL CONTINUE TO fetch and display statistics

3.3 WHEN patients are created with valid data THEN the system SHALL CONTINUE TO save them to the database

3.4 WHEN appointments are scheduled THEN the system SHALL CONTINUE TO check for conflicts

3.5 WHEN invoices are generated THEN the system SHALL CONTINUE TO calculate taxes correctly

3.6 WHEN prescriptions are issued THEN the system SHALL CONTINUE TO decrement inventory

3.7 WHEN users navigate between pages THEN the system SHALL CONTINUE TO preserve sidebar state

3.8 WHEN data is exported THEN the system SHALL CONTINUE TO generate valid CSV/PDF files

3.9 WHEN notifications are created THEN the system SHALL CONTINUE TO display them to users

3.10 WHEN settings are updated THEN the system SHALL CONTINUE TO persist them to the database

---

## Summary of Issues by Severity

| Severity | Count | Examples |
|----------|-------|----------|
| Critical | 5 | Session lock bypass, permission backdoor, no cascade delete |
| Major | 10 | Missing error handling, overpayment allowed, no rate limiting |
| Minor | 13 | Age calculation, layout shifts, pagination reset |

## Recommended Priority

1. **Immediate (Critical)**: Issues 1.2, 1.3, 1.6, 1.7, 1.8
2. **High (Major)**: Issues 1.1, 1.9, 1.21, 1.22, 1.24
3. **Medium**: Issues 1.10, 1.14, 1.17, 1.18, 1.23
4. **Low**: Issues 1.15, 1.16, 1.19, 1.26, 1.27, 1.28

---

## Workflow Step Tracking

| Step | Workflow Name | Status | Bugs Fixed |
|------|--------------|--------|------------|
| Step 1 | Security & Authentication | 🔴 Not Started | 1.1, 1.2, 1.3, 1.4, 1.5 |
| Step 2 | Patient Registration & Admission | 🔴 Not Started | 1.6, 1.7, 1.8, 1.9, 1.10 |
| Step 3 | Billing & Insurance | 🔴 Not Started | 1.21, 1.22 |
| Step 4 | Laboratory & Radiology | 🔴 Not Started | 1.23 |
| Step 5 | Administrative (HR) | 🔴 Not Started | 1.24 |
| Step 6 | System-wide Improvements | 🔴 Not Started | 1.11, 1.12, 1.13, 1.14 |
| Step 7 | Frontend UI Improvements | 🔴 Not Started | 1.15, 1.16, 1.17, 1.18, 1.19, 1.20 |
| Step 8 | Type Safety Improvements | 🔴 Not Started | 1.26, 1.27, 1.28 |

**Legend:**
- 🔴 Not Started = Workflow needs to be created
- 🟡 In Progress = Workflow is being worked on
- ✅ Completed = All bugs in this step are fixed