"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAppointments } from "@/lib/tauri";
import { format, startOfWeek, addDays, subDays, isSameDay } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface WeeklyCalendarProps {
  onDateSelect?: (date: Date) => void;
}

const HOURS = ["08:00", "09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00"];

export function WeeklyCalendar({ onDateSelect }: WeeklyCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const { data: appointments = [] } = useQuery({
    queryKey: ["appointments-week", format(weekStart, "yyyy-MM-dd")],
    queryFn: () => getAppointments(format(weekStart, "yyyy-MM-dd")),
  });

  const weekAppointments = appointments.filter(a => {
    const aptDate = new Date(a.appointment_date);
    return days.some(d => isSameDay(d, aptDate));
  });

  const getAppointmentsForSlot = (date: Date, hour: string) => {
    return weekAppointments.filter(a => {
      const aptDate = new Date(a.appointment_date);
      return isSameDay(aptDate, date) && a.appointment_time.startsWith(hour.substring(0, 2));
    });
  };

  const statusColors: Record<string, string> = {
    "Scheduled": "bg-accent/20 border-accent text-accent",
    "Checked In": "bg-success/20 border-success text-success",
    "Completed": "bg-muted/20 border-muted text-muted",
    "Cancelled": "bg-danger/20 border-danger text-danger",
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="flex items-center gap-3">
          <button onClick={() => setCurrentDate(d => subDays(d, 7))} className="icon-btn">
            <ChevronLeft size={14} />
          </button>
          <span className="font-medium text-[13px]">
            {format(weekStart, "MMM d")} - {format(addDays(weekStart, 6), "MMM d, yyyy")}
          </span>
          <button onClick={() => setCurrentDate(d => addDays(d, 7))} className="icon-btn">
            <ChevronRight size={14} />
          </button>
        </div>
        <button
          onClick={() => { setCurrentDate(new Date()); setSelectedDate(new Date()); }}
          className="btn btn-ghost btn-sm"
        >
          Today
        </button>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[800px]">
          <div className="grid grid-cols-8 border-b border-border">
            <div className="p-2 text-xs text-subtle font-medium">Time</div>
            {days.map(day => (
              <div
                key={day.toISOString()}
                onClick={() => { setSelectedDate(day); onDateSelect?.(day); }}
                className={`p-2 text-center cursor-pointer transition-all ${
                  isSameDay(day, selectedDate)
                    ? "bg-accent/10 border-b-2 border-accent"
                    : "hover:bg-surface2"
                }`}
              >
                <div className="text-[10px] text-subtle uppercase">{format(day, "EEE")}</div>
                <div className={`text-sm font-medium ${isSameDay(day, new Date()) ? "text-accent" : "text-white"}`}>
                  {format(day, "d")}
                </div>
              </div>
            ))}
          </div>

          <div className="max-h-[500px] overflow-y-auto">
            {HOURS.map(hour => (
              <div key={hour} className="grid grid-cols-8 border-b border-border/50">
                <div className="p-2 text-xs text-subtle font-mono">{hour}</div>
                {days.map(day => {
                  const slotAppts = getAppointmentsForSlot(day, hour);
                  return (
                    <div
                      key={`${day.toISOString()}-${hour}`}
                      className="p-1 min-h-[60px] border-l border-border/30 hover:bg-surface2/50"
                    >
                      {slotAppts.map(apt => (
                        <div
                          key={apt.id}
                          className={`text-[10px] px-1.5 py-0.5 rounded border mb-0.5 truncate ${
                            statusColors[apt.status] || "bg-surface2 border-border text-muted"
                          }`}
                          title={`${apt.patient_name} - ${apt.type}`}
                        >
                          {apt.patient_name?.split(" ")[0]}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
