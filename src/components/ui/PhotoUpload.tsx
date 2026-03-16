"use client";
import { useState, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";

interface PhotoUploadProps {
  value?: string;
  onChange: (path: string) => void;
}

export function PatientPhotoUpload({ value, onChange }: PhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSelect = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "gif", "webp"] }],
      });

      if (selected) {
        onChange(selected as string);
      }
    } catch (err) {
      console.error("Failed to select file:", err);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <div className="w-20 h-20 rounded-full bg-surface2 border border-border overflow-hidden flex items-center justify-center">
        {value ? (
          <img src={`file://${value}`} alt="Patient" className="w-full h-full object-cover" />
        ) : (
          <div className="text-muted text-xs text-center">No Photo</div>
        )}
      </div>
      <div>
        <button onClick={handleSelect} disabled={uploading} className="btn btn-ghost btn-sm">
          {uploading ? "Uploading..." : value ? "Change Photo" : "Upload Photo"}
        </button>
        <p className="text-xs text-subtle mt-1">JPG, PNG, GIF (max 2MB)</p>
      </div>
    </div>
  );
}
