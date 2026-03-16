"use client";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAppStore } from "@/store";

const PUBLIC_PATHS = ["/login", "/api/auth"];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  Admin: ["/dashboard", "/patients", "/appointments", "/prescriptions", "/lab", "/wards", "/staff", "/pharmacy", "/billing", "/insurance", "/analytics", "/audit", "/settings"],
  Doctor: ["/dashboard", "/patients", "/appointments", "/prescriptions", "/lab", "/wards"],
  Nurse: ["/dashboard", "/patients", "/wards", "/lab"],
  Receptionist: ["/dashboard", "/patients", "/appointments", "/billing"],
  Pharmacist: ["/dashboard", "/pharmacy", "/prescriptions"],
  Accountant: ["/dashboard", "/billing", "/insurance", "/analytics"],
};

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, authUser } = useAppStore();

  useEffect(() => {
    const isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p));
    
    if (!isPublic && !isAuthenticated) {
      router.replace("/login");
    }
    
    if (pathname === "/login" && isAuthenticated) {
      router.replace("/dashboard");
    }

    // Role-based access control
    if (isAuthenticated && authUser?.role) {
      const allowedPaths = ROLE_PERMISSIONS[authUser.role] || [];
      const hasAccess = allowedPaths.some(p => pathname.startsWith(p) || pathname === p);
      
      if (!hasAccess && pathname !== "/dashboard") {
        // Redirect to dashboard if no access
        router.replace("/dashboard");
      }
    }
  }, [isAuthenticated, pathname, router, authUser]);

  if (!isAuthenticated && !PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="text-muted">Loading...</div>
      </div>
    );
  }

  return <>{children}</>;
}
