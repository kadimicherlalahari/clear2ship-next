"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BookingForm, toFormValues } from "@/components/BookingForm";
import { Chat } from "@/components/Chat";
import { ExcelUpload } from "@/components/ExcelUpload";
import { useRole } from "@/components/RoleSwitcher";
import { postJson } from "@/components/ui";

const TABS = [
  { id: "chat", label: "Chat" },
  { id: "form", label: "Form" },
  { id: "excel", label: "Upload Excel" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default function NewBooking() {
  const [tab, setTab] = useState<Tab>("chat");
  const router = useRouter();
  const role = useRole();

  // New bookings are for sellers: other roles go to their dashboard.
  useEffect(() => {
    if (role !== "seller" && role !== "admin") { router.replace("/"); router.refresh(); }
  }, [role, router]);

  // Open a tab from the link, e.g. /new?tab=excel
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (TABS.some((x) => x.id === t)) setTab(t as Tab);
  }, []);
  const choose = (t: Tab) => {
    setTab(t);
    window.history.replaceState(null, "", t === "chat" ? "/new" : `/new?tab=${t}`);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">New booking</h1>
        <p className="text-sm text-slate-600">Describe the shipment in chat, fill in the form, or upload several bookings from Excel.</p>
      </div>
      <div role="tablist" aria-label="How to add the booking" className="inline-flex rounded-lg bg-slate-200 p-1 text-sm">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => choose(t.id)}
            className={`rounded-md px-3 py-1 font-medium ${tab === t.id ? "bg-white shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "chat" && <Chat />}
      {tab === "form" && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <BookingForm initial={toFormValues(null)} submitLabel="Create booking and check" onSubmit={async (booking, email) => {
            const r = await postJson<{ id: string }>("/api/shipments", { booking, seller_email: email });
            router.push(`/shipments/${r.id}`);
          }} />
        </div>
      )}
      {tab === "excel" && <ExcelUpload />}
    </div>
  );
}
