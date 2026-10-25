"use client";
import type { CarrierResult, Issue, Overall } from "@/lib/rules/types";
import { Button, LevelBadge, ROLE_LABEL } from "./ui";

const money = (n: number) => `£${n.toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;

export function IssueList({ issues, onApply, busy }: { issues: Issue[]; onApply?: (s: NonNullable<Issue["suggestion"]>) => void; busy?: boolean }) {
  if (!issues.length) return null;
  return (
    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
      {issues.map((i) => (
        <li key={i.key} className="flex flex-wrap items-start gap-3 px-3 py-2.5 text-sm">
          <div className="flex w-28 shrink-0 items-center gap-1.5">
            <LevelBadge level={i.kind} />
            <span className="font-mono text-xs text-slate-500">{i.code === "INPUT" ? "" : i.code}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-slate-900">{i.message}</p>
            <p className="text-slate-600"><span className="font-medium">How to fix:</span> {i.fix}</p>
            <p className="text-xs text-slate-500">Who should fix it: {ROLE_LABEL[i.owner] ?? i.owner}</p>
          </div>
          {i.suggestion && onApply && (
            <Button variant="secondary" disabled={busy} onClick={() => onApply(i.suggestion!)}>{i.suggestion.label}</Button>
          )}
        </li>
      ))}
    </ul>
  );
}

const OVERALL_STYLE: Record<Overall, string> = {
  RED: "border-red-300 bg-red-50 text-red-900",
  AMBER: "border-amber-300 bg-amber-50 text-amber-950",
  GREEN: "border-green-300 bg-green-50 text-green-900",
};

export function Headline({ overall, headline }: { overall: Overall; headline: string }) {
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium ${OVERALL_STYLE[overall]}`}>
      <LevelBadge level={overall} /> <span>{headline}</span>
    </div>
  );
}

export function CarrierCard({ carrier }: { carrier: CarrierResult | null }) {
  if (!carrier) return null;
  const p = carrier.pick;
  return (
    <div className="rounded-lg border border-slate-200 p-3 text-sm">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Carrier recommendation · {carrier.weightPerPallet.toLocaleString("en-GB")} kg per pallet · priority: {carrier.priorityUsed}
      </p>
      {p ? (
        <>
          <p className="text-base font-semibold">{p.name} <span className="font-normal text-slate-600">({p.service})</span></p>
          <p className="text-slate-700">{money(p.price)} · {p.transitDays} days · {p.onTimePct}% on time</p>
          <p className="mt-1 text-slate-600">{carrier.reason}</p>
        </>
      ) : (
        <p className="font-medium text-red-800">{carrier.reason}</p>
      )}
      {carrier.alternatives.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-medium text-slate-500">Other options</p>
          <ul className="text-slate-600">
            {carrier.alternatives.map((a) => (
              <li key={a.name}>{a.name}: {money(a.price)}, {a.transitDays} days, {a.onTimePct}% on time{a.score !== undefined && carrier.priorityUsed === "Balanced" ? ` (score ${a.score})` : ""}</li>
            ))}
          </ul>
        </div>
      )}
      {carrier.removed.length > 0 && (
        <ul className="mt-2 text-xs text-slate-500">{carrier.removed.map((r) => <li key={r}>{r}</li>)}</ul>
      )}
      {p && carrier.priorityUsed === "Balanced" && p.score !== undefined && (
        <p className="mt-1 text-xs text-slate-500">Balanced score {p.score} (40% cost, 30% speed, 30% reliability).</p>
      )}
    </div>
  );
}

export type CheckLike = {
  overall: Overall; headline: string; issues: Issue[]; notes: string[]; carrier: CarrierResult | null; disclaimer: string;
  docIssues?: Issue[];
};

export function CheckView({ check, onApply, busy }: { check: CheckLike; onApply?: (s: NonNullable<Issue["suggestion"]>) => void; busy?: boolean }) {
  return (
    <div className="space-y-3">
      {check.docIssues && <h3 className="text-sm font-semibold">Booking checks (R-01 to R-10)</h3>}
      <Headline overall={check.overall} headline={check.headline} />
      <IssueList issues={check.issues} onApply={onApply} busy={busy} />
      {check.notes.map((n) => <p key={n} className="text-sm font-medium text-slate-700">Note: {n}</p>)}
      <CarrierCard carrier={check.carrier} />
      {check.docIssues && (
        <div>
          <h3 className="mb-1 text-sm font-semibold">Document checks (D-01 to D-05)</h3>
          {check.docIssues.length > 0
            ? <IssueList issues={check.docIssues} />
            : <p className="text-sm text-green-800">Invoice and packing list are uploaded, confirmed and match the booking.</p>}
        </div>
      )}
      <p className="text-xs text-slate-500">{check.disclaimer}</p>
    </div>
  );
}
