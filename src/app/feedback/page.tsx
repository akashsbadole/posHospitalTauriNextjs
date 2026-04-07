"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getFeedback, createFeedback, getPatients } from "@/lib/tauri";
import { toast } from "sonner";
import { Star, MessageSquare, Plus, User, Search, Filter, X } from "lucide-react";

export default function FeedbackPage() {
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [ratingFilter, setRatingFilter] = useState<number | null>(null);
  const qc = useQueryClient();

  const { data: feedback = [], isLoading } = useQuery({
    queryKey: ["feedback"],
    queryFn: () => getFeedback(),
  });

  const { data: patients = [] } = useQuery({
    queryKey: ["patients"],
    queryFn: () => getPatients(),
  });

  const createMut = useMutation({
    mutationFn: createFeedback,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["feedback"] });
      toast.success("Feedback submitted!");
      setShowAdd(false);
    },
    onError: () => toast.error("Failed to submit feedback"),
  });

  const filtered = feedback.filter(f => {
    const matchesSearch = !search || f.patient_name?.toLowerCase().includes(search.toLowerCase()) || f.comments.toLowerCase().includes(search.toLowerCase());
    const matchesRating = !ratingFilter || f.rating === ratingFilter;
    return matchesSearch && matchesRating;
  });

  const avgRating = feedback.length > 0 ? (feedback.reduce((s, f) => s + f.rating, 0) / feedback.length).toFixed(1) : "0.0";

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Patient Feedback</h1>
          <p className="page-subtitle">Manage and monitor patient satisfaction</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn btn-primary">
          <Plus size={16} /> Submit Feedback
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3.5 mb-5">
        <div className="stat-card anim-fade-up d1">
          <div className="stat-value text-accent">{feedback.length}</div>
          <div className="stat-label">Total Responses</div>
        </div>
        <div className="stat-card anim-fade-up d2">
          <div className="stat-value text-success flex items-center gap-2">
            {avgRating} <Star size={20} fill="currentColor" />
          </div>
          <div className="stat-label">Average Rating</div>
        </div>
        <div className="stat-card anim-fade-up d3">
          <div className="stat-value text-warning">{feedback.filter(f => f.rating >= 4).length}</div>
          <div className="stat-label">Happy Patients</div>
        </div>
        <div className="stat-card anim-fade-up d4">
          <div className="stat-value text-danger">{feedback.filter(f => f.rating <= 2).length}</div>
          <div className="stat-label">Issues Flagged</div>
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search feedback..." className="pl-9" />
        </div>
        <select value={ratingFilter || ""} onChange={e => setRatingFilter(e.target.value ? parseInt(e.target.value) : null)} className="w-40">
          <option value="">All Ratings</option>
          {[5, 4, 3, 2, 1].map(r => <option key={r} value={r}>{r} Stars</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? <div className="col-span-full py-12 text-center text-muted">Loading...</div> :
         filtered.map(f => (
          <div key={f.id} className="card p-5 flex flex-col gap-3">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-accent">
                  <User size={14} />
                </div>
                <div>
                  <div className="text-sm font-bold text-white">{f.patient_name || "Anonymous"}</div>
                  <div className="text-[10px] text-subtle">{f.created_at}</div>
                </div>
              </div>
              <div className="flex text-warning">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} size={12} fill={i < f.rating ? "currentColor" : "none"} />
                ))}
              </div>
            </div>
            <div className="text-xs text-accent font-medium uppercase tracking-wider">{f.department || "General"}</div>
            <p className="text-[13px] text-muted italic leading-relaxed">"{f.comments}"</p>
          </div>
        ))}
        {filtered.length === 0 && !isLoading && <div className="col-span-full py-12 text-center text-muted border-2 border-dashed border-border rounded-2xl">No feedback found</div>}
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center anim-fade-in">
          <div className="bg-surface border border-border2 rounded-2xl w-[450px] shadow-card">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h2 className="font-display font-bold text-base">Submit Patient Feedback</h2>
              <button onClick={() => setShowAdd(false)} className="text-subtle hover:text-white"><X size={18} /></button>
            </div>
            <form onSubmit={e => {
              e.preventDefault();
              const f = e.target as HTMLFormElement;
              createMut.mutate({
                patient_id: parseInt((f.elements.namedItem("patient_id") as HTMLSelectElement).value) || undefined,
                rating: parseInt((f.elements.namedItem("rating") as HTMLSelectElement).value),
                comments: (f.elements.namedItem("comments") as HTMLTextAreaElement).value,
                department: (f.elements.namedItem("department") as HTMLInputElement).value || undefined,
              });
            }} className="p-6 space-y-4">
              <div><label className="form-label">Patient (optional)</label>
                <select name="patient_id" className="select"><option value="">Anonymous</option>{patients.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select>
              </div>
              <div><label className="form-label">Department</label><input name="department" className="input" placeholder="e.g., Cardiology" /></div>
              <div><label className="form-label">Rating *</label>
                <select name="rating" required className="select"><option value="5">5 - Excellent</option><option value="4">4 - Good</option><option value="3">3 - Average</option><option value="2">2 - Poor</option><option value="1">1 - Very Poor</option></select>
              </div>
              <div><label className="form-label">Comments *</label><textarea name="comments" required className="textarea h-24" /></div>
              <div className="flex gap-3 justify-end pt-4">
                <button type="button" onClick={() => setShowAdd(false)} className="btn btn-ghost">Cancel</button>
                <button type="submit" disabled={createMut.isPending} className="btn btn-primary">Submit Feedback</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
