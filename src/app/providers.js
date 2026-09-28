"use client";

import { SessionProvider } from "next-auth/react";
import { useEffect } from "react";
import publicConfig from "@/lib/config.public";

export function Providers({ children }) {
  useEffect(() => {
    if (typeof window !== "undefined") {
      const theme = publicConfig?.theme || "slate-indigo";
      document.documentElement.setAttribute("data-theme", theme);
    }
  }, []);

  return (
    <SessionProvider>
      {children}
    </SessionProvider>
  );
}
