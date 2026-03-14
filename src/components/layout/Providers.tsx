"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
  }));
  return (
    <QueryClientProvider client={qc}>
      {children}
      <Toaster
        position="bottom-right"
        toastOptions={{ style: {
          background: "#161d2a", border: "1px solid #1f2d42",
          color: "#e8f0fe", fontFamily: "DM Sans,sans-serif", fontSize: "13px",
        }}}
      />
    </QueryClientProvider>
  );
}
