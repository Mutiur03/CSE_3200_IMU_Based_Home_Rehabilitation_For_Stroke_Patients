import type { Metadata } from "next";
import { PatientList } from "@/components/doctor/patient-list";
import { load } from "@/lib/server-api";

export const metadata: Metadata = { title: "Patients" };

export default async function DoctorHome() {
  const patients = await load((api) => api.GET("/api/patients"));
  return <PatientList patients={patients} />;
}
