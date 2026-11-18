import { PatientReport } from "@/components/doctor/patient-report";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PatientReport id={Number(id)} />;
}
