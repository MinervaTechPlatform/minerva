"use client";

import Link from "next/link";
import { useRevealOnScroll } from "./use-reveal";

const placeholderLogos = [
  "Acme Corp",
  "NovaTech",
  "BuildForward",
  "SyncWave",
  "Meridian",
  "Quantex",
];

export function SocialProofSection() {
  const { ref, visible } = useRevealOnScroll();

  return (
    <section className="py-20 bg-background border-y border-border" ref={ref}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`landing-section-reveal ${visible ? "is-visible" : ""}`}>
          <p className="text-center text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-8">
            Trusted by forward-thinking teams
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 opacity-50">
            {placeholderLogos.map((name) => (
              <div
                key={name}
                className="flex items-center justify-center px-6 py-3 rounded-xl border border-border bg-muted/30 text-sm font-bold text-muted-foreground tracking-wide min-w-[100px]"
              >
                {name}
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-muted-foreground mt-6">
            Logos &amp; testimonials coming soon
          </p>
        </div>
      </div>
    </section>
  );
}

export function CtaSection() {
  const { ref, visible } = useRevealOnScroll();

  return (
    <section className="py-28 bg-background relative overflow-hidden" ref={ref}>
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-primary/8 rounded-full blur-3xl animate-pulse-glow" />
      </div>

      {/* SVG decorative rings */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10">
        <svg viewBox="0 0 600 300" className="w-full max-w-3xl">
          <ellipse cx="300" cy="150" rx="280" ry="130" className="stroke-primary animate-spin-slow" strokeWidth="0.5" fill="none" strokeDasharray="6 8" />
          <ellipse cx="300" cy="150" rx="200" ry="90" className="stroke-primary" strokeWidth="0.5" fill="none" strokeDasharray="3 6" />
        </svg>
      </div>

      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 text-center">
        <div className={`landing-section-reveal ${visible ? "is-visible" : ""}`}>
          <span className="text-xs text-primary font-semibold uppercase tracking-widest">
            Get Started
          </span>
          <h2 className="mt-3 text-4xl sm:text-5xl font-black tracking-tight mb-4">
            Turn every interaction into
            <br />
            <span className="bg-gradient-to-r from-primary via-primary/80 to-primary/50 bg-clip-text text-transparent">
              an opportunity.
            </span>
          </h2>
          <p className="text-muted-foreground text-lg mb-10">
            Start building intelligent conversations with Minerva today.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/auth/signin"
              className="group flex items-center gap-2 px-8 py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 w-full sm:w-auto justify-center"
            >
              Start Free Trial
            </Link>
            <Link
              href="/auth/signin"
              className="flex items-center gap-2 px-8 py-3.5 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-accent hover:border-primary/30 transition-all w-full sm:w-auto justify-center"
            >
              Schedule Demo
            </Link>
          </div>

          <p className="mt-6 text-xs text-muted-foreground">
            7-day free trial · No credit card required · Cancel anytime
          </p>
        </div>
      </div>
    </section>
  );
}
