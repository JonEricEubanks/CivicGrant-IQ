import { useRef } from "react";
import { driver } from "driver.js";
import type { Driver } from "driver.js";
import "driver.js/dist/driver.css";
import type { AppTab } from "./AppHeader";
import "./DemoTour.css";

interface DemoTourProps {
  onNavigate: (tab: AppTab) => void;
}

export function DemoTour({ onNavigate }: DemoTourProps) {
  const driverRef = useRef<Driver | null>(null);

  function startTour() {
    // Ensure we start on the chat tab
    onNavigate("chat");

    // Give React a tick to render the chat tab before initialising
    setTimeout(() => {
      const driverObj = driver({
        showProgress: true,
        progressText: "{{current}} / {{total}}",
        allowClose: true,
        overlayColor: "rgba(2, 6, 23, 0.75)",
        smoothScroll: true,
        stagePadding: 8,
        stageRadius: 10,
        popoverClass: "civicgrant-tour-popover",
        onDestroyStarted: () => {
          driverObj.destroy();
        },
        steps: [
          // ── Step 1: Welcome splash (no element) ──────────────────────────
          {
            popover: {
              title:
                '<span class="tour-badge">Hackathon Demo</span><br/>Welcome to CivicGrant IQ',
              description:
                '<p class="tour-intro-sub">The AI that finds <strong>millions in federal grants</strong> your city qualifies for — right now.</p>' +
                '<div class="tour-stat-row">' +
                '<div class="tour-stat"><span class="tour-stat-num">$8.7M</span><span class="tour-stat-label">Avg opportunity identified per city</span></div>' +
                '<div class="tour-stat"><span class="tour-stat-num">6-step</span><span class="tour-stat-label">AI reasoning chain per analysis</span></div>' +
                '<div class="tour-stat"><span class="tour-stat-num">Live</span><span class="tour-stat-label">Real Grants.gov data, always fresh</span></div>' +
                "</div>" +
                '<p class="tour-cta-hint">Let\'s walk through the key features</p>',
              side: "over" as const,
              align: "center" as const,
            },
          },

          // ── Step 2: Brand / header ───────────────────────────────────────
          {
            element: ".header-brand",
            popover: {
              title: "CivicGrant IQ — Municipal Revenue Intelligence",
              description:
                "A purpose-built AI agent that helps city governments discover, analyze, and win federal grants. Built in 48 hours for Agents League @ AISF 2026.",
              side: "bottom" as const,
              align: "start" as const,
            },
          },

          // ── Step 3: Foundry badge ────────────────────────────────────────
          {
            element: ".header-badge",
            popover: {
              title: "Powered by Microsoft Foundry IQ",
              description:
                "The entire intelligence stack runs on <strong>Azure AI Foundry</strong> — GPT-4o reasoning, Azure AI Search agentic retrieval, and real-time Grants.gov integration. Every answer is grounded in live federal data.",
              side: "bottom" as const,
              align: "end" as const,
            },
          },

          // ── Step 4: Hero grant cards ─────────────────────────────────────
          {
            element: ".hero-grant-cards",
            popover: {
              title: "Live Federal Grant Opportunities",
              description:
                "Real grants pulled from <strong>Grants.gov in real-time</strong>, pre-scored for Buffalo Grove, IL. Click any card to instantly launch a deep AI analysis — match score, eligibility gaps, and application strategy.",
              side: "bottom" as const,
              align: "start" as const,
            },
          },

          // ── Step 5: Chat input area ──────────────────────────────────────
          {
            element: ".chat-input-area",
            popover: {
              title: "AI Grant Analyst — Ask Anything",
              description:
                "Type any grant question in plain English. The agent follows a <strong>6-step reasoning chain</strong>: Parse → Match → Verify → Gaps → Narrative → Strategy. Every response includes citations from the live knowledge base.",
              side: "top" as const,
              align: "start" as const,
              // Navigate to scan tab when the user clicks Next on this step
              onNextClick: () => {
                onNavigate("scan");
                setTimeout(() => driverObj.moveNext(), 350);
              },
            },
          },

          // ── Step 6: Scan My City tab ─────────────────────────────────────
          {
            element: ".header-tabs",
            popover: {
              title: 'Tab 2: "Scan My City"',
              description:
                "Enter your city's profile and watch AI build a <strong>complete personalised grant portfolio</strong> in under 60 seconds. Parallel agent analyses run simultaneously across every focus area.",
              side: "bottom" as const,
              align: "start" as const,
            },
          },

          // ── Step 7: Grant scanner form ───────────────────────────────────
          {
            element: ".grant-scanner",
            popover: {
              title: "City Profile Builder",
              description:
                "Fill in your city name, state, population, and current capital projects. CivicGrant IQ uses this profile to tailor every recommendation — matching real federal eligibility criteria, not generic keyword results.",
              side: "right" as const,
              align: "start" as const,
            },
          },

          // ── Step 8: Focus area chips ─────────────────────────────────────
          {
            element: ".focus-section",
            popover: {
              title: "Priority Focus Areas — Smart Filtering",
              description:
                "Select your city's priorities: Transportation, Water & Sewer, Housing, Climate, and more. The AI immediately re-filters the <strong>live Grants.gov feed</strong> on the right to only show matching programs — no keyword guessing needed.",
              side: "right" as const,
              align: "start" as const,
              onNextClick: () => {
                onNavigate("admin");
                setTimeout(() => driverObj.moveNext(), 350);
              },
            },
          },

          // ── Step 9: Admin dashboard ──────────────────────────────────────
          {
            element: ".admin-page",
            popover: {
              title: 'Tab 3: Grant Pipeline Manager',
              description:
                "Track every grant in your pipeline: application status, deadlines, match scores, and funding amounts. The admin AI assistant can draft status reports, flag upcoming deadlines, and answer compliance questions on demand.",
              side: "top" as const,
              align: "start" as const,
              onNextClick: () => {
                onNavigate("chat");
                setTimeout(() => driverObj.moveNext(), 350);
              },
            },
          },

          // ── Step 10: Chat main area (back on chat) ───────────────────
          {
            element: ".chat-main",
            popover: {
              title: "Multi-Agent Orchestration",
              description:
                "Behind every response, a <strong>team of specialised AI agents</strong> collaborate: a Grant Analyzer, a Red-Team reviewer, a Competitor Intelligence agent, and a Narrative Refiner. You get the best answer — not the first answer.",
              side: "top" as const,
              align: "center" as const,
            },
          },

          // ── Step 11: Final / win message ─────────────────────────────────
          {
            popover: {
              title: "That's CivicGrant IQ",
              description:
                '<p class="tour-final-text">A full-stack municipal AI agent — live data, multi-step reasoning, real federal grant intelligence — built in 48 hours.</p>' +
                '<div class="tour-tech-row">' +
                '<span class="tour-tech-chip">Azure AI Foundry</span>' +
                '<span class="tour-tech-chip">GPT-4o</span>' +
                '<span class="tour-tech-chip">Azure AI Search</span>' +
                '<span class="tour-tech-chip">Grants.gov API</span>' +
                '<span class="tour-tech-chip">React 18 + Vite</span>' +
                "</div>" +
                '<p class="tour-final-tagline">Ask the chat: <em>"What grants does Buffalo Grove qualify for right now?"</em></p>',
              side: "over" as const,
              align: "center" as const,
            },
          },
        ],
      });

      driverRef.current = driverObj;
      driverObj.drive();
    }, 150);
  }

  return (
    <button className="tour-trigger-btn" onClick={startTour} title="Take a guided demo tour">
      <span className="tour-trigger-label">Demo Tour</span>
    </button>
  );
}
