"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getEmployees, createEmployee, getLeaveRequests, createLeaveRequest, approveLeaveRequest, getAttendance, markAttendance, getPayrollMonths, createPayrollMonth, getPayrollEntries, calculatePayroll, updatePayrollStatus, getStaffShifts, assignStaffShift } from "@/lib/tauri";
import { toast } from "sonner";
import { UserPlus, Calendar, Clock, CheckCircle, XCircle, Plus, Search, DollarSign, Receipt, Calculator, Briefcase } from "lucide-react";

type Tab = "employees" | "leaves" | "attendance" | "payroll" | "shifts";

export default function HrPage() {
  const [tab, setTab] = useState<Tab>("employees");
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [showAddLeave, setShowAddLeave] = useState(false);
  const [showAddPayrollMonth, setShowAddPayrollMonth] = useState(false);
  const [selectedMonthId, setSelectedMonthId] = useState<number | null>(null);
  const [shiftDate, setShiftDate] = useState(new Date().toISOString().split("T")[0]);

  const qc = useQueryClient();

  const { data: employees = [], isLoading: empLoading } = useQuery({
    queryKey: ["employees"],
    queryFn: () => getEmployees(),
  });

  const { data: leaves = [], isLoading: leaveLoading } = useQuery({
    queryKey: ["leave-requests"],
    queryFn: () => getLeaveRequests(),
  });

  const { data: attendance = [], isLoading: attLoading } = useQuery({
    queryKey: ["attendance"],
    queryFn: () => getAttendance(),
  });

  const { data: payrollMonths = [], isLoading: payrollMonthsLoading } = useQuery({
    queryKey: ["payroll-months"],
    queryFn: () => getPayrollMonths(),
  });

  const { data: payrollEntries = [], isLoading: payrollEntriesLoading } = useQuery({
    queryKey: ["payroll-entries", selectedMonthId],
    queryFn: () => selectedMonthId ? getPayrollEntries(selectedMonthId) : Promise.resolve([]),
    enabled: !!selectedMonthId,
  });

  const { data: shifts = [] } = useQuery({
    queryKey: ["staff-shifts", shiftDate],
    queryFn: () => getStaffShifts(shiftDate, shiftDate),
  });

  const createEmpMut = useMutation({
    mutationFn: createEmployee,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["employees"] }); toast.success("Employee added!"); setShowAddEmployee(false); },
    onError: (err: Error) => toast.error(err.message || "Failed to add employee"),
  });

  const createLeaveMut = useMutation({
    mutationFn: createLeaveRequest,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leave-requests"] }); toast.success("Leave request submitted!"); setShowAddLeave(false); },
    onError: (err: Error) => toast.error(err.message || "Failed to submit leave request"),
  });

  const approveMut = useMutation({
    mutationFn: (data: { id: number; approved_by: string }) => approveLeaveRequest(data.id, data.approved_by),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leave-requests"] }); toast.success("Leave approved!"); },
    onError: (err: Error) => toast.error(err.message || "Failed to approve leave"),
  });

  const markAttMut = useMutation({
    mutationFn: markAttendance,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["attendance"] }); toast.success("Attendance marked!"); },
    onError: (err: Error) => toast.error(err.message || "Failed to mark attendance"),
  });

  const createPayrollMonthMut = useMutation({
    mutationFn: createPayrollMonth,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["payroll-months"] }); toast.success("Payroll month created!"); setShowAddPayrollMonth(false); },
    onError: (err: Error) => toast.error(err.message || "Failed to create payroll month"),
  });

  const calculatePayrollMut = useMutation({
    mutationFn: calculatePayroll,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["payroll-entries", selectedMonthId] }); toast.success("Payroll calculated!"); },
    onError: (err: Error) => toast.error(err.message || "Failed to calculate payroll"),
  });

  const updatePayrollStatusMut = useMutation({
    mutationFn: (data: { id: number; status: string }) => updatePayrollStatus(data.id, data.status),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["payroll-entries", selectedMonthId] }); toast.success("Payroll status updated!"); },
    onError: (err: Error) => toast.error(err.message || "Failed to update payroll status"),
  });

  const assignShiftMut = useMutation({
    mutationFn: assignStaffShift,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["staff-shifts"] }); toast.success("Shift assigned!"); },
    onError: () => toast.error("Failed to assign shift"),
  });

  const activeEmployees = employees.filter(e => e.status === "Active").length;
  const pendingLeaves = leaves.filter(l => l.status === "Pending").length;
  const presentToday = attendance.filter(a => a.status === "Present").length;

  const markTodayAtt = () => {
    const now = new Date().toTimeString().slice(0, 5);
    employees.slice(0, 5).forEach(emp => {
      markAttMut.mutate({ employee_id: emp.id, attendance_date: new Date().toISOString().split("T")[0], check_in: now, status: "Present" });
    });
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Payroll & HR</h1>
          <p className="page-subtitle">Employee management, leaves & attendance</p>
        </div>
        <div className="flex gap-2">
          {tab === "employees" && <button onClick={() => setShowAddEmployee(true)} className="btn btn-primary"><UserPlus size={16} /> Add Employee</button>}
          {tab === "leaves" && <button onClick={() => setShowAddLeave(true)} className="btn btn-primary"><Plus size={16} /> Request Leave</button>}
          {tab === "attendance" && <button onClick={markTodayAtt} className="btn btn-primary"><CheckCircle size={16} /> Mark Today's Attendance</button>}
          {tab === "payroll" && <button onClick={() => setShowAddPayrollMonth(true)} className="btn btn-primary"><Plus size={16} /> New Payroll Month</button>}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3.5 mb-5">
        <div className="stat-card anim-fade-up d1">
          <div className="stat-value text-accent">{employees.length}</div>
          <div className="stat-label">Total Employees</div>
        </div>
        <div className="stat-card anim-fade-up d2">
          <div className="stat-value text-success">{activeEmployees}</div>
          <div className="stat-label">Active</div>
        </div>
        <div className="stat-card anim-fade-up d3">
          <div className="stat-value text-warning">{pendingLeaves}</div>
          <div className="stat-label">Pending Leaves</div>
        </div>
        <div className="stat-card anim-fade-up d4">
          <div className="stat-value text-purple">{presentToday}</div>
          <div className="stat-label">Present Today</div>
        </div>
      </div>

      <div className="tab-bar mb-4">
        <button onClick={() => setTab("employees")} className={`tab-item ${tab === "employees" ? "active" : ""}`}>Employees</button>
        <button onClick={() => setTab("leaves")} className={`tab-item ${tab === "leaves" ? "active" : ""}`}>Leave Requests</button>
        <button onClick={() => setTab("attendance")} className={`tab-item ${tab === "attendance" ? "active" : ""}`}>Attendance</button>
        <button onClick={() => setTab("payroll")} className={`tab-item ${tab === "payroll" ? "active" : ""}`}>Payroll</button>
        <button onClick={() => setTab("shifts")} className={`tab-item ${tab === "shifts" ? "active" : ""}`}>Shifts</button>
      </div>

      <div className="card">
        {tab === "employees" && (
          empLoading ? <div className="py-12 text-center text-muted">Loading...</div> : (
            <table className="data-table">
              <thead><tr><th>Code</th><th>Name</th><th>Department</th><th>Designation</th><th>Phone</th><th>Salary</th><th>Status</th></tr></thead>
              <tbody>
                {employees.map(emp => (
                  <tr key={emp.id}>
                    <td className="font-mono text-subtle">{emp.employee_code}</td>
                    <td className="font-medium text-white">{emp.full_name}</td>
                    <td>{emp.department}</td>
                    <td>{emp.designation}</td>
                    <td className="text-muted">{emp.phone}</td>
                    <td>₹{emp.basic_salary.toLocaleString()}</td>
                    <td><span className={`badge ${emp.status === "Active" ? "badge-green" : "badge-gray"}`}>{emp.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {tab === "leaves" && (
          leaveLoading ? <div className="py-12 text-center text-muted">Loading...</div> : (
            <table className="data-table">
              <thead><tr><th>Employee</th><th>Type</th><th>Start Date</th><th>End Date</th><th>Days</th><th>Reason</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {leaves.map(leave => (
                  <tr key={leave.id}>
                    <td className="font-medium text-white">{leave.employee_name}</td>
                    <td>{leave.leave_type}</td>
                    <td>{leave.start_date}</td>
                    <td>{leave.end_date}</td>
                    <td>{leave.total_days}</td>
                    <td className="text-muted text-xs max-w-[150px] truncate">{leave.reason || "-"}</td>
                    <td><span className={`badge ${leave.status === "Approved" ? "badge-green" : leave.status === "Pending" ? "badge-yellow" : "badge-red"}`}>{leave.status}</span></td>
                    <td>
                      {leave.status === "Pending" && (
                        <div className="flex gap-1">
                          <button onClick={() => approveMut.mutate({ id: leave.id, approved_by: "Admin" })} className="btn btn-sm btn-success"><CheckCircle size={12} /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {tab === "attendance" && (
          attLoading ? <div className="py-12 text-center text-muted">Loading...</div> : (
            <table className="data-table">
              <thead><tr><th>Employee</th><th>Date</th><th>Check In</th><th>Check Out</th><th>Hours</th><th>Status</th></tr></thead>
              <tbody>
                {attendance.map(att => (
                  <tr key={att.id}>
                    <td className="font-medium text-white">{att.employee_name}</td>
                    <td>{att.attendance_date}</td>
                    <td>{att.check_in || "-"}</td>
                    <td>{att.check_out || "-"}</td>
                    <td>{att.work_hours.toFixed(1)}</td>
                    <td><span className={`badge ${att.status === "Present" ? "badge-green" : att.status === "Absent" ? "badge-red" : "badge-yellow"}`}>{att.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {tab === "payroll" && (
          <div className="flex gap-4 p-4 min-h-[400px]">
            <div className="w-1/3 border-r border-border pr-4">
              <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2"><Calendar size={14} /> Payroll Months</h3>
              {payrollMonthsLoading ? <div className="text-muted text-sm py-4">Loading...</div> : (
                <div className="space-y-2">
                  {payrollMonths.map(m => (
                    <button
                      key={m.id}
                      onClick={() => setSelectedMonthId(m.id)}
                      className={`w-full text-left p-3 rounded-lg border transition-all ${selectedMonthId === m.id ? "bg-accent/10 border-accent text-accent" : "bg-surface hover:bg-white/5 border-border text-subtle"}`}
                    >
                      <div className="font-bold">{m.month_year}</div>
                      <div className="text-[10px] opacity-70">{m.start_date} to {m.end_date}</div>
                      <span className={`text-[10px] mt-1 inline-block px-1.5 py-0.5 rounded-full ${m.status === "Processed" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}>{m.status}</span>
                    </button>
                  ))}
                  {payrollMonths.length === 0 && <div className="text-muted text-sm py-8 text-center italic">No payroll months created</div>}
                </div>
              )}
            </div>
            <div className="flex-1 pl-2">
              {!selectedMonthId ? (
                <div className="h-full flex flex-col items-center justify-center text-muted italic">
                  <Receipt size={48} className="mb-4 opacity-20" />
                  Select a month to view payroll entries
                </div>
              ) : (
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-bold text-white">Payroll Entries</h3>
                    <button
                      onClick={() => calculatePayrollMut.mutate(selectedMonthId)}
                      disabled={calculatePayrollMut.isPending}
                      className="btn btn-sm btn-ghost border border-border hover:bg-accent/10 hover:text-accent flex items-center gap-2"
                    >
                      <Calculator size={14} /> Calculate Payroll
                    </button>
                  </div>
                  {payrollEntriesLoading ? <div className="text-muted text-sm py-12 text-center">Loading entries...</div> : (
                    <table className="data-table">
                      <thead><tr><th>Employee</th><th>Basic</th><th>Allow.</th><th>Deduct.</th><th>Net</th><th>Status</th><th>Action</th></tr></thead>
                      <tbody>
                        {payrollEntries.map(entry => (
                          <tr key={entry.id}>
                            <td className="font-medium text-white">{entry.employee_name}</td>
                            <td>₹{entry.basic_salary.toLocaleString()}</td>
                            <td className="text-green-400">+₹{entry.allowances.toLocaleString()}</td>
                            <td className="text-red-400">-₹{entry.deductions.toLocaleString()}</td>
                            <td className="font-bold">₹{entry.net_salary.toLocaleString()}</td>
                            <td><span className={`badge ${entry.status === "Paid" ? "badge-green" : "badge-yellow"}`}>{entry.status}</span></td>
                            <td>
                              {entry.status === "Pending" && (
                                <button onClick={() => updatePayrollStatusMut.mutate({ id: entry.id, status: "Paid" })} className="text-accent hover:underline text-xs">Mark Paid</button>
                              )}
                            </td>
                          </tr>
                        ))}
                        {payrollEntries.length === 0 && (
                          <tr><td colSpan={7} className="py-12 text-center text-muted italic">No entries found. Click calculate to generate entries.</td></tr>
                        )}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "shifts" && (
          <div className="p-5">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="font-display font-bold text-base text-white">Daily Shift Roster</h3>
                <p className="text-xs text-muted">Manage staff shift assignments</p>
              </div>
              <input
                type="date"
                value={shiftDate}
                onChange={(e) => setShiftDate(e.target.value)}
                className="input w-40"
              />
            </div>

            <div className="grid grid-cols-1 gap-3">
              {employees.filter(e => e.status === "Active").map(emp => {
                const empShift = shifts.find(s => s.employee_id === emp.id);
                return (
                  <div key={emp.id} className="bg-surface2 border border-border rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-purple/10 flex items-center justify-center text-purple font-bold text-xs">
                        {emp.first_name[0]}{emp.last_name[0]}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-white">{emp.full_name}</div>
                        <div className="text-[11px] text-subtle">{emp.designation} • {emp.department}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="flex gap-1 bg-surface border border-border rounded-lg p-0.5">
                        {["Morning", "Evening", "Night", "On-Call", "Holiday"].map(type => (
                          <button
                            key={type}
                            onClick={() => assignShiftMut.mutate({
                              employee_id: emp.id,
                              shift_date: shiftDate,
                              shift_type: type,
                            })}
                            className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${empShift?.shift_type === type ? "bg-accent text-white shadow-lg" : "text-muted hover:text-white"}`}
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                      <span className={`badge text-[10px] ${empShift ? "badge-green" : "badge-gray opacity-50"}`}>
                        {empShift ? "Assigned" : "Not Set"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {showAddPayrollMonth && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center anim-fade-in">
          <div className="bg-surface border border-border2 rounded-2xl w-[400px] flex flex-col shadow-card">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h2 className="font-display font-bold text-base">New Payroll Month</h2>
              <button onClick={() => setShowAddPayrollMonth(false)} className="text-subtle hover:text-white"><XCircle size={18} /></button>
            </div>
            <form onSubmit={e => { e.preventDefault(); const f = e.target as HTMLFormElement; createPayrollMonthMut.mutate({ month_year: (f.elements.namedItem("month_year") as HTMLInputElement).value, start_date: (f.elements.namedItem("start_date") as HTMLInputElement).value, end_date: (f.elements.namedItem("end_date") as HTMLInputElement).value }); }} className="p-6 space-y-4">
              <div><label className="form-label">Month & Year *</label><input name="month_year" placeholder="e.g. October 2023" required className="input" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="form-label">Start Date *</label><input name="start_date" type="date" required className="input" /></div>
                <div><label className="form-label">End Date *</label><input name="end_date" type="date" required className="input" /></div>
              </div>
              <div className="flex gap-3 justify-end pt-4">
                <button type="button" onClick={() => setShowAddPayrollMonth(false)} className="btn btn-ghost">Cancel</button>
                <button type="submit" className="btn btn-primary">Create Month</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddEmployee && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center anim-fade-in">
          <div className="bg-surface border border-border2 rounded-2xl w-[500px] flex flex-col shadow-card">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h2 className="font-display font-bold text-base">Add Employee</h2>
              <button onClick={() => setShowAddEmployee(false)} className="text-subtle hover:text-white"><XCircle size={18} /></button>
            </div>
            <form onSubmit={e => { e.preventDefault(); const f = e.target as HTMLFormElement; createEmpMut.mutate({ first_name: (f.elements.namedItem("first_name") as HTMLInputElement).value, last_name: (f.elements.namedItem("last_name") as HTMLInputElement).value, email: (f.elements.namedItem("email") as HTMLInputElement).value, phone: (f.elements.namedItem("phone") as HTMLInputElement).value, department: (f.elements.namedItem("department") as HTMLInputElement).value, designation: (f.elements.namedItem("designation") as HTMLInputElement).value, date_of_join: (f.elements.namedItem("date_of_join") as HTMLInputElement).value, basic_salary: parseFloat((f.elements.namedItem("basic_salary") as HTMLInputElement).value), employee_type: (f.elements.namedItem("employee_type") as HTMLSelectElement).value }); }} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="form-label">First Name *</label><input name="first_name" required className="input" /></div>
                <div><label className="form-label">Last Name *</label><input name="last_name" required className="input" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="form-label">Email *</label><input name="email" type="email" required className="input" /></div>
                <div><label className="form-label">Phone *</label><input name="phone" required className="input" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="form-label">Department *</label><input name="department" required className="input" /></div>
                <div><label className="form-label">Designation *</label><input name="designation" required className="input" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="form-label">Join Date *</label><input name="date_of_join" type="date" required className="input" /></div>
                <div><label className="form-label">Basic Salary *</label><input name="basic_salary" type="number" required className="input" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="form-label">Employee Type</label><select name="employee_type" className="select"><option value="Full-time">Full-time</option><option value="Part-time">Part-time</option><option value="Contract">Contract</option><option value="Intern">Intern</option></select></div>
              </div>
              <div className="flex gap-3 justify-end pt-4">
                <button type="button" onClick={() => setShowAddEmployee(false)} className="btn btn-ghost">Cancel</button>
                <button type="submit" className="btn btn-primary">Add Employee</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddLeave && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center anim-fade-in">
          <div className="bg-surface border border-border2 rounded-2xl w-[450px] flex flex-col shadow-card">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h2 className="font-display font-bold text-base">Request Leave</h2>
              <button onClick={() => setShowAddLeave(false)} className="text-subtle hover:text-white"><XCircle size={18} /></button>
            </div>
            <form onSubmit={e => { e.preventDefault(); const f = e.target as HTMLFormElement; createLeaveMut.mutate({ employee_id: parseInt((f.elements.namedItem("employee_id") as HTMLSelectElement).value), leave_type: (f.elements.namedItem("leave_type") as HTMLSelectElement).value, start_date: (f.elements.namedItem("start_date") as HTMLInputElement).value, end_date: (f.elements.namedItem("end_date") as HTMLInputElement).value, total_days: parseFloat((f.elements.namedItem("total_days") as HTMLInputElement).value), reason: (f.elements.namedItem("reason") as HTMLInputElement).value }); }} className="p-6 space-y-4">
              <div><label className="form-label">Employee *</label><select name="employee_id" required className="select"><option value="">Select Employee</option>{employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select></div>
              <div><label className="form-label">Leave Type *</label><select name="leave_type" required className="select"><option value="Casual">Casual</option><option value="Sick">Sick</option><option value="Earned">Earned</option><option value="Maternity">Maternity</option><option value="Paternity">Paternity</option><option value="Unpaid">Unpaid</option></select></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="form-label">Start Date *</label><input name="start_date" type="date" required className="input" /></div>
                <div><label className="form-label">End Date *</label><input name="end_date" type="date" required className="input" /></div>
              </div>
              <div><label className="form-label">Total Days *</label><input name="total_days" type="number" step="0.5" required className="input" /></div>
              <div><label className="form-label">Reason</label><textarea name="reason" className="textarea" /></div>
              <div className="flex gap-3 justify-end pt-4">
                <button type="button" onClick={() => setShowAddLeave(false)} className="btn btn-ghost">Cancel</button>
                <button type="submit" className="btn btn-primary">Submit Request</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
