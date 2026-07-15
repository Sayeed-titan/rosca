"use client";

/**
 * Client-side providers.
 *
 * React Query is scoped to interactive tables (pagination/filter/sort) and
 * optimistic updates. Initial page data still comes from Server Components — using
 * React Query for everything would mean fetching the same rows twice and keeping
 * two caches honest with each other.
 */
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }) {
  // Created in state, not at module scope: a module-level client would be shared
  // across requests on the server and leak one user's data into another's cache.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
