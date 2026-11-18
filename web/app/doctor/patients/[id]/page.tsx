import { PatientView } from "@/components/doctor/patient-view";

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PatientView id={Number(id)} />;
}
