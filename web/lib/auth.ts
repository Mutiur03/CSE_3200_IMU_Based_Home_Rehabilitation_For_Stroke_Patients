"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api, unwrap, type Role, type User } from "./api";

export const HOME: Record<Role, string> = { patient: "/patient", doctor: "/doctor", admin: "/admin" };

/** Current user, or null when not logged in (401). */
export function useMe() {
  return useQuery<User | null>({
    queryKey: ["me"],
    queryFn: async () => {
      const { data, response } = await api.GET("/api/auth/me");
      if (response.status === 401) return null;
      if (!data) throw new Error(`HTTP ${response.status}`);
      return data;
    },
    retry: false,
  });
}

export function useLogout() {
  const qc = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: async () => {
      await api.POST("/api/auth/logout");
    },
    onSettled: () => {
      qc.clear();
      router.replace("/login");
    },
  });
}

/** Guard: 401 -> /login, wrong role -> own home. Returns the user only once allowed. */
export function useRequireRole(role: Role) {
  const router = useRouter();
  const q = useMe();
  const me = q.data;
  useEffect(() => {
    if (q.isPending || q.isError) return;
    if (!me) router.replace("/login");
    else if (me.role !== role) router.replace(HOME[me.role]);
  }, [q.isPending, q.isError, me, role, router]);
  return { me: me && me.role === role ? me : null, isError: q.isError, refetch: q.refetch };
}

export { unwrap };
