"use client";

import { useRevealOnScroll } from "./use-reveal";

const capabilities = [
  {
    title: "Understand intent, not just keywords",
    description:
      "Deep NLU models parse the why behind every message, not just what was said.",
  },
  {
    title: "Guide users toward decisions",
    description:
      "Adaptive conversation flows steer users naturally toward their goals and your outcomes.",
  },
  {
    title: "Personalize responses in real time",
    description:
      "Context-aware replies that adapt to user history, preferences, and behaviour.",
  },
  {
    title: "Continuously learn and improve",
    description:
      "Every conversation feeds back into the model, making Minerva smarter over time.",
  },
];

export function SolutionSection() {
  const { ref, visible } = useRevealOnScroll();

  return (
    <section id="solution" className="py-24 bg-accent/30" ref={ref}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`landing-section-reveal ${visible ? "is-visible" : ""}`}>
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left: SVG illustration */}
            <div className="flex justify-center order-2 lg:order-1">
              <SolutionIllustration />
            </div>

            {/* Right: content */}
            <div className="order-1 lg:order-2">
              <div className="mb-2">
                <span className="text-xs text-primary font-semibold uppercase tracking-widest">
                  The Solution
                </span>
              </div>
              <h2 className="text-4xl sm:text-5xl font-black tracking-tight mb-4">
                Meet Minerva —{" "}
                <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                  Your AI Conversation Layer
                </span>
              </h2>
              <p className="text-muted-foreground mb-8 leading-relaxed">
                Minerva replaces static interfaces with intelligent, adaptive
                conversations. This isn&apos;t a chatbot. It&apos;s your{" "}
                <strong className="text-foreground">
                  AI-powered business interface.
                </strong>
              </p>

              <ul className="flex flex-col gap-4">
                {capabilities.map((cap, i) => (
                  <li key={cap.title} className="flex items-start gap-3 group">
                    <div
                      className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center mt-0.5"
                      style={{ transitionDelay: `${i * 80}ms` }}
                    >
                      <svg viewBox="0 0 12 12" className="w-3 h-3">
                        <path
                          d="M2 6l3 3 5-5"
                          className="stroke-primary"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill="none"
                        />
                      </svg>
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-foreground">
                        {cap.title}
                      </span>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {cap.description}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SolutionIllustration() {
  return (
    <svg
      viewBox="0 0 380 340"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full max-w-md animate-float"
    >
      {/* Base platform */}
      <rect
        x="60"
        y="260"
        width="260"
        height="40"
        rx="8"
        className="fill-primary/5 stroke-primary/20"
        strokeWidth="1"
      />
      <text x="190" y="285" textAnchor="middle" className="fill-primary/50" fontSize="10" fontFamily="inherit">
        Minerva Platform
      </text>

      {/* Conversation threads */}
      {[
        { x: 80, y: 80, w: 110, msg: "I want to buy a home..." },
        { x: 200, y: 130, w: 120, msg: "Best plan for me?" },
        { x: 100, y: 180, w: 130, msg: "Book an appointment" },
      ].map((b, i) => (
        <g key={i} style={{ animationDelay: `${i * 0.2}s` }}>
          <rect
            x={b.x}
            y={b.y}
            width={b.w}
            height={28}
            rx="14"
            className="fill-primary/8 stroke-primary/25"
            strokeWidth="1"
          />
          <text
            x={b.x + b.w / 2}
            y={b.y + 18}
            textAnchor="middle"
            className="fill-muted-foreground"
            fontSize="8.5"
            fontFamily="inherit"
          >
            {b.msg}
          </text>
          {/* Line to platform */}
          <line
            x1={b.x + b.w / 2}
            y1={b.y + 28}
            x2={190}
            y2={255}
            className="stroke-primary/20 animate-draw-line"
            strokeWidth="1"
            strokeDasharray="4 4"
            style={{ animationDelay: `${i * 0.3}s` }}
          />
        </g>
      ))}

      {/* Response bubbles */}
      {[
        { x: 210, y: 65, msg: "Let me find options..." },
        { x: 60, y: 150, msg: "I recommend Plan B" },
      ].map((b, i) => (
        <g key={i}>
          <rect
            x={b.x}
            y={b.y}
            width={115}
            height={26}
            rx="13"
            className="fill-primary/15 stroke-primary/35"
            strokeWidth="1"
          />
          <circle cx={b.x + 8} cy={b.y + 13} r="3" className="fill-primary animate-pulse-glow" />
          <text
            x={b.x + 18}
            y={b.y + 17}
            className="fill-primary/80"
            fontSize="8.5"
            fontFamily="inherit"
          >
            {b.msg}
          </text>
        </g>
      ))}
    </svg>
  );
}
