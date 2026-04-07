"use client";
import { useState, useEffect } from "react";
import { X, Search, Video } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createAppointment, getPatients, getDoctors } from "@/lib/tauri";
import { toast } from "sonner";
import type { Patient, Doctor } from "@/types";

const schema = z.object({
  patient_id: z.number().min(1, "Patient is required"),
  doctor_id: z.number().min(1, "Doctor is required"),
  department: z.string().min(1, "Department is required"),
  appointment_date: z.string().min(1, "Date is required"),
  appointment_time: z.string().min(1, "Time is required"),
  type: z.string().min(1, "Type is required"),
  is_video_consultation: z.boolean().optional(),
  video_link: z.string().optional(),
  notes: z.string().optional(),
});

type F = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  defaultDate?: string;
}

const TIME_SLOTS = ["08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30","12:00","14:00","14:30","15:00","15:30","16:00","16:30","17:00","17:30"];
const APPOINTMENT_TYPES = ["General Checkup", "Follow-up", "Consultation", "Emergency", "Post-Op", "Lab Review", "ECG", "X-Ray Review", "MRI Consultation", "Vaccination"];

export function NewAppointmentModal({ open, onClose, defaultDate, initialPatientId }: Props & { initialPatientId?: number }) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [patientSearch, setPatientSearch] = useState("");
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);
  const qc = useQueryClient();

  const { register, handleSubmit, formState: { errors }, reset, setValue, watch } = useForm<F>({
    resolver: zodResolver(schema),
    defaultValues: {
      appointment_date: defaultDate || new Date().toISOString().split("T")[0],
      appointment_time: "09:00",
      type: "General Checkup",
      is_video_consultation: false,
      patient_id: initialPatientId,
    },
  });

  const selectedPatientId = watch("patient_id");
  const selectedDoctorId = watch("doctor_id");
  const isVideoConsultation = watch("is_video_consultation");

  useEffect(() => {
    if (open) {
      getPatients().then(data => {
        setPatients(data);
        if (initialPatientId) {
          const p = data.find(pat => pat.id === initialPatientId);
          if (p) {
            setPatientSearch(p.full_name);
            if (p.assigned_doctor_id) setValue("doctor_id", p.assigned_doctor_id);
          }
        }
      });
      getDoctors().then(setDoctors);
    }
  }, [open, initialPatientId, setValue]);

  const filteredPatients = patients.filter(p => 
    p.full_name.toLowerCase().includes(patientSearch.toLowerCase()) ||
    p.patient_code.toLowerCase().includes(patientSearch.toLowerCase()) ||
    p.phone.includes(patientSearch)
  );

  const selectedPatient = patients.find(p => p.id === selectedPatientId);

  const selectedDoctor = doctors.find(d => d.id === selectedDoctorId);

  useEffect(() => {
    if (selectedDoctor) {
      setValue("department", selectedDoctor.specialization);
    }
  }, [selectedDoctorId, selectedDoctor, setValue]);

  const createMut = useMutation({
    mutationFn: (data: F) => createAppointment({ ...data, status: "Scheduled" } as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("Appointment scheduled!");
      onClose();
      reset();
    },
    onError: () => toast.error("Failed to create appointment"),
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center anim-fade-in">
      <div className="bg-surface border border-border2 rounded-2xl w-[560px] max-h-[90vh] flex flex-col shadow-card">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-display font-bold text-base">New Appointment</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit((d) => createMut.mutate(d))} className="flex-1 overflow-y-auto p-6">
          <div className="space-y-4">
            <div>
              <label className="form-label">Patient *</label>
              <div className="relative">
                <input
                  value={patientSearch}
                  onChange={(e) => { setPatientSearch(e.target.value); setShowPatientDropdown(true); }}
                  onFocus={() => setShowPatientDropdown(true)}
                  placeholder="Search by name, code, or phone..."
                  className="w-full"
                />
                {showPatientDropdown && filteredPatients.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-surface2 border border-border rounded-lg max-h-48 overflow-y-auto">
                    {filteredPatients.slice(0, 10).map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => { setValue("patient_id", p.id); setPatientSearch(p.full_name); setShowPatientDropdown(false); }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-surface3 flex justify-between"
                      >
                        <span className="text-white">{p.full_name}</span>
                        <span className="text-subtle text-xs">{p.patient_code}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedPatient && (
                <div className="mt-1 text-xs text-accent">Selected: {selectedPatient.patient_code} • {selectedPatient.phone}</div>
              )}
              {errors.patient_id && <p className="form-error">{errors.patient_id.message}</p>}
            </div>

            <div>
              <label className="form-label">Doctor *</label>
              <select {...register("doctor_id", { valueAsNumber: true })} className="w-full">
                <option value="">Select Doctor</option>
                {doctors.map(d => (
                  <option key={d.id} value={d.id}>{d.full_name} - {d.specialization}</option>
                ))}
              </select>
              {errors.doctor_id && <p className="form-error">{errors.doctor_id.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Date *</label>
                <input type="date" {...register("appointment_date")} className="w-full" />
                {errors.appointment_date && <p className="form-error">{errors.appointment_date.message}</p>}
              </div>
              <div>
                <label className="form-label">Time *</label>
                <select {...register("appointment_time")} className="w-full">
                  {TIME_SLOTS.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Type *</label>
                <select {...register("type")} className="w-full">
                  {APPOINTMENT_TYPES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Department</label>
                <input {...register("department")} className="w-full" readOnly />
              </div>
            </div>

            <div className="flex items-center gap-4 p-3 bg-accent/10 border border-accent/20 rounded-lg">
              <input
                type="checkbox"
                id="videoConsult"
                {...register("is_video_consultation")}
                className="w-4 h-4 rounded"
              />
              <label htmlFor="videoConsult" className="flex items-center gap-2 text-sm text-white">
                <Video size={16} className="text-accent" /> Video Consultation
              </label>
            </div>

            {isVideoConsultation && (
              <div>
                <label className="form-label">Video Call Link</label>
                <input
                  {...register("video_link")}
                  placeholder="https://meet.google.com/xxx or https://zoom.us/j/xxx"
                  className="w-full"
                />
                <p className="text-xs text-subtle mt-1">Enter Google Meet, Zoom, or any video call link</p>
              </div>
            )}

            <div>
              <label className="form-label">Notes</label>
              <textarea {...register("notes")} rows={2} className="w-full" placeholder="Optional notes..." />
            </div>
          </div>
        </form>

        <div className="px-6 py-4 border-t border-border flex gap-3 justify-end">
          <button onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button onClick={handleSubmit((d) => createMut.mutate(d))} className="btn btn-primary">
            {createMut.isPending ? "Creating..." : "Schedule Appointment"}
          </button>
        </div>
      </div>
    </div>
  );
}
