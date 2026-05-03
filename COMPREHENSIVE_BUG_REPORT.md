# MediCore HMS - Comprehensive Bug Report

**Generated**: April 28, 2026  
**Status**: 40+ Critical, High, and Medium Priority Issues Identified  
**Scope**: Full codebase analysis (Frontend, Backend, Database, Security)

---

## Executive Summary

The MediCore HMS application has **40+ identified bugs and issues** across multiple severity levels. The most critical issues are:

1. **Missing authentication/authorization on 100+ Tauri commands** - Complete system compromise risk
2. **SQL injection vulnerability** in permission checking
3. **Hardcoded default credentials** with weak passwords
4. **No password hashing validation** in login flow
5. **Orphaned records** due to incomplete cascade delete implementation
6. **No query pagination** - Memory exhaustion risk with large datasets
7. **Cross-platform file path issues** - PDF export fails on Linux/Mac

**Recommendation**: Address CRITICAL and HIGH severity issues before production deployment.

---

## Issues by Severity

### 🔴 CRITICAL SECURITY VULNERABILITIES (6 Issues)

#### 1. Missing Authentication/Authorization on All Commands
- **Location**: `src-tauri/src/commands.rs` (all `#[tauri::command]` functions)
- **Severity**: CRITICAL
- **Issue**: ~100+ Tauri commands have NO authentication checks. Any user can call any command directly.
- **Impact**: Complete system compromise - unauthorized access to patient data, financial records, etc.
- **Current Behavior**: 
  ```rust
  #[tauri::command]
  pub fn delete_patient(id: i32, requester: String) -> Result<(), String> {
    // No check if requester is authenticated or has permission
    // Anyone can call this command
  }
  ```
- **Expected Behavior**: Every command that modifies data must verify user authentication and permissions
- **Fix Priority**: IMMEDIATE
- **Estimated Effort**: 4-6 hours

#### 2. SQL Injection via Dynamic Field Names
- **Location**: `src-tauri/src/commands.rs:125-130` in `check_permission()`
- **Severity**: CRITICAL
- **Issue**: 
  ```rust
  let sql = format!("SELECT {} FROM role_permissions WHERE role = ?1 AND module = ?2", field);
  ```
  Attacker can inject SQL through action parameter
- **Impact**: Database compromise, data theft, data manipulation
- **Current Behavior**: Field names are directly interpolated into SQL
- **Expected Behavior**: Use parameterized queries or match statement for field names
- **Fix Priority**: IMMEDIATE
- **Estimated Effort**: 1-2 hours

#### 3. Hardcoded Default Credentials
- **Location**: `src-tauri/src/db.rs` seed_data()
- **Severity**: CRITICAL
- **Issue**: Default users with weak passwords:
  - admin/admin123
  - doctor/doctor123
  - nurse/nurse123
  - reception/reception123
  - pharmacist/pharma123
  - accountant/account123
- **Impact**: Easy unauthorized access to production systems
- **Current Behavior**: Seed data creates default users with known passwords
- **Expected Behavior**: Remove seed data or use strong random passwords; require password change on first login
- **Fix Priority**: IMMEDIATE
- **Estimated Effort**: 2-3 hours

#### 4. No Password Hashing Validation
- **Location**: `src/lib/tauri.ts` - `loginUser()` function
- **Severity**: CRITICAL
- **Issue**: No visible password hashing/validation in login flow
- **Impact**: Passwords may be stored/transmitted in plain text
- **Current Behavior**: Login flow unclear on password handling
- **Expected Behavior**: Use bcrypt or Argon2 for password hashing; never store plain text passwords
- **Fix Priority**: IMMEDIATE
- **Estimated Effort**: 3-4 hours

#### 5. Session Timeout Lock Screen Bypass
- **Location**: `src/components/layout/AppShell.tsx:70-80`
- **Severity**: CRITICAL
- **Issue**: Lock screen can be bypassed by calling `loginUser()` again - no re-authentication required
- **Current Behavior**: 
  ```typescript
  const handleUnlock = async () => {
    await loginUser(authUser.username, password);
    setShowLockScreen(false);
  }
  ```
- **Impact**: Unattended sessions can be unlocked by anyone with access to the machine
- **Expected Behavior**: Require fresh password entry with server-side validation
- **Fix Priority**: HIGH
- **Estimated Effort**: 2-3 hours

#### 6. Sensitive Data in Logs
- **Location**: `src-tauri/src/commands.rs` - eprintln! statements
- **Severity**: CRITICAL
- **Issue**: Patient IDs, names, and sensitive data logged to console
- **Impact**: Data exposure in log files, HIPAA violations
- **Current Behavior**: Debug output includes sensitive information
- **Expected Behavior**: Use structured logging with sensitive data redaction
- **Fix Priority**: HIGH
- **Estimated Effort**: 2-3 hours

---

### 🟠 HIGH PRIORITY DATA INTEGRITY ISSUES (12 Issues)

#### 7. Orphaned Records on Cascade Deletes
- **Location**: `src-tauri/src/db.rs` - Database schema
- **Severity**: HIGH
- **Issue**: `appointments`, `prescriptions`, `lab_tests` have `ON DELETE CASCADE` but related records in `invoice_items`, `vital_signs`, `medical_records` may be orphaned
- **Example**: Delete patient → appointments deleted → but invoice_items still reference deleted appointment
- **Impact**: Inconsistent data, orphaned financial records, referential integrity violations
- **Current Behavior**: Partial cascade delete implementation
- **Expected Behavior**: Complete cascade delete or soft delete with proper cleanup
- **Fix Priority**: HIGH
- **Estimated Effort**: 3-4 hours

#### 8. Missing Foreign Key Constraints
- **Location**: `src-tauri/src/db.rs` - Multiple tables
- **Severity**: HIGH
- **Issue**: `visit_id` columns added without FK constraints; `inventory_item_id` in prescription_drugs has no ON DELETE behavior
- **Impact**: Orphaned records, data inconsistency
- **Current Behavior**: No FK constraints on new columns
- **Expected Behavior**: All foreign keys must have ON DELETE CASCADE or ON DELETE SET NULL
- **Fix Priority**: HIGH
- **Estimated Effort**: 2-3 hours

#### 9. Soft Delete Not Enforced Consistently
- **Location**: `src-tauri/src/commands.rs` - Patient queries
- **Severity**: HIGH
- **Issue**: `is_deleted` column exists but many queries don't filter it
  - `get_patients()` filters it ✓
  - `get_patient_by_id()` doesn't filter it ✗
  - `get_patient_vitals()` doesn't filter it ✗
- **Impact**: Deleted patients can still be accessed and modified
- **Current Behavior**: Inconsistent soft delete filtering
- **Expected Behavior**: Add `WHERE is_deleted = 0` to ALL patient queries
- **Fix Priority**: HIGH
- **Estimated Effort**: 2-3 hours

#### 10. Duplicate Table Definitions
- **Location**: `src-tauri/src/db.rs` - Lines for `payroll_months` and `payroll_entries`
- **Severity**: HIGH
- **Issue**: `payroll_months` and `payroll_entries` tables defined twice
- **Impact**: Migration failures, schema inconsistency
- **Current Behavior**: Duplicate CREATE TABLE statements
- **Expected Behavior**: Single definition per table
- **Fix Priority**: HIGH
- **Estimated Effort**: 1 hour

#### 11. No Unique Constraints on Critical Fields
- **Location**: `src-tauri/src/db.rs` - Beds table
- **Severity**: HIGH
- **Issue**: `beds` table has UNIQUE(ward_id, bed_number) but no constraint on patient_id - multiple beds can have same patient
- **Impact**: Patient can be admitted to multiple beds simultaneously
- **Current Behavior**: No unique constraint on patient_id in beds table
- **Expected Behavior**: Add UNIQUE constraint or check in code
- **Fix Priority**: HIGH
- **Estimated Effort**: 1-2 hours

#### 12. Invoice Balance Calculation Not Atomic
- **Location**: `src/app/billing/page.tsx` - `recordPayment()` mutation
- **Severity**: HIGH
- **Issue**: Balance = total - paid_amount calculated in frontend, not enforced in DB
- **Impact**: Race conditions, incorrect balances with concurrent payments
- **Current Behavior**: Frontend calculates balance
- **Expected Behavior**: Database should calculate and enforce balance
- **Fix Priority**: HIGH
- **Estimated Effort**: 2-3 hours

#### 13. Incorrect Revenue Calculation
- **Location**: `src-tauri/src/commands.rs:176-189` - `get_dashboard_stats()`
- **Severity**: HIGH
- **Issue**: `today_revenue` uses `paid_amount` but `monthly_revenue` uses same - doesn't account for partial payments
- **Impact**: Revenue reports inaccurate, financial discrepancies
- **Current Behavior**: Revenue calculation doesn't distinguish between invoiced and paid amounts
- **Expected Behavior**: Separate invoiced revenue from paid revenue
- **Fix Priority**: HIGH
- **Estimated Effort**: 2-3 hours

#### 14. Prescription Refill Logic Broken
- **Location**: `src-tauri/src/commands.rs:2033-2045` - `refill_prescription()`
- **Severity**: HIGH
- **Issue**: Only updates refills_remaining but doesn't create new prescription record
- **Impact**: Refills not properly tracked, inventory not decremented
- **Current Behavior**: Refill only updates counter
- **Expected Behavior**: Create new prescription record with updated inventory
- **Fix Priority**: HIGH
- **Estimated Effort**: 2-3 hours

#### 15. No Query Pagination
- **Location**: `src-tauri/src/commands.rs` - All list queries
- **Severity**: HIGH
- **Issue**: `get_patients()`, `getAppointments()` return ALL records without LIMIT/OFFSET
- **Impact**: Memory exhaustion with large datasets, slow UI
- **Current Behavior**: All records returned in single query
- **Expected Behavior**: Add LIMIT/OFFSET to all list queries
- **Fix Priority**: HIGH
- **Estimated Effort**: 4-5 hours

#### 16. Missing Audit Trail for Sensitive Operations
- **Location**: `src-tauri/src/commands.rs` - Delete operations
- **Severity**: HIGH
- **Issue**: `delete_patient()` doesn't log who deleted what
- **Impact**: No accountability, compliance violations
- **Current Behavior**: Deletes happen without audit logging
- **Expected Behavior**: Log all sensitive operations with user, timestamp, and reason
- **Fix Priority**: HIGH
- **Estimated Effort**: 3-4 hours

#### 17. No Backup/Recovery Mechanism
- **Location**: `scripts/backup-database.sh`
- **Severity**: HIGH
- **Issue**: Backup script exists but not integrated into app
- **Impact**: Data loss risk, no recovery mechanism
- **Current Behavior**: Manual backup script only
- **Expected Behavior**: Automated backups with recovery mechanism
- **Fix Priority**: HIGH
- **Estimated Effort**: 4-5 hours

#### 18. Hardcoded APPDATA Path (Cross-Platform Issue)
- **Location**: `src-tauri/src/commands.rs:355, 569`
- **Severity**: HIGH
- **Issue**: `std::env::var("APPDATA")` only works on Windows
- **Impact**: PDF export fails on Linux/Mac
- **Current Behavior**: Windows-only path handling
- **Expected Behavior**: Use `tauri::api::path::app_data_dir()` for cross-platform support
- **Fix Priority**: HIGH
- **Estimated Effort**: 1-2 hours

---

### 🟡 MEDIUM PRIORITY ISSUES (16 Issues)

#### 19. Unhandled Promise Rejections
- **Location**: `src/app/patients/page.tsx:95-100` - `handleExportCSV()`
- **Severity**: MEDIUM
- **Issue**: `try-catch` catches error but doesn't properly handle all cases
- **Impact**: Silent failures, user confusion
- **Fix Priority**: MEDIUM
- **Estimated Effort**: 1-2 hours

#### 20. Missing Error Handling in Mutations
- **Location**: `src/app/appointments/page.tsx:40-45` - `mut.mutate()`
- **Severity**: MEDIUM
- **Issue**: No error boundary or fallback UI if mutation fails
- **Impact**: UI hangs, no user feedback
- **Fix Priority**: MEDIUM
- **Estimated Effort**: 2-3 hours

#### 21. Unhandled Database Connection Errors
- **Location**: `src-tauri/src/commands.rs` - All commands
- **Severity**: MEDIUM
- **Issue**: `.map_err(|e| e.to_string())` loses error context
- **Impact**: Difficult debugging, poor error messages
- **Fix Priority**: MEDIUM
- **Estimated Effort**: 2-3 hours

#### 22. No Validation on Numeric Inputs
- **Location**: `src/components/modules/NewPatientModal.tsx` - Phone validation
- **Severity**: MEDIUM
- **Issue**: Phone regex not enforced, negative ages possible
- **Impact**: Invalid data in database
- **Fix Priority**: MEDIUM
- **Estimated Effort**: 1-2 hours

#### 23. Memory Leak in useEffect
- **Location**: `src/components/layout/AppShell.tsx:60-75`
- **Severity**: MEDIUM
- **Issue**: Event listeners added but cleanup function doesn't remove all listeners properly
- **Impact**: Multiple listeners accumulate, performance degradation
- **Fix Priority**: MEDIUM
- **Estimated Effort**: 1-2 hours

#### 24. Race Condition in Search
- **Location**: `src/app/patients/page.tsx:35-40`
- **Severity**: MEDIUM
- **Issue**: Debounced search can race with status filter change
- **Impact**: Incorrect results displayed
- **Fix Priority**: MEDIUM
- **Estimated Effort**: 1-2 hours

#### 25. Uncontrolled Input in Lock Screen
- **Location**: `src/components/layout/AppShell.tsx:85-90`
- **Severity**: MEDIUM
- **Issue**: Password input not cleared on error
- **Impact**: Password visible in input after failed unlock
- **Fix Priority**: MEDIUM
- **Estimated Effort**: 1 hour

#### 26. Rate Limiter Not Thread-Safe
- **Location**: `src-tauri/src/commands.rs:38-90` - `RateLimiter`
- **Severity**: MEDIUM
- **Issue**: HashMap entries never cleaned up, grows indefinitely
- **Impact**: Memory leak, rate limiter becomes ineffective
- **Fix Priority**: MEDIUM
- **Estimated Effort**: 2-3 hours

#### 27. Appointment Time Slot Validation Missing
- **Location**: `src/app/appointments/page.tsx:120-130`
- **Severity**: MEDIUM
- **Issue**: No validation that appointment_time is in SLOTS array
- **Impact**: Invalid times can be created
- **Fix Priority**: MEDIUM
- **Estimated Effort**: 1-2 hours

#### 28. Lab Test Cost Not Calculated
- **Location**: `src-tauri/src/commands.rs` - `create_lab_test()`
- **Severity**: MEDIUM
- **Issue**: `cost` column added but never populated
- **Impact**: Lab charges not tracked
- **Fix Priority**: MEDIUM
- **Estimated Effort**: 1-2 hours

#### 29. N+1 Query Problem
- **Location**: `src-tauri/src/commands.rs:730-760` - `get_patients()`
- **Severity**: MEDIUM
- **Issue**: LEFT JOIN with doctors but doesn't batch load doctor names
- **Impact**: Slow queries with many patients
- **Fix Priority**: MEDIUM
- **Estimated Effort**: 2-3 hours

#### 30. Inefficient Rendering
- **Location**: `src/app/patients/page.tsx:120-150` - Table rendering
- **Severity**: MEDIUM
- **Issue**: No React.memo on table rows, all re-render on any state change
- **Impact**: Slow UI with many patients
- **Fix Priority**: MEDIUM
- **Estimated Effort**: 2-3 hours

#### 31. Missing Database Indexes
- **Location**: `src-tauri/src/db.rs` - Schema
- **Severity**: MEDIUM
- **Issue**: No indexes on frequently queried fields like `patient_id`, `doctor_id` in appointments
- **Impact**: Slow queries
- **Fix Priority**: MEDIUM
- **Estimated Effort**: 1-2 hours

#### 32. Any Types Used
- **Location**: `src/app/patients/page.tsx:50` - `editPatient: any`
- **Severity**: MEDIUM
- **Issue**: Multiple `any` types throughout codebase
- **Impact**: Type safety lost, runtime errors possible
- **Fix Priority**: MEDIUM
- **Estimated Effort**: 3-4 hours

#### 33. Optional vs Required Fields Inconsistent
- **Location**: `src/types/index.ts` - Patient type
- **Severity**: MEDIUM
- **Issue**: `assigned_doctor_name?: string` but `assigned_doctor_id?: number` - inconsistent nullability
- **Impact**: Potential null reference errors
- **Fix Priority**: MEDIUM
- **Estimated Effort**: 2-3 hours

#### 34. Incomplete Discharge Summary PDF
- **Location**: `src-tauri/src/commands.rs:340-350`
- **Severity**: MEDIUM
- **Issue**: Pagination check is "very basic" - medications may be cut off
- **Impact**: Incomplete PDFs generated
- **Fix Priority**: MEDIUM
- **Estimated Effort**: 2-3 hours

---

### 🟡 LOW PRIORITY ISSUES (6 Issues)

#### 35. Pagination State Not Reset
- **Location**: `src/app/patients/page.tsx:45-50`
- **Severity**: LOW
- **Issue**: `setCurrentPage(1)` called but happens AFTER query, not before
- **Impact**: User sees old page while new data loads
- **Fix Priority**: LOW
- **Estimated Effort**: 1 hour

#### 36. Missing Loading States
- **Location**: `src/app/appointments/page.tsx` - Queue view
- **Severity**: LOW
- **Issue**: No loading indicator while appointments load
- **Impact**: User thinks page is broken
- **Fix Priority**: LOW
- **Estimated Effort**: 1-2 hours

#### 37. TODO Items Not Implemented
- **Location**: `src/lib/health.ts:87-91`
- **Severity**: LOW
- **Issue**: `active_users`, `pending_appointments`, `system_load` marked TODO
- **Impact**: Dashboard metrics incomplete
- **Fix Priority**: LOW
- **Estimated Effort**: 2-3 hours

#### 38. No Validation on Bed Capacity
- **Location**: `src-tauri/src/commands.rs` - `admit_patient()`
- **Severity**: LOW
- **Issue**: No check if ward has available beds before admission
- **Impact**: Overbooking possible
- **Fix Priority**: LOW
- **Estimated Effort**: 1-2 hours

#### 39. Missing Type Validation
- **Location**: `src/components/modules/NewPatientModal.tsx:30-40`
- **Severity**: LOW
- **Issue**: Zod schema doesn't validate phone format properly
- **Impact**: Invalid phone numbers accepted
- **Fix Priority**: LOW
- **Estimated Effort**: 1 hour

#### 40. Missing CORS Headers
- **Location**: `src/app/api/health/route.ts`
- **Severity**: LOW
- **Issue**: No CORS configuration visible
- **Impact**: Cross-origin requests may fail
- **Fix Priority**: LOW
- **Estimated Effort**: 1 hour

---

## Issues by Category

### Security Issues (6 CRITICAL + 1 HIGH)
- Missing authentication/authorization on all commands
- SQL injection vulnerability
- Hardcoded default credentials
- No password hashing validation
- Session timeout lock screen bypass
- Sensitive data in logs
- Missing audit trail for sensitive operations

### Data Integrity Issues (8 HIGH + 2 MEDIUM)
- Orphaned records on cascade deletes
- Missing foreign key constraints
- Soft delete not enforced consistently
- Duplicate table definitions
- No unique constraints on critical fields
- Invoice balance calculation not atomic
- Incorrect revenue calculation
- Prescription refill logic broken

### Performance Issues (1 HIGH + 4 MEDIUM)
- No query pagination
- N+1 query problem
- Inefficient rendering
- Missing database indexes
- Rate limiter not thread-safe

### Error Handling Issues (4 MEDIUM)
- Unhandled promise rejections
- Missing error handling in mutations
- Unhandled database connection errors
- No validation on numeric inputs

### Frontend Issues (3 MEDIUM + 3 LOW)
- Memory leak in useEffect
- Race condition in search
- Uncontrolled input in lock screen
- Pagination state not reset
- Missing loading states
- Missing CORS headers

### Type Safety Issues (2 MEDIUM)
- Any types used
- Optional vs required fields inconsistent

### Cross-Platform Issues (1 HIGH)
- Hardcoded APPDATA path

### Missing Features (2 MEDIUM + 2 LOW)
- Incomplete discharge summary PDF
- Lab test cost not calculated
- TODO items not implemented
- No validation on bed capacity

---

## Fix Priority Roadmap

### Phase 1: CRITICAL SECURITY (Week 1)
**Estimated Effort**: 12-16 hours

1. Add authentication/authorization to all commands
2. Fix SQL injection vulnerability
3. Remove hardcoded credentials
4. Implement proper password hashing
5. Fix session lock screen bypass
6. Remove sensitive data from logs

### Phase 2: HIGH PRIORITY DATA INTEGRITY (Week 2)
**Estimated Effort**: 20-25 hours

7. Fix cascade delete implementation
8. Add missing foreign key constraints
9. Enforce soft delete consistently
10. Remove duplicate table definitions
11. Add unique constraints on critical fields
12. Fix invoice balance calculation
13. Fix revenue calculation
14. Fix prescription refill logic
15. Add query pagination
16. Add audit trail for sensitive operations
17. Implement backup/recovery mechanism
18. Fix cross-platform file paths

### Phase 3: MEDIUM PRIORITY (Week 3-4)
**Estimated Effort**: 25-30 hours

19-34. Address all medium priority issues

### Phase 4: LOW PRIORITY (Week 5)
**Estimated Effort**: 10-12 hours

35-40. Address all low priority issues

---

## Testing Recommendations

### Security Testing
- [ ] Penetration testing for authentication bypass
- [ ] SQL injection testing
- [ ] Authorization testing (role-based access)
- [ ] Session management testing
- [ ] Data exposure testing

### Data Integrity Testing
- [ ] Cascade delete testing
- [ ] Soft delete enforcement testing
- [ ] Foreign key constraint testing
- [ ] Concurrent payment testing
- [ ] Orphaned record detection

### Performance Testing
- [ ] Load testing with 10,000+ patients
- [ ] Query performance testing
- [ ] Memory leak detection
- [ ] UI rendering performance

### Regression Testing
- [ ] All existing features must continue to work
- [ ] All workflows must function correctly
- [ ] No data loss during fixes

---

## Deployment Blockers

The following issues MUST be fixed before production deployment:

1. ✗ Missing authentication/authorization on all commands
2. ✗ SQL injection vulnerability
3. ✗ Hardcoded default credentials
4. ✗ No password hashing validation
5. ✗ Session lock screen bypass
6. ✗ Orphaned records on cascade deletes
7. ✗ No query pagination (memory exhaustion risk)
8. ✗ Cross-platform file path issues

---

## Estimated Total Effort

- **CRITICAL**: 12-16 hours
- **HIGH**: 20-25 hours
- **MEDIUM**: 25-30 hours
- **LOW**: 10-12 hours

**Total**: 67-83 hours (approximately 2-3 weeks with 1 developer)

---

## Recommendations

1. **Immediate Action**: Address all CRITICAL security issues before any further development
2. **Code Review**: Implement mandatory code review process
3. **Testing**: Add automated security and integration tests
4. **Monitoring**: Implement error tracking and monitoring
5. **Documentation**: Document all fixes and changes
6. **Backup**: Implement automated backup system
7. **Compliance**: Ensure HIPAA compliance for healthcare data

---

## Related Documentation

- See `bugfix.md` for detailed bug descriptions
- See `HMS_WORKFLOW.md` for workflow requirements
- See `PRODUCTION_DEPLOYMENT_CHECKLIST.md` for deployment requirements

---

**Report Generated**: April 28, 2026  
**Next Review**: After Phase 1 completion
