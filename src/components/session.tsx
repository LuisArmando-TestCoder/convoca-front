"use client";

import { createContext, useContext } from "react";
import type { Me } from "@/lib/types";

export const MeContext = createContext<Me | null>(null);

/** Reads the authenticated session provided by the dashboard layout. */
export function useSession(): Me {
  const me = useContext(MeContext);
  if (!me) throw new Error("useSession must be used within the dashboard layout.");
  return me;
}
