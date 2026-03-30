"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // 2 minutes — navigating back to any dashboard page shows
            // cached data instantly instead of triggering a loading state
            staleTime: 2 * 60 * 1000,
            // Keep data in memory for 5 minutes after the component unmounts
            gcTime: 5 * 60 * 1000,
            // Don't refetch just because the user switched browser tabs
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
