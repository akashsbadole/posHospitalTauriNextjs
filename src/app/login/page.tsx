"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/store";
import { loginUser, createUser } from "@/lib/tauri";
import { Activity, Lock, User, Eye, EyeOff, Shield, Stethoscope, Users, FlaskConical, Wallet } from "lucide-react";

const DEMO_USERS = [
  { username: "admin", password: "admin123", role: "Admin", label: "Administrator", icon: Shield },
  { username: "doctor", password: "doctor123", role: "Doctor", label: "Dr. Smith", icon: Stethoscope },
  { username: "reception", password: "reception123", role: "Receptionist", label: "Receptionist", icon: Users },
  { username: "pharmacist", password: "pharma123", role: "Pharmacist", label: "Pharmacist", icon: FlaskConical },
  { username: "accountant", password: "account123", role: "Accountant", label: "Accountant", icon: Wallet },
];

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { setAuthUser, setIsAuthenticated } = useAppStore();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const user = await loginUser(username, password);
      setAuthUser(user);
      setIsAuthenticated(true);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err) || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  }

  async function handleDemoLogin(username: string) {
    const userDef = DEMO_USERS.find(u => u.username === username);
    if (!userDef) return;

    setLoading(true);
    try {
      const user = await loginUser(userDef.username, userDef.password);
      setAuthUser(user);
      setIsAuthenticated(true);
      router.push("/dashboard");
    } catch {
      setError("Demo login failed. Please use the form below.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-accent/5 via-bg to-bg" />
      
      <div className="relative w-full max-w-md">
        <div className="bg-surface border border-border rounded-2xl p-8 shadow-card">
          <div className="flex flex-col items-center mb-6">
            <div className="w-16 h-16 bg-accent/10 rounded-2xl flex items-center justify-center mb-4">
              <Activity size={32} className="text-accent" />
            </div>
            <h1 className="font-display font-bold text-2xl text-white">MediCore HMS</h1>
            <p className="text-sm text-muted mt-1">Hospital Management System</p>
          </div>

          <div className="mb-6">
            <p className="text-xs text-muted mb-3 text-center">Quick Login (Demo)</p>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_USERS.map((user) => {
                const Icon = user.icon;
                return (
                  <button
                    key={user.role}
                    onClick={() => handleDemoLogin(user.username)}
                    disabled={loading}
                    className="flex items-center gap-2 px-3 py-2 bg-surface2 border border-border rounded-lg text-xs text-muted hover:bg-surface3 hover:text-white transition-all"
                  >
                    <Icon size={14} />
                    <span className="truncate">{user.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="relative">
            <div className="absolute left-0 right-0 top-1/2 border-t border-border"></div>
            <div className="relative flex justify-center">
              <span className="bg-surface px-3 text-xs text-muted">or sign in with credentials</span>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-5 mt-6">
            <div>
              <label className="form-label">Username</label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  className="w-full pl-10"
                  required
                />
              </div>
            </div>

            <div>
              <label className="form-label">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-10 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-subtle hover:text-white"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-danger/10 border border-danger/20 rounded-lg px-4 py-2 text-sm text-danger">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full btn btn-primary py-3 text-sm"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <p className="text-center text-xs text-muted mt-6">
            MediCore HMS v1.0.0 • Secure Login
          </p>
        </div>
      </div>
    </div>
  );
}