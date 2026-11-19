import { SessionView } from "@/components/doctor/session-view";
import { load, loadOptional } from "@/lib/server-api";

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const p = { params: { path: { session_id: id } } };
  const [d, trace] = await Promise.all([
    load((api) => api.GET("/api/sessions/{session_id}", p)),
    loadOptional((api) => api.GET("/api/sessions/{session_id}/trace", p)),
  ]);
  const patient = await loadOptional((api) => api.GET("/api/patients/{patient_id}", { params: { path: { patient_id: d.patient_id } } }));
  return <SessionView d={d} trace={trace} patientName={patient?.name} />;
}
