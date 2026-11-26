import type { Metadata } from "next";
import { PatientView } from "@/components/doctor/patient-view";
import { load } from "@/lib/server-api";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const id = Number((await params).id);
  const d = await load((api) => api.GET("/api/patients/{patient_id}", { params: { path: { patient_id: id } } }));
  return { title: d.name };
}

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const p = { params: { path: { patient_id: id } } };
  const [d, progress, report, assessments, messages] = await Promise.all([
    load((api) => api.GET("/api/patients/{patient_id}", p)),
    load((api) => api.GET("/api/patients/{patient_id}/progress", p)),
    load((api) => api.GET("/api/patients/{patient_id}/report", p)),
    load((api) => api.GET("/api/patients/{patient_id}/assessments", p)),
    load((api) => api.GET("/api/patients/{patient_id}/messages", p)),
  ]);
  return <PatientView id={id} d={d} progress={progress} report={report} assessments={assessments} messages={messages} />;
}
