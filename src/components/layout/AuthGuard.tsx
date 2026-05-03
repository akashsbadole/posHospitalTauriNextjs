"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAppStore } from "@/store";

const PUBLIC_PATHS = ["/login", "/api/auth"];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  Admin: ["/dashboard", "/patients", "/appointments", "/prescriptions", "/lab", "/wards", "/staff", "/pharmacy", "/billing", "/insurance", "/analytics", "/audit", "/settings", "/ot", "/emergency", "/blood-bank", "/ambulance", "/expenses", "/hr", "/assets", "/revenue", "/discharge", "/opd-queue", "/messages", "/feedback", "/support"],
  Doctor: ["/dashboard", "/patients", "/appointments", "/prescriptions", "/lab", "/wards", "/ot", "/emergency", "/discharge", "/opd-queue", "/feedback"],
  Nurse: ["/dashboard", "/patients", "/wards", "/lab"],
  Receptionist: ["/dashboard", "/patients", "/appointments", "/billing"],
  Pharmacist: ["/dashboard", "/pharmacy", "/prescriptions"],
  Accountant: ["/dashboard", "/billing", "/insurance", "/analytics"],
};

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, authUser, hydrated } = useAppStore();
  const [isHydrated, setIsHydrated] = useState(hydrated);

  useEffect(() => {
    setIsHydrated(hydrated);
  }, [hydrated]);

  const isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p));
  
  const hasRoleAccess = useMemo(() => {
    if (!isAuthenticated || !authUser?.role) return false;
    const allowedPaths = ROLE_PERMISSIONS[authUser.role] || [];
    return allowedPaths.some(p => pathname === p || pathname.startsWith(p + "/") || pathname === "/dashboard");
  }, [isAuthenticated, authUser, pathname]);

  // Handle navigation in effect to avoid setState during render
  useEffect(() => {
    if (!isHydrated) return;

    if (!isPublic && !isAuthenticated) {
      router.replace("/login");
    } else if (pathname === "/login" && isAuthenticated) {
      router.replace("/dashboard");
    } else if (isAuthenticated && authUser?.role && !hasRoleAccess && pathname !== "/dashboard") {
      router.replace("/dashboard");
    }
  }, [isHydrated, isPublic, isAuthenticated, pathname, authUser?.role, hasRoleAccess, router]);

  // Don't render anything while hydrating or redirecting
  if (!isHydrated) {
    return null;
  }

  return <>{children}</>;
}