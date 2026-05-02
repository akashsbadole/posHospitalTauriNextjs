import type { Metadata } from "next";
import "./globals.css";
import { ClientLayout } from "@/components/layout/ClientLayout";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";

export const metadata: Metadata = {
  title: "MediCore HMS",
  description: "Hospital & Clinic Management System",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ErrorBoundary>
          <ClientLayout>{children}</ClientLayout>
        </ErrorBoundary>
      </body>
    </html>
  );
}
