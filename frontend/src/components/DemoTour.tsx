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
    // Ensure we start on the chat view
    onNavigate("chat");

    // Give React a tick to render the chat view before initialising
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
                '<p class="tour-intro-sub">The municipal copilot that turns <strong>Work IQ signals + Foundry intelligence</strong> into fundable grant strategy.</p>' +
                '<div class="tour-stat-row">' +
                '<div class="tour-stat"><span class="tour-stat-num">$8.7M</span><span class="tour-stat-label">Avg opportunity identified per city</span></div>' +
                '<div class="tour-stat"><span class="tour-stat-num">M365</span><span class="tour-stat-label">Meetings, emails, Teams, SharePoint context</span></div>' +
                '<div class="tour-stat"><span class="tour-stat-num">Foundry</span><span class="tour-stat-label">Grounded retrieval + orchestrated AI reasoning</span></div>' +
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
                "A purpose-built AI agent that helps city governments discover, analyze, and win federal grants.",
              side: "bottom" as const,
              align: "start" as const,
            },
          },

          // ── Step 3: Hero grant cards ─────────────────────────────────────
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

          // ── Step 4: Chat input area ──────────────────────────────────────
          {
            element: ".chat-input-area",
            popover: {
              title: "AI Grant Analyst — Ask and Ground",
              description:
                "Ask in plain English and the system runs a <strong>6-step chain</strong>: Parse → Match → Verify → Gaps → Narrative → Strategy. Responses include citations grounded in Foundry IQ and live grant sources.",
              side: "top" as const,
              align: "start" as const,
            },
          },

          // ── Step 5: Foundry badge ────────────────────────────────────────
          {
            element: ".header-badge",
            popover: {
              title: "Foundry-Powered Intelligence Layer",
              description:
                "CivicGrant IQ runs on <strong>Azure AI Foundry</strong>: GPT-4o analysis, Azure AI Search retrieval, and grants orchestration. Foundry grounds every recommendation in trusted evidence before strategy is generated.",
              side: "bottom" as const,
              align: "end" as const,
            },
          },

          // ── Step 6: Source chips / attach launcher ─────────────────────
          {
            element: ".input-toolbar",
            popover: {
              title: "Work IQ + Foundry Context Controls",
              description:
                "This is where users pin context from <strong>Work IQ</strong> (SharePoint docs, meetings, emails, Teams) and Foundry IQ knowledge. It demonstrates the Microsoft 365 + Power Platform side, not just LLM chat.",
              side: "top" as const,
              align: "start" as const,
              onNextClick: () => {
                const attachBtn = document.querySelector<HTMLButtonElement>(".attach-btn");
                if (!document.querySelector(".attach-picker-popover")) {
                  attachBtn?.click();
                }
                setTimeout(() => driverObj.moveNext(), 280);
              },
            },
          },

          // ── Step 7: Attach picker tabs (meetings/emails/foundry) ──────
          {
            element: ".attach-picker-tabs-row",
            popover: {
              title: "Work IQ Signals in One Place",
              description:
                "Show this during demos: <strong>Meetings + Emails + Teams + SharePoint + Foundry IQ</strong> are all selectable context. This is the proof of real workflow intelligence, not generic prompt engineering.",
              side: "top" as const,
              align: "center" as const,
              onNextClick: () => {
                const attachBtn = document.querySelector<HTMLButtonElement>(".attach-btn");
                if (document.querySelector(".attach-picker-popover")) {
                  attachBtn?.click();
                }
                setTimeout(() => driverObj.moveNext(), 280);
              },
            },
          },

          // ── Step 8: Inline "Scan My City" launcher ──────────────────────
          {
            element: ".hero-grant-card--scan",
            popover: {
              title: 'Inline "Scan My City" Launcher',
              description:
                "Scan My City is now part of the chat experience. Click this card to open the inline setup and run a <strong>complete personalized portfolio analysis</strong> without leaving the conversation.",
              side: "top" as const,
              align: "start" as const,
              onNextClick: () => {
                const scanCard = document.querySelector<HTMLButtonElement>(".hero-grant-card--scan");
                scanCard?.click();
                setTimeout(() => driverObj.moveNext(), 350);
              },
            },
          },

          // ── Step 9: Inline scan setup card ───────────────────────────────
          {
            element: ".issc-root",
            popover: {
              title: "City Profile Builder (Inline)",
              description:
                "This setup card lives directly in chat. Add city, state, municipality size, and projects, then launch parallel analysis grounded in Work IQ + Foundry evidence.",
              side: "right" as const,
              align: "start" as const,
            },
          },

          // ── Step 10: Inline priority focus areas ─────────────────────────
          {
            element: ".issc-chips",
            popover: {
              title: "Priority Focus Areas (Inline)",
              description:
                "Select priority areas and the inline scanner auto-updates projects from Work IQ context, then aligns them to the <strong>live Grants.gov pipeline</strong> for operational fit.",
              side: "right" as const,
              align: "start" as const,
              onNextClick: () => {
                onNavigate("admin");
                setTimeout(() => driverObj.moveNext(), 350);
              },
            },
          },

          // ── Step 11: Admin dashboard ──────────────────────────────────────
          {
            element: ".admin-page",
            popover: {
              title: "Grant Pipeline Manager",
              description:
                "Track application status, deadlines, win probability, and funding totals. This keeps delivery teams aligned while Foundry analysis and Work IQ context continue feeding decisions.",
              side: "top" as const,
              align: "start" as const,
              onNextClick: () => {
                onNavigate("chat");
                setTimeout(() => driverObj.moveNext(), 350);
              },
            },
          },

          // ── Step 12: Chat main area (back on chat) ─────────────────────
          {
            element: ".chat-main",
            popover: {
              title: "Multi-Agent Orchestration",
              description:
                "Behind each answer, <strong>specialized agents</strong> collaborate: grant analysis, retrieval verification, red-team review, competitive intel, and narrative refinement. Foundry orchestrates the flow and keeps outputs traceable.",
              side: "top" as const,
              align: "center" as const,
            },
          },

          // ── Step 13: Final / win message ─────────────────────────────────
          {
            popover: {
              title: "That's CivicGrant IQ",
              description:
                '<p class="tour-final-text">A production-style municipal AI workflow: Work IQ context from daily operations, Foundry-grounded intelligence, and practical grant execution.</p>' +
                '<div class="tour-tech-row">' +
                '<span class="tour-tech-chip">Azure AI Foundry</span>' +
                '<span class="tour-tech-chip">Microsoft 365 Work IQ</span>' +
                '<span class="tour-tech-chip">Power Platform Signals</span>' +
                '<span class="tour-tech-chip">GPT-4o</span>' +
                '<span class="tour-tech-chip">Azure AI Search</span>' +
                '<span class="tour-tech-chip">Grants.gov API</span>' +
                '<span class="tour-tech-chip">React 18 + Vite</span>' +
                "</div>" +
                '<p class="tour-final-tagline">Try: <em>"Use my latest meetings, emails, and Foundry docs to prioritize the top 3 grants this quarter."</em></p>',
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
