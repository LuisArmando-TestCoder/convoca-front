"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Lenis from "lenis";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useReducedMotion,
  type Variants,
} from "framer-motion";
import { getToken } from "@/lib/api";

/* ── Funnel content (data-driven so slides stay consistent) ────────────────── */
const PAINS = [
  "Lines snaking out the door while people wait",
  "Paper lists, highlighters, and crossed-out names",
  "Spreadsheets that never match who actually walked in",
  "The same guest checked in twice — or not at all",
  "Event's over and you still don't know who showed up",
];

const CAPABILITIES = [
  {
    kicker: "Registration & invites",
    feel: "How would it feel to never chase a spreadsheet again?",
    body:
      "Build your own registration form, import a whole list from CSV or Excel, or share a self-registration link. Every guest gets a unique QR ticket by email — automatically.",
    points: ["Team-defined fields", "CSV & Excel import", "Self-registration links", "Automatic QR emails"],
  },
  {
    kicker: "Check-in that just works",
    feel: "How would it feel to clear a line in seconds?",
    body:
      "Point any phone camera at a guest's QR and they're in. Duplicate scans are caught the instant they happen, and your whole team can scan from their own phones at once.",
    points: ["Phone-camera scanning", "Duplicate-scan safeguard", "Multiple scanners at once", "Instant confirmation"],
  },
  {
    kicker: "Know everything, live",
    feel: "How would it feel to see exactly who showed up — as it happens?",
    body:
      "Watch attendance climb in real time. See check-in rate, breakdowns by source and country, and export the whole thing to CSV with one click.",
    points: ["Live dashboards", "Attendance by source", "Check-in rate", "One-click export"],
  },
];

const SLIDE_COUNT = 6;

/* ── Motion primitives ─────────────────────────────────────────────────────── */
const EASE = [0.22, 1, 0.36, 1] as const;

const revealV: Variants = {
  hidden: { opacity: 0, y: 34 },
  show: (delay = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.75, ease: EASE, delay } }),
};

function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={revealV}
      custom={delay}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.35 }}
    >
      {children}
    </motion.div>
  );
}

function CtaRow({ variant = "hero" }: { variant?: "hero" | "final" }) {
  return (
    <div className="cta-row">
      <Link href="/register-org" className="btn btn--primary btn--lg">
        {variant === "final" ? "Start free — create your organization" : "Create your organization"}
      </Link>
      <Link href="/login" className="btn btn--ghost btn--lg">
        {variant === "final" ? "I already have an account" : "Sign in"}
      </Link>
    </div>
  );
}

export default function Landing() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const lenisRef = useRef<Lenis | null>(null);
  const [active, setActive] = useState(0);

  // Pointer-reactive parallax (normalized -0.5..0.5 around viewport center).
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 55, damping: 18, mass: 0.6 });
  const sy = useSpring(py, { stiffness: 55, damping: 18, mass: 0.6 });
  const blobAX = useTransform(sx, (v) => v * 46);
  const blobAY = useTransform(sy, (v) => v * 46);
  const blobBX = useTransform(sx, (v) => v * -66);
  const blobBY = useTransform(sy, (v) => v * -66);
  const heroX = useTransform(sx, (v) => v * 16);
  const heroY = useTransform(sy, (v) => v * 12);

  useEffect(() => {
    if (getToken()) router.replace("/dashboard");
  }, [router]);

  // Lenis smooth scroll — scoped to this page, torn down on unmount.
  useEffect(() => {
    if (reduced) return;
    const lenis = new Lenis({ duration: 1.15, wheelMultiplier: 1, touchMultiplier: 1.4, smoothWheel: true });
    lenisRef.current = lenis;
    let raf = 0;
    const loop = (t: number) => {
      lenis.raf(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [reduced]);

  // Pointer tracking for parallax.
  useEffect(() => {
    if (reduced) return;
    const onMove = (e: PointerEvent) => {
      px.set(e.clientX / window.innerWidth - 0.5);
      py.set(e.clientY / window.innerHeight - 0.5);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [reduced, px, py]);

  // Active-section tracking for the nav dots.
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.index));
        }),
      { threshold: 0.55 },
    );
    document.querySelectorAll(".slide").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const go = (i: number) => {
    const el = document.querySelectorAll<HTMLElement>(".slide")[i];
    if (!el) return;
    if (lenisRef.current) lenisRef.current.scrollTo(el, { offset: 0 });
    else el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
      {/* Mouse-reactive ambient aura (fixed, behind everything) */}
      <div className="aura" aria-hidden>
        <motion.div className="aura__blob aura__blob--a" style={{ x: blobAX, y: blobAY }} />
        <motion.div className="aura__blob aura__blob--b" style={{ x: blobBX, y: blobBY }} />
      </div>

      <header className="topbar">
        <div className="container topbar__inner">
          <div className="brand-mark">
            <span className="brand-dot" /> Convoca
          </div>
          <div className="grow" />
          <Link href="/login" className="btn btn--ghost btn--sm">Sign in</Link>
          <Link href="/register-org" className="btn btn--primary btn--sm">Get started</Link>
        </div>
      </header>

      <nav className="deck-nav" aria-label="Sections">
        {Array.from({ length: SLIDE_COUNT }).map((_, i) => (
          <button
            key={i}
            className={`deck-nav__dot ${active === i ? "deck-nav__dot--active" : ""}`}
            onClick={() => go(i)}
            aria-label={`Go to section ${i + 1}`}
            aria-current={active === i}
          />
        ))}
      </nav>

      <main>
        {/* 0 — Hero + CTA (beginning) */}
        <section className="slide" data-index={0}>
          <motion.div className="slide__inner" style={{ x: heroX, y: heroY }}>
            <Reveal><span className="badge badge--info">Event check-in, reimagined</span></Reveal>
            <Reveal delay={0.08}>
              <h1 className="display mt-16">
                Every guest walks in, and it <span className="display--grad">just works.</span>
              </h1>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="lede">
                Register people, email each one a unique QR ticket, and check them in with a phone camera.
                No lines. No paper. No doubt about who showed up.
              </p>
            </Reveal>
            <Reveal delay={0.24}><CtaRow variant="hero" /></Reveal>
          </motion.div>
          <motion.button
            className="scroll-cue"
            onClick={() => go(1)}
            aria-label="Scroll down"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.6 }}
          >
            <span>See how</span>
            <motion.svg
              className="scroll-cue__chevron"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              animate={{ y: [0, 6, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            >
              <polyline points="6 9 12 15 18 9" />
            </motion.svg>
          </motion.button>
        </section>

        {/* 1 — The struggle */}
        <section className="slide" data-index={1}>
          <div className="slide__inner">
            <Reveal><span className="kicker">The door is where events go wrong</span></Reveal>
            <Reveal delay={0.08}>
              <h2 className="display mt-16">You've felt this before.</h2>
            </Reveal>
            <div className="pains">
              {PAINS.map((p, i) => (
                <Reveal key={p} delay={0.12 + i * 0.08} className="pain">
                  <span className="pain__x">✕</span>
                  <span>{p}</span>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* 2 — Turning point */}
        <section className="slide" data-index={2}>
          <div className="slide__inner">
            <Reveal><span className="kicker">There's a calmer way</span></Reveal>
            <Reveal delay={0.08}>
              <h2 className="display mt-16">
                What if the whole door was <span className="display--grad">one scan?</span>
              </h2>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="lede">
                Convoca turns registration, tickets, check-in, and reporting into a single flow —
                so event day feels effortless instead of frantic.
              </p>
            </Reveal>
          </div>
        </section>

        {/* 3–5 — Capabilities, sold as feelings */}
        {CAPABILITIES.map((c, idx) => (
          <section className="slide" data-index={3 + idx} key={c.kicker}>
            <div className="slide__inner">
              <Reveal><span className="kicker">{c.kicker}</span></Reveal>
              <Reveal delay={0.08}>
                <h2 className="display mt-16">{c.feel}</h2>
              </Reveal>
              <Reveal delay={0.16}><p className="lede">{c.body}</p></Reveal>
              <div className="caps-grid">
                {c.points.map((pt, i) => (
                  <Reveal key={pt} delay={0.2 + i * 0.07} className="cap-point">
                    <span className="cap-point__tick">✓</span>
                    <span>{pt}</span>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>
        ))}

        {/* 6 — Result payoff + CTA (end) */}
        <section className="slide" data-index={SLIDE_COUNT - 1}>
          <div className="slide__inner">
            <Reveal><span className="kicker">This is what calm looks like</span></Reveal>
            <Reveal delay={0.08}>
              <h2 className="display mt-16">
                Picture your next event <span className="display--grad">running itself.</span>
              </h2>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="lede">
                Guests glide in. Your team scans with a smile. The numbers update themselves.
                And you finally get to enjoy the event you built.
              </p>
            </Reveal>
            <Reveal delay={0.24}><CtaRow variant="final" /></Reveal>
            <Reveal delay={0.32}>
              <p className="small muted mt-16">Free to start · No card required · Set up in minutes</p>
            </Reveal>
          </div>
        </section>
      </main>
    </>
  );
}
