"use client";
import { useQuery } from "@tanstack/react-query";
import { getPrescriptionById, getSetting } from "@/lib/tauri";
import { format } from "date-fns";
import { X, Printer } from "lucide-react";

interface PrescriptionPrintProps {
  prescriptionId: number;
  open: boolean;
  onClose: () => void;
}

export function PrescriptionPrintView({ prescriptionId, open, onClose }: PrescriptionPrintProps) {
  const { data: prescription, isLoading } = useQuery({
    queryKey: ["prescription", prescriptionId],
    queryFn: () => getPrescriptionById(prescriptionId),
  });

  const { data: hospitalName } = useQuery({
    queryKey: ["setting", "hospital_name"],
    queryFn: () => getSetting("hospital_name"),
  });

  if (!open) return null;

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (!prescription) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border2 rounded-2xl w-[600px] max-h-[90vh] flex flex-col shadow-card">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between print:hidden">
          <h2 className="font-display font-bold text-base">Prescription</h2>
          <div className="flex gap-2">
            <button onClick={handlePrint} className="btn btn-ghost btn-sm">
              <Printer size={14} /> Print
            </button>
            <button onClick={onClose}><X size={18} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-white text-black" id="prescription-print">
          <div className="text-center border-b-2 border-black pb-4 mb-6">
            <h1 className="text-xl font-bold">{hospitalName || "MediCore Hospital"}</h1>
            <p className="text-sm">Medical Prescription</p>
          </div>

          <div className="flex justify-between mb-6">
            <div>
              <p className="text-sm"><strong>Rx Code:</strong> {prescription.rx_code}</p>
              <p className="text-sm"><strong>Patient:</strong> {prescription.patient_name}</p>
            </div>
            <div className="text-right">
              <p className="text-sm"><strong>Date:</strong> {format(new Date(prescription.issue_date), "dd/MM/yyyy")}</p>
              <p className="text-sm"><strong>Valid Until:</strong> {format(new Date(prescription.valid_until), "dd/MM/yyyy")}</p>
              <p className="text-sm"><strong>Doctor:</strong> {prescription.doctor_name}</p>
            </div>
          </div>

          {prescription.diagnosis && (
            <div className="mb-4">
              <p className="text-sm font-bold underline">Diagnosis:</p>
              <p className="text-sm">{prescription.diagnosis}</p>
            </div>
          )}

          <div className="mb-6">
            <p className="text-sm font-bold underline mb-2">Medications:</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black">
                  <th className="text-left py-1">#</th>
                  <th className="text-left py-1">Medicine</th>
                  <th className="text-left py-1">Dosage</th>
                  <th className="text-left py-1">Frequency</th>
                  <th className="text-left py-1">Duration</th>
                </tr>
              </thead>
              <tbody>
                {prescription.drugs.map((drug, idx) => (
                  <tr key={drug.id} className="border-b border-gray-200">
                    <td className="py-2">{idx + 1}.</td>
                    <td className="py-2 font-bold">{drug.drug_name}</td>
                    <td className="py-2">{drug.dosage}</td>
                    <td className="py-2">{drug.frequency}</td>
                    <td className="py-2">{drug.duration_days} days</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {prescription.notes && (
            <div className="mb-6">
              <p className="text-sm font-bold underline">Instructions:</p>
              <p className="text-sm">{prescription.notes}</p>
            </div>
          )}

          <div className="mt-12 pt-8 border-t border-black">
            <div className="flex justify-between">
              <div>
                <p className="text-sm">Doctor's Signature</p>
              </div>
              <div className="text-right">
                <p className="text-sm">Reg. No: _________</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
