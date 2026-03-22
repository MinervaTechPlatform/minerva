"use client";

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-background pt-16">
      {/* Background grid */}
      <div className="absolute inset-0 pointer-events-none">
        <svg
          className="absolute inset-0 w-full h-full opacity-[0.04] dark:opacity-[0.06]"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M 48 0 L 0 0 0 48" fill="none" stroke="currentColor" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {/* Gradient orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse-glow" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-primary/8 rounded-full blur-3xl animate-pulse-glow delay-500" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 grid lg:grid-cols-2 gap-12 items-center">
        {/* Text content */}
        <div className="flex flex-col items-start gap-6">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-primary text-xs font-semibold uppercase tracking-widest animate-fade-in-up">
            <Sparkles className="w-3 h-3" />
            Industry-ready AI Platform
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black leading-[1.05] tracking-tight animate-fade-in-up delay-100">
            Conversations
            <br />
            <span className="bg-gradient-to-r from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent">
              that convert.
            </span>
            <br />
            Intelligence
            <br />
            that scales.
          </h1>

          <p className="text-lg text-muted-foreground max-w-lg leading-relaxed animate-fade-in-up delay-200">
            Minerva is a next-generation AI conversation engine designed to turn
            every customer interaction into a meaningful, high-conversion
            experience — across industries.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 animate-fade-in-up delay-300">
            <Link
              href="/auth/signin"
              className="group flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all hover:shadow-lg hover:shadow-primary/25 hover:-translate-y-0.5"
            >
              Start Free Trial
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <button
              onClick={() => {
                document.querySelector("#how-it-works")?.scrollIntoView({ behavior: "smooth" });
              }}
              className="flex items-center gap-2 px-6 py-3 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-accent hover:border-primary/30 transition-all"
            >
              Book a Demo
            </button>
          </div>

          <p className="text-xs text-muted-foreground animate-fade-in-up delay-400">
            Industry-ready. Built for real business outcomes.
          </p>
        </div>

        {/* Hero SVG illustration */}
        <div className="relative flex items-center justify-center animate-float">
          <HeroIllustration />
        </div>
      </div>
    </section>
  );
}

function HeroIllustration() {
  return (
    <svg
      viewBox="0 0 480 400"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full max-w-lg"
    >
      {/* Outer ring */}
      <circle
        cx="240"
        cy="200"
        r="150"
        className="stroke-primary/20 animate-spin-slow"
        strokeWidth="1"
        strokeDasharray="8 6"
      />

      {/* Middle ring */}
      <circle
        cx="240"
        cy="200"
        r="110"
        className="stroke-primary/15"
        strokeWidth="1"
        strokeDasharray="4 8"
      />

      {/* Core circle */}
      <circle cx="240" cy="200" r="60" className="fill-primary/5 stroke-primary/30" strokeWidth="1.5" />

      {/* AI brain icon center */}
      <circle cx="240" cy="200" r="30" className="fill-primary/10 stroke-primary/50" strokeWidth="2" />
      <path
        d="M228 195 Q235 185 240 195 Q245 185 252 195 M228 205 Q235 215 240 205 Q245 215 252 205"
        className="stroke-primary animate-pulse-glow"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M240 168 L240 175 M240 225 L240 232"
        className="stroke-primary/50 animate-draw-line"
        strokeWidth="1"
        strokeLinecap="round"
      />

      {/* Nodes */}
      {[
        { cx: 240, cy: 90, label: "Intent" },
        { cx: 350, cy: 155, label: "Context" },
        { cx: 350, cy: 245, label: "Action" },
        { cx: 240, cy: 310, label: "Learn" },
        { cx: 130, cy: 245, label: "Deploy" },
        { cx: 130, cy: 155, label: "Data" },
      ].map(({ cx, cy, label }, i) => (
        <g key={label}>
          {/* Connection line from node to center */}
          <line
            x1={cx}
            y1={cy}
            x2={240}
            y2={200}
            className="stroke-primary/25 animate-draw-line"
            strokeWidth="1"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
          {/* Node circle */}
          <circle
            cx={cx}
            cy={cy}
            r="22"
            className="fill-background stroke-primary/40"
            strokeWidth="1.5"
          />
          <circle
            cx={cx}
            cy={cy}
            r="12"
            className="fill-primary/10"
          />
          <circle
            cx={cx}
            cy={cy}
            r="4"
            className="fill-primary animate-pulse-glow"
            style={{ animationDelay: `${i * 0.25}s` }}
          />
          {/* Label */}
          <text
            x={cx}
            y={cy > 200 ? cy + 38 : cy - 30}
            textAnchor="middle"
            className="fill-muted-foreground"
            fontSize="10"
            fontFamily="inherit"
          >
            {label}
          </text>
        </g>
      ))}

      {/* Floating chat bubbles */}
      <g className="animate-fade-in-up delay-500">
        <rect x="290" y="80" width="120" height="28" rx="14" className="fill-primary/10 stroke-primary/30" strokeWidth="1" />
        <text x="350" y="99" textAnchor="middle" className="fill-primary" fontSize="9" fontFamily="inherit">
          How can I help you?
        </text>
      </g>
      <g className="animate-fade-in-up delay-700">
        <rect x="70" y="280" width="110" height="28" rx="14" className="fill-primary/8 stroke-primary/20" strokeWidth="1" />
        <text x="125" y="299" textAnchor="middle" className="fill-muted-foreground" fontSize="9" fontFamily="inherit">
          I need to schedule...
        </text>
      </g>
    </svg>
  );
}
