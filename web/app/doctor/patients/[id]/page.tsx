import { PatientView } from "@/components/doctor/patient-view";
import { load } from "@/lib/server-api";

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const p = { params: { path: { patient_id: id } } };
  const [d, progress, sessions, assessments, messages] = await Promise.all([
    load((api) => api.GET("/api/patients/{patient_id}", p)),
    load((api) => api.GET("/api/patients/{patient_id}/progress", p)),
    load((api) => api.GET("/api/patients/{patient_id}/sessions", p)),
    load((api) => api.GET("/api/patients/{patient_id}/assessments", p)),
    load((api) => api.GET("/api/patients/{patient_id}/messages", p)),
  ]);
  return <PatientView id={id} d={d} progress={progress} sessions={sessions} assessments={assessments} messages={messages} />;
}
