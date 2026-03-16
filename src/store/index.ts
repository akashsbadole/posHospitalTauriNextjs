"use client";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Doctor, DashboardStats, User } from "@/types";

interface Notification {
  id: string; type: "info"|"success"|"warning"|"error";
  title: string; message: string; timestamp: string; read: boolean;
}

interface AppState {
  currentUser: User | null;
  setCurrentUser: (u: User | null) => void;
  authUser: User | null;
  setAuthUser: (u: User | null) => void;
  isAuthenticated: boolean;
  setIsAuthenticated: (v: boolean) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  activeModule: string;
  setActiveModule: (m: string) => void;
  dashboardStats: DashboardStats | null;
  setDashboardStats: (s: DashboardStats) => void;
  notifications: Notification[];
  addNotification: (n: Notification) => void;
  clearNotification: (id: string) => void;
  clearAll: () => void;
  lastSync: string | null;
  setLastSync: (t: string) => void;
  pendingSyncCount: number;
  setPendingSyncCount: (n: number) => void;
  hydrated: boolean;
  setHydrated: (v: boolean) => void;
}

const storage = {
  getItem: (name: string): string | null => {
    if (typeof window === 'undefined') return null;
    try {
      return localStorage.getItem(name);
    } catch { return null; }
  },
  setItem: (name: string, value: string): void => {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(name, value); } catch {}
  },
  removeItem: (name: string): void => {
    if (typeof window === 'undefined') return;
    try { localStorage.removeItem(name); } catch {}
  },
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      currentUser: null,
      setCurrentUser: (u) => set({ currentUser: u }),
      authUser: null,
      setAuthUser: (u) => set({ authUser: u }),
      isAuthenticated: false,
      setIsAuthenticated: (v) => set({ isAuthenticated: v }),
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      activeModule: "dashboard",
      setActiveModule: (m) => set({ activeModule: m }),
      dashboardStats: null,
      setDashboardStats: (s) => set({ dashboardStats: s }),
      notifications: [],
      addNotification: (n) => set((s) => ({ notifications: [n, ...s.notifications].slice(0, 50) })),
      clearNotification: (id) => set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),
      clearAll: () => set({ notifications: [] }),
      lastSync: null,
      setLastSync: (t) => set({ lastSync: t }),
      pendingSyncCount: 0,
      setPendingSyncCount: (n) => set({ pendingSyncCount: n }),
      hydrated: false,
      setHydrated: (v) => set({ hydrated: v }),
    }),
    {
      name: "medicore-store",
      storage: createJSONStorage(() => storage),
      partialize: (s) => ({ 
        authUser: s.authUser, 
        isAuthenticated: s.isAuthenticated, 
        sidebarCollapsed: s.sidebarCollapsed, 
        lastSync: s.lastSync 
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    }
  )
);
