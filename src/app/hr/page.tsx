"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getEmployees, createEmployee, getLeaveRequests, createLeaveRequest, approveLeaveRequest, getAttendance, markAttendance } from "@/lib/tauri";
import { toast } from "sonner";
import { UserPlus, Calendar, Clock, CheckCircle, XCircle, Plus, Search } from "lucide-react";

type Tab = "employees" | "leaves" | "attendance";

export default function HrPage() {
  const [tab, setTab] = useState<Tab>("employees");
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [showAddLeave, setShowAddLeave] = useState(false);
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

  const createEmpMut = useMutation({
    mutationFn: createEmployee,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["employees"] }); toast.success("Employee added!"); setShowAddEmployee(false); },
    onError: () => toast.error("Failed to add employee"),
  });

  const createLeaveMut = useMutation({
    mutationFn: createLeaveRequest,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leave-requests"] }); toast.success("Leave request submitted!"); setShowAddLeave(false); },
    onError: () => toast.error("Failed to submit leave request"),
  });

  const approveMut = useMutation({
    mutationFn: (data: { id: number; approved_by: string }) => approveLeaveRequest(data.id, data.approved_by),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leave-requests"] }); toast.success("Leave approved!"); },
    onError: () => toast.error("Failed to approve leave"),
  });

  const markAttMut = useMutation({
    mutationFn: markAttendance,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["attendance"] }); toast.success("Attendance marked!"); },
    onError: () => toast.error("Failed to mark attendance"),
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
      </div>

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
