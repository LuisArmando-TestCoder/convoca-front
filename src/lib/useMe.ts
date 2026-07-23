"use client";

// Loads the current session (org + role). Redirects to /login on 401 or when no
// token is present. Used by the dashboard layout to guard every nested page.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, clearToken, getToken } from "@/lib/api";
import type { Me } from "@/lib/types";

export function useMe() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    api<Me>("/api/me")
      .then(setMe)
      .catch((err) => {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          clearToken();
          router.replace("/login");
        }
      })
      .finally(() => setLoading(false));
  }, [router]);

  return { me, loading };
}
