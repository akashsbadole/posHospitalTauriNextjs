"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Doctor, DashboardStats } from "@/types";

interface Notification {
  id: string; type: "info"|"success"|"warning"|"error";
  title: string; message: string; timestamp: string; read: boolean;
}

interface AppState {
  currentUser: Doctor | null;
  setCurrentUser: (u: Doctor | null) => void;
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
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      currentUser: null,
      setCurrentUser: (u) => set({ currentUser: u }),
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
    }),
    {
      name: "medicore-store",
      partialize: (s) => ({ currentUser: s.currentUser, sidebarCollapsed: s.sidebarCollapsed, lastSync: s.lastSync }),
    }
  )
);
