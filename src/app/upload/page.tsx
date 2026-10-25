import { redirect } from "next/navigation";

// Upload Excel now lives inside New booking.
export default function UploadExcel() {
  redirect("/new?tab=excel");
}
