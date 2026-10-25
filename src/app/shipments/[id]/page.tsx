import { ShipmentView } from "@/components/ShipmentView";

export default async function ShipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ShipmentView id={id} />;
}
