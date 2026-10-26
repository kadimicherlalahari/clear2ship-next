import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export type HeroStat = { label: string; value: number | string; tone?: "red" | "amber" | "orange"; href?: string };

// Big stat numbers count as large text, so the brighter orange (≥3:1) keeps "act now" distinct from RED.
const TONE: Record<string, string> = { red: "text-red-700", amber: "text-amber-700", orange: "text-sky-600" };

/**
 * Banner at the top of each role's home page: a big headline whose last phrase is orange,
 * one sentence, an optional action, a scene, a handwritten note, and a strip of live counts.
 */
const NOTE_AT = {
  "top-left": "left-5 top-3 sm:left-8",
  "top-right": "right-5 top-3 sm:right-8",
  "bottom-left": "bottom-5 left-5 sm:left-8",
  "bottom-right": "bottom-5 right-5 sm:right-8",
};

export function RoleHero({ lead, accent, sentence, note, noteAt = "top-left", scene, stats, actions }: {
  lead: string; accent: string; sentence: string; note: string; noteAt?: keyof typeof NOTE_AT; scene: ReactNode; stats: HeroStat[]; actions?: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white shadow-sm">
      <div className="grid items-center gap-2 md:grid-cols-[1.05fr_1fr]">
        <div className="px-6 pb-2 pt-8 sm:px-10 sm:pt-10">
          <h1 className="text-[2.5rem] sm:text-5xl lg:text-[3.6rem]">
            <span className="block">{lead}</span>
            <span className="block text-sky-600">{accent}</span>
          </h1>
          <p className="mt-4 max-w-md text-base text-slate-600">{sentence}</p>
          {actions && <div className="mt-6 flex flex-wrap gap-2">{actions}</div>}
        </div>
        <div className="relative -mb-2 px-4 sm:px-6">
          {scene}
          <p className={`hand pointer-events-none absolute hidden ${NOTE_AT[noteAt]} rotate-[-6deg] text-2xl text-sky-700 sm:block sm:text-[1.7rem]`} aria-hidden>
            {note}
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-2 border-t border-slate-200/80 sm:flex sm:flex-wrap">
        {stats.map((s, i) => (
          <div key={s.label} className={`px-6 py-4 sm:flex-1 sm:px-8 ${i > 0 ? "sm:border-l sm:border-slate-200/80" : ""} ${i % 2 ? "border-l border-slate-200/80 sm:border-l" : ""} ${i > 1 ? "border-t border-slate-200/80 sm:border-t-0" : ""}`}>
            <dd className={`text-3xl font-extrabold tabular-nums [font-stretch:115%] ${s.tone ? TONE[s.tone] : "text-slate-900"}`}>
              {s.href ? (
                <Link href={s.href} aria-label={`${s.value} ${s.label}: show them`} className="group inline-flex items-center gap-1.5 rounded-lg decoration-2 underline-offset-4 hover:underline">
                  {s.value}
                  <ArrowRight aria-hidden className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
                </Link>
              ) : s.value}
            </dd>
            <dt className="mt-0.5 text-xs font-medium text-slate-500">{s.label}</dt>
          </div>
        ))}
      </dl>
    </section>
  );
}
