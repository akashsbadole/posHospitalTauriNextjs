# HMS Bug Report - Quick Reference

**Total Issues**: 40+  
**Critical**: 6 | **High**: 12 | **Medium**: 16 | **Low**: 6

---

## 🔴 CRITICAL - Fix Immediately

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 1 | Missing auth on 100+ commands | `src-tauri/src/commands.rs` | System compromise |
| 2 | SQL injection in permissions | `src-tauri/src/commands.rs:125` | DB compromise |
| 3 | Hardcoded credentials | `src-tauri/src/db.rs` | Easy unauthorized access |
| 4 | No password hashing | `src/lib/tauri.ts` | Plain text passwords |
| 5 | Session lock bypass | `src/components/layout/AppShell.tsx:70` | Unattended access |
| 6 | Sensitive data in logs | `src-tauri/src/commands.rs` | HIPAA violations |

---

## 🟠 HIGH - Fix This Week

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 7 | Orphaned records | `src-tauri/src/db.rs` | Data inconsistency |
| 8 | Missing FK constraints | `src-tauri/src/db.rs` | Referential integrity |
| 9 | Soft delete not enforced | `src-tauri/src/commands.rs` | Deleted data accessible |
| 10 | Duplicate tables | `src-tauri/src/db.rs` | Migration failures |
| 11 | No unique constraints | `src-tauri/src/db.rs` | Double-booking possible |
| 12 | Invoice balance not atomic | `src/app/billing/page.tsx` | Race conditions |
| 13 | Revenue calculation wrong | `src-tauri/src/commands.rs:176` | Financial discrepancies |
| 14 | Refill logic broken | `src-tauri/src/commands.rs:2033` | Inventory not tracked |
| 15 | No query pagination | `src-tauri/src/commands.rs` | Memory exhaustion |
| 16 | No audit trail | `src-tauri/src/commands.rs` | No accountability |
| 17 | No backup mechanism | `scripts/backup-database.sh` | Data loss risk |
| 18 | Windows-only paths | `src-tauri/src/commands.rs:355` | Linux/Mac failures |

---

## 🟡 MEDIUM - Fix Next 2 Weeks

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 19 | Unhandled rejections | `src/app/patients/page.tsx:95` | Silent failures |
| 20 | Missing error handling | `src/app/appointments/page.tsx:40` | UI hangs |
| 21 | DB errors not logged | `src-tauri/src/commands.rs` | Hard to debug |
| 22 | No input validation | `src/components/modules/NewPatientModal.tsx` | Invalid data |
| 23 | Memory leak in useEffect | `src/components/layout/AppShell.tsx:60` | Performance |
| 24 | Search race condition | `src/app/patients/page.tsx:35` | Wrong results |
| 25 | Password not cleared | `src/components/layout/AppShell.tsx:85` | Security |
| 26 | Rate limiter leaks memory | `src-tauri/src/commands.rs:38` | Ineffective |
| 27 | No time validation | `src/app/appointments/page.tsx:120` | Invalid times |
| 28 | Lab cost not set | `src-tauri/src/commands.rs` | Charges not tracked |
| 29 | N+1 queries | `src-tauri/src/commands.rs:730` | Slow queries |
| 30 | Inefficient rendering | `src/app/patients/page.tsx:120` | Slow UI |
| 31 | Missing indexes | `src-tauri/src/db.rs` | Slow queries |
| 32 | Any types used | `src/app/patients/page.tsx:50` | Type safety lost |
| 33 | Inconsistent nullability | `src/types/index.ts` | Null errors |
| 34 | Incomplete PDFs | `src-tauri/src/commands.rs:340` | Cut-off content |

---

## 🟡 LOW - Fix Later

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 35 | Pagination not reset | `src/app/patients/page.tsx:45` | Empty results |
| 36 | No loading states | `src/app/appointments/page.tsx` | Confusing UX |
| 37 | TODO items | `src/lib/health.ts:87` | Incomplete features |
| 38 | No bed capacity check | `src-tauri/src/commands.rs` | Overbooking |
| 39 | Phone validation weak | `src/components/modules/NewPatientModal.tsx:30` | Invalid data |
| 40 | No CORS headers | `src/app/api/health/route.ts` | CORS failures |

---

## Deployment Blockers

❌ Cannot deploy until these are fixed:
1. Authentication/authorization on all commands
2. SQL injection vulnerability
3. Hardcoded credentials removed
4. Password hashing implemented
5. Session lock bypass fixed
6. Cascade delete working
7. Query pagination added
8. Cross-platform paths fixed

---

## Effort Estimate

| Phase | Issues | Effort | Timeline |
|-------|--------|--------|----------|
| Phase 1: Critical Security | 1-6 | 12-16h | Week 1 |
| Phase 2: High Priority | 7-18 | 20-25h | Week 2 |
| Phase 3: Medium Priority | 19-34 | 25-30h | Week 3-4 |
| Phase 4: Low Priority | 35-40 | 10-12h | Week 5 |
| **TOTAL** | **40** | **67-83h** | **2-3 weeks** |

---

## Quick Fixes (< 1 hour each)

- Remove duplicate table definitions (#10)
- Fix Windows-only paths (#18)
- Clear password on error (#25)
- Add CORS headers (#40)
- Add phone validation (#39)
- Add bed capacity check (#38)

---

## Complex Fixes (> 3 hours each)

- Add auth to all commands (#1) - 4-6h
- Add query pagination (#15) - 4-5h
- Implement backup system (#17) - 4-5h
- Fix all type safety (#32-33) - 3-4h
- Add audit trail (#16) - 3-4h

---

## Testing Checklist

- [ ] Security: Auth bypass, SQL injection, authorization
- [ ] Data: Cascade delete, soft delete, FK constraints
- [ ] Performance: Load test with 10k+ patients
- [ ] Regression: All existing features work
- [ ] Cross-platform: Windows, Linux, Mac

---

## See Also

- `COMPREHENSIVE_BUG_REPORT.md` - Full detailed report
- `bugfix.md` - Original bug analysis
- `HMS_WORKFLOW.md` - Workflow requirements
- `PRODUCTION_DEPLOYMENT_CHECKLIST.md` - Deployment requirements
