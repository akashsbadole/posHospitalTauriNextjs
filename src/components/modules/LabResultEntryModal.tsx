"use client";
import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateLabResult } from "@/lib/tauri";
import { sendLabResultNotification } from "@/lib/notifications";
import { toast } from "sonner";

interface LabResultEntryProps {
  labTest: {
    id: number;
    test_name: string;
    test_category: string;
    patient_name?: string;
  };
  open: boolean;
  onClose: () => void;
}

const REFERENCE_RANGES: Record<string, { min: number; max: number; unit: string }> = {
  "Hemoglobin": { min: 12, max: 17.5, unit: "g/dL" },
  "CBC": { min: 4, max: 11, unit: "x10^3/µL" },
  "Platelet Count": { min: 150, max: 450, unit: "x10^3/µL" },
  "ESR": { min: 0, max: 20, unit: "mm/hr" },
  "Blood Sugar": { min: 70, max: 100, unit: "mg/dL" },
  "Cholesterol": { min: 0, max: 200, unit: "mg/dL" },
  "HbA1c": { min: 4, max: 5.6, unit: "%" },
  "TSH": { min: 0.4, max: 4, unit: "mIU/L" },
  "Creatinine": { min: 0.7, max: 1.3, unit: "mg/dL" },
  "Urea": { min: 7, max: 20, unit: "mg/dL" },
};

export function LabResultEntryModal({ labTest, open, onClose }: LabResultEntryProps) {
  const [resultValue, setResultValue] = useState("");
  const [resultUnit, setResultUnit] = useState("");
  const [isAbnormal, setIsAbnormal] = useState(false);
  const [notes, setNotes] = useState("");
  const qc = useQueryClient();

  useEffect(() => {
    if (open) {
      const range = REFERENCE_RANGES[labTest.test_name];
      if (range) {
        setResultUnit(range.unit);
      }
    }
  }, [open, labTest.test_name]);

  useEffect(() => {
    const range = REFERENCE_RANGES[labTest.test_name];
    if (range && resultValue) {
      const val = parseFloat(resultValue);
      setIsAbnormal(val < range.min || val > range.max);
    }
  }, [resultValue, labTest.test_name]);

  const updateMut = useMutation({
    mutationFn: () => updateLabResult(labTest.id, {
      result_value: resultValue,
      result_unit: resultUnit,
      is_abnormal: isAbnormal,
      notes: notes || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lab-tests"] });
      toast.success("Lab result saved!");
      sendLabResultNotification(labTest.patient_name || "Patient", labTest.test_name);
      onClose();
    },
    onError: () => toast.error("Failed to save result"),
  });

  if (!open) return null;

  const range = REFERENCE_RANGES[labTest.test_name];

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center anim-fade-in">
      <div className="bg-surface border border-border2 rounded-2xl w-[480px] shadow-card">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="font-display font-bold text-base">Enter Lab Result</h2>
            <p className="text-xs text-muted">{labTest.test_name} - {labTest.patient_name}</p>
          </div>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Result Value *</label>
              <input
                type="number"
                step="0.01"
                value={resultValue}
                onChange={(e) => setResultValue(e.target.value)}
                placeholder="Enter result"
                className="w-full"
              />
            </div>
            <div>
              <label className="form-label">Unit</label>
              <input
                value={resultUnit}
                onChange={(e) => setResultUnit(e.target.value)}
                placeholder="e.g., mg/dL"
                className="w-full"
              />
            </div>
          </div>

          {range && (
            <div className="bg-surface2 border border-border rounded-lg p-3">
              <div className="text-xs text-subtle mb-1">Reference Range</div>
              <div className="text-sm text-white">{range.min} - {range.max} {range.unit}</div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="abnormal"
              checked={isAbnormal}
              onChange={(e) => setIsAbnormal(e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <label htmlFor="abnormal" className="text-sm text-white">Mark as Abnormal</label>
          </div>

          <div>
            <label className="form-label">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Clinical notes..."
              className="w-full"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border flex gap-3 justify-end">
          <button onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button
            onClick={() => updateMut.mutate()}
            disabled={!resultValue || updateMut.isPending}
            className="btn btn-primary"
          >
            {updateMut.isPending ? "Saving..." : "Save Result"}
          </button>
        </div>
      </div>
    </div>
  );
}
