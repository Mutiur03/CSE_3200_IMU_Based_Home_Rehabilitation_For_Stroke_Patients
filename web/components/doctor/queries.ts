"use client";
import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api";

const pid = (patient_id: number) => ({ params: { path: { patient_id } } });
const sid = (session_id: number) => ({ params: { path: { session_id } } });

export const usePatients = () =>
  useQuery({ queryKey: ["doctor", "patients"], queryFn: () => unwrap(api.GET("/api/patients")) });
export const usePatient = (id: number) =>
  useQuery({ queryKey: ["doctor", "patient", id], queryFn: () => unwrap(api.GET("/api/patients/{patient_id}", pid(id))) });
export const useProgress = (id: number) =>
  useQuery({ queryKey: ["doctor", "progress", id], queryFn: () => unwrap(api.GET("/api/patients/{patient_id}/progress", pid(id))) });
export const useSessions = (id: number) =>
  useQuery({ queryKey: ["doctor", "sessions", id], queryFn: () => unwrap(api.GET("/api/patients/{patient_id}/sessions", pid(id))) });
export const useAssessments = (id: number) =>
  useQuery({ queryKey: ["doctor", "assessments", id], queryFn: () => unwrap(api.GET("/api/patients/{patient_id}/assessments", pid(id))) });
export const useMessages = (id: number) =>
  useQuery({ queryKey: ["doctor", "messages", id], queryFn: () => unwrap(api.GET("/api/patients/{patient_id}/messages", pid(id))) });
export const useSession = (id: number) =>
  useQuery({ queryKey: ["doctor", "session", id], queryFn: () => unwrap(api.GET("/api/sessions/{session_id}", sid(id))) });
/** null = no trace stored for this session (404). */
export const useTrace = (id: number) =>
  useQuery({
    queryKey: ["doctor", "trace", id],
    queryFn: async () => {
      const r = await api.GET("/api/sessions/{session_id}/trace", sid(id));
      if (r.response.status === 404) return null;
      return unwrap(Promise.resolve(r));
    },
  });
