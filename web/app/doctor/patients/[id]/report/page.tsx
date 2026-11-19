import type { Metadata } from "next";
import { PatientReport } from "@/components/doctor/patient-report";
import { load } from "@/lib/server-api";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const id = Number((await params).id);
  const d = await load((api) => api.GET("/api/patients/{patient_id}", { params: { path: { patient_id: id } } }));
  return { title: `Report, ${d.name}` };
}

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const p = { params: { path: { patient_id: id } } };
  const [d, progress] = await Promise.all([
    load((api) => api.GET("/api/patients/{patient_id}", p)),
    load((api) => api.GET("/api/patients/{patient_id}/progress", p)),
  ]);
  return <PatientReport id={id} d={d} progress={progress} />;
}
