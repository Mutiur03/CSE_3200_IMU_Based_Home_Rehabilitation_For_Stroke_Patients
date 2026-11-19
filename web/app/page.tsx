import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { buttonVariants } from "@/components/ui/button";
import { HeroTrace } from "@/components/landing/hero-trace";
import { ImprovementChart } from "@/components/landing/improvement-chart";
import { Pipeline } from "@/components/landing/pipeline";
import { Simulator } from "@/components/landing/simulator";
import { HOME } from "@/lib/home";
import { getMe } from "@/lib/server-api";

export const metadata: Metadata = {
  title: { absolute: "Arc: home stroke rehabilitation, measured" },
  description: "A wristband, a short game in the browser and a clinician portal. Every rehabilitation rep is measured, scored against the patient's own earlier reps and shown to the doctor.",
};

const wrap = "mx-auto w-full max-w-6xl px-5 md:px-10";

export default async function Landing() {
  // The landing page must work even when the API is down, so a failed lookup just means "not logged in".
  const me = await getMe().catch(() => null);
  const cta = me ? { href: HOME[me.role], label: "Open your dashboard" } : { href: "/login", label: "Log in" };

  return (
    <div className="bg-background text-foreground">
      <div className="bg-rail text-rail-foreground">
        <header className={`${wrap} flex items-center justify-between py-5`}>
          <Link href="/" aria-label="Arc, home" className="flex min-h-11 items-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass"><Wordmark /></Link>
          <nav aria-label="Page" className="flex items-center gap-1 sm:gap-3">
            <a href="#how" className="hidden min-h-11 items-center rounded-lg px-3 text-[0.9375rem] text-rail-muted transition-colors duration-150 hover:text-rail-foreground sm:flex">How it works</a>
            <a href="#try" className="hidden min-h-11 items-center rounded-lg px-3 text-[0.9375rem] text-rail-muted transition-colors duration-150 hover:text-rail-foreground sm:flex">Try the scoring</a>
            <a href="#clinic" className="hidden min-h-11 items-center rounded-lg px-3 text-[0.9375rem] text-rail-muted transition-colors duration-150 hover:text-rail-foreground md:flex">For clinicians</a>
            <Link href={cta.href} className={buttonVariants({ variant: "secondary", size: "lg", className: "h-11 px-5 text-base" })}>
              {cta.label}
            </Link>
          </nav>
        </header>

        <section className={`${wrap} grid items-center gap-12 pb-20 pt-10 md:pb-28 md:pt-16 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16`}>
          <div>
            <h1 className="text-balance font-display text-[2.5rem] leading-[1.06] tracking-tight md:text-[3.75rem]">Home rehabilitation, one counted rep at a time.</h1>
            <p className="mt-6 max-w-[48ch] text-lg leading-relaxed text-rail-muted md:text-xl">
              After a stroke, a patient wears a wristband and plays a short game in the browser. The wristband measures how the forearm moves. The clinic sees each session as numbers, trends and a replay.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link href={cta.href} className="inline-flex h-14 items-center rounded-xl bg-brass px-7 text-base font-medium text-[#1a1305] transition-colors duration-150 hover:bg-[#c99a4a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass">
                {cta.label}
              </Link>
              <a href="#how" className="flex min-h-11 items-center rounded-lg px-1 text-base text-rail-foreground underline decoration-rail-muted underline-offset-4 transition-colors duration-150 hover:decoration-brass">
                See how it works
              </a>
            </div>
            {!me && <p className="mt-5 text-[0.9375rem] text-rail-muted">Accounts are created by your clinic.</p>}
          </div>
          <HeroTrace />
        </section>
      </div>

      <section id="how" className="scroll-mt-4 py-20 md:py-28">
        <div className={wrap}>
          <h2 className="max-w-[22ch] font-display text-[2rem] leading-[1.1] tracking-tight md:text-[3rem]">From the wrist to the clinic, in five steps</h2>
          <p className="mt-4 max-w-[60ch] text-lg leading-relaxed text-muted-foreground">
            One sensor, one Wi-Fi link, one server. Raw readings are saved exactly as they arrive. Everything else, from reps to scores, is worked out from them and stored separately, so any result can be traced back to the signal.
          </p>
          <div className="mt-14">
            <Pipeline />
          </div>
        </div>
      </section>

      <section id="try" className="scroll-mt-4 border-y border-border bg-card py-20 md:py-28">
        <div className={wrap}>
          <h2 className="max-w-[24ch] font-display text-[2rem] leading-[1.1] tracking-tight md:text-[3rem]">How a rep becomes a score</h2>
          <p className="mt-4 max-w-[62ch] text-lg leading-relaxed text-muted-foreground">
            The game decides when a rep is finished. The server then looks at the forearm signal for that rep: how far it turned, how long it took and how many separate bursts of speed it took to get there. Each rep is compared with the patient&apos;s own earlier reps of the same task. No population norms are used.
          </p>
          <div className="mt-12">
            <Simulator />
          </div>
        </div>
      </section>

      <section className="py-20 md:py-28">
        <div className={`${wrap} grid gap-14 lg:grid-cols-[1fr_1fr] lg:gap-20`}>
          <div>
            <h2 className="max-w-[18ch] font-display text-[2rem] leading-[1.1] tracking-tight md:text-[3rem]">What the patient does</h2>
            <ol className="mt-10 grid gap-8">
              {[
                ["Put on the wristband", "It sits on the back of the wrist like a watch, with the chip facing up. It follows the forearm turning and lifting, not the wrist joint."],
                ["Press Start session", "The game opens full screen in the same browser tab. It follows only that patient's wristband."],
                ["Play at a steady pace", "The game rewards controlled movement, not speed. Each finished rep is scored and the next level adapts if the doctor allows it."],
                ["See the result", "At the end, a plain summary shows the number of reps and the mean quality score."],
              ].map(([t, b], i) => (
                <li key={t} className="grid grid-cols-[2.25rem_1fr] gap-x-4">
                  <span aria-hidden="true" className="font-display tnum text-[1.75rem] leading-none text-brass-ink">{i + 1}</span>
                  <div>
                    <h3 className="text-lg font-medium leading-snug">{t}</h3>
                    <p className="mt-1.5 max-w-[46ch] text-base leading-relaxed text-muted-foreground">{b}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="self-center rounded-2xl bg-rail p-8 text-rail-foreground md:p-12">
            <p className="text-base text-rail-muted">Session finished</p>
            <dl className="mt-8 grid gap-8">
              <div>
                <dt className="text-base text-rail-muted">Reps completed</dt>
                <dd className="font-display tnum mt-1 text-[3.5rem] leading-none">18</dd>
              </div>
              <div>
                <dt className="text-base text-rail-muted">Mean movement quality score</dt>
                <dd className="font-display tnum mt-1 text-[3.5rem] leading-none text-brass">82</dd>
              </div>
            </dl>
            <p className="mt-8 text-[0.8125rem] text-rail-muted">Sample values, for illustration.</p>
          </div>
        </div>
      </section>

      <section id="clinic" className="scroll-mt-4 border-t border-border bg-card py-20 md:py-28">
        <div className={wrap}>
          <h2 className="max-w-[24ch] font-display text-[2rem] leading-[1.1] tracking-tight md:text-[3rem]">What the clinician can see and decide</h2>
          <div className="mt-14 grid gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20">
            <ImprovementChart />
            <dl className="grid content-start gap-7">
              {[
                ["Improvement against the patient's own baseline", "The median of the first three sessions is compared with the median of the last three across roll range, pitch range, rep time, speed peaks and quality."],
                ["Marking", "A 1 to 5 rubric for range, smoothness, control, adherence and overall, plus an optional score from a standard scale the doctor gives in person. It is stored and charted, never computed."],
                ["The plan the game follows", "Which levels are allowed, how many reps per level, sessions per week, and whether difficulty adapts."],
                ["Alerts the doctor chooses", "Days without a session and a drop in quality. There are no built-in limits: a rule exists only when the doctor sets it."],
                ["Replay and reports", "Replay the forearm movement of any session, print a report, or export the reps as CSV."],
              ].map(([t, b]) => (
                <div key={t}>
                  <dt className="text-lg font-medium leading-snug">{t}</dt>
                  <dd className="mt-1.5 max-w-[52ch] text-base leading-relaxed text-muted-foreground">{b}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <section className="py-20 md:py-28">
        <div className={`${wrap} grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20`}>
          <h2 className="max-w-[16ch] font-display text-[2rem] leading-[1.1] tracking-tight md:text-[3rem]">What this prototype is, and is not</h2>
          <ul className="grid gap-5 text-lg leading-relaxed">
            {[
              "It uses one sensor on the forearm. It measures how the forearm turns and lifts. It does not detect compensating movements such as leaning the trunk.",
              "Scores compare a patient with their own earlier reps. They are placeholders for a research prototype and are not clinically validated.",
              "The improvement index is descriptive. It does not show that rehabilitation is working.",
              "It is a university project built for technical testing, not a medical device. Clinical use needs validation with stroke survivors under clinical supervision.",
            ].map((t) => (
              <li key={t} className="grid grid-cols-[1.25rem_1fr] gap-x-3">
                <span aria-hidden="true" className="mt-[0.7em] h-px w-4 bg-brass" />
                <span className="max-w-[58ch]">{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <footer className="bg-rail text-rail-foreground">
        <div className={`${wrap} flex flex-wrap items-center justify-between gap-x-10 gap-y-6 py-12`}>
          <div>
            <Link href="/" aria-label="Arc, home" className="flex min-h-11 items-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass"><Wordmark /></Link>
            <p className="mt-3 max-w-[46ch] text-[0.9375rem] text-rail-muted">CSE 3200 project: an IMU-based serious game for home stroke rehabilitation.</p>
          </div>
          <Link href={cta.href} className="inline-flex h-14 items-center rounded-xl bg-brass px-7 text-base font-medium text-[#1a1305] transition-colors duration-150 hover:bg-[#c99a4a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass">
            {cta.label}
          </Link>
        </div>
      </footer>
    </div>
  );
}
