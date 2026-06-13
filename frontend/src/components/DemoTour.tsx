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

          // ── Step 5: Foundry IQ ───────────────────────────────────────────
          {
            element: ".header-badge",
            popover: {
              title: '🔷 Foundry IQ — The Intelligence Engine',
              description:
                '<p>Every answer is grounded in <strong>Azure AI Foundry</strong> — not hallucinated from training data.</p>' +
                '<ul class="tour-feature-list">' +
                '<li><strong>Azure AI Search</strong> retrieves city-specific grant docs, past applications, and CIP context</li>' +
                '<li><strong>GPT-4o</strong> orchestrates a 6-step reasoning chain: Parse → Match → Verify → Gaps → Narrative → Strategy</li>' +
                '<li><strong>Knowledge base</strong> holds 12+ curated grant guidance docs — Buffalo Grove CIP, federal rubrics, stacking strategies</li>' +
                '<li>Agents cite every claim back to a source — no black-box answers</li>' +
                '</ul>',
              side: "bottom" as const,
              align: "end" as const,
            },
          },

          // ── Step 6: Work IQ chip ──────────────────────────────────────
          {
            element: ".source-chip--work-iq",
            popover: {
              title: '📅 Work IQ — Microsoft 365 Workflow Intelligence',
              description:
                '<p>Work IQ pulls <strong>live signals from Microsoft 365</strong> and injects them directly into grant analysis — so every recommendation reflects what your team is actually working on.</p>' +
                '<ul class="tour-feature-list">' +
                '<li><strong>SharePoint</strong> — city grant documents, CIP files, past applications</li>' +
                '<li><strong>Outlook Calendar</strong> — upcoming deadline meetings, council votes, project milestones</li>' +
                '<li><strong>Outlook Mail</strong> — grant-related email threads and staff communications</li>' +
                '<li><strong>Microsoft Teams</strong> — active project discussions and department insights</li>' +
                '</ul>' +
                '<p class="tour-tip">💡 Demo line: <em>"It already knows about the Aptakisic Road project from your SharePoint — it used that as eligibility evidence."</em></p>',
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

          // ── Step 7: Work IQ attach picker (open) ─────────────────────
          {
            element: ".attach-picker-tabs-row",
            popover: {
              title: 'Work IQ Signal Sources — Live & Selectable',
              description:
                '<p>All M365 signal sources are individually selectable. Pin exactly the context you want — or attach all of them with one click.</p>' +
                '<div class="tour-chip-row">' +
                '<span class="tour-mini-chip tour-mini-chip--sp">SharePoint 5</span>' +
                '<span class="tour-mini-chip tour-mini-chip--cal">Meetings</span>' +
                '<span class="tour-mini-chip tour-mini-chip--mail">Emails</span>' +
                '<span class="tour-mini-chip tour-mini-chip--foundry">Foundry IQ 13</span>' +
                '<span class="tour-mini-chip tour-mini-chip--fabric">Fabric IQ 4</span>' +
                '</div>' +
                '<p class="tour-tip">💡 This is the proof of <strong>real workflow intelligence</strong> — not generic prompt engineering. The AI knows your city\'s operational context.</p>',
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

          // ── Step 7b: Fabric IQ chip ───────────────────────────────────
          {
            element: ".source-chip--fabric",
            popover: {
              title: '🧱 Fabric IQ — Operational Data Intelligence',
              description:
                '<p><strong>Fabric IQ</strong> connects grant strategy to your city\'s real financial and operational data via <strong>Microsoft Fabric</strong> semantic models.</p>' +
                '<ul class="tour-feature-list">' +
                '<li><strong>Semantic models</strong> — grant lifecycle, disbursement facts, milestone tracking</li>' +
                '<li><strong>Dim tables</strong> — agency, city, program, and grant reference data</li>' +
                '<li><strong>Ontology</strong> — grant lifecycle knowledge graph for structured reasoning</li>' +
                '<li>Enables claims like: <em>"Your city has a 94% compliance rate on past federal grants"</em> — backed by real Fabric data</li>' +
                '</ul>' +
                '<p class="tour-tip">💡 Demo line: <em>"Fabric IQ is what separates a smart chatbot from a true municipal intelligence platform."</em></p>',
              side: "top" as const,
              align: "start" as const,
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
                '<p class="tour-final-text">Three intelligence layers — <strong>Foundry IQ</strong>, <strong>Work IQ</strong>, and <strong>Fabric IQ</strong> — unified into one municipal grant workflow.</p>' +
                '<div class="tour-stat-row">' +
                '<div class="tour-stat"><span class="tour-stat-num">🔷</span><span class="tour-stat-label">Foundry IQ — GPT-4o + AI Search grounded retrieval</span></div>' +
                '<div class="tour-stat"><span class="tour-stat-num">📅</span><span class="tour-stat-label">Work IQ — SharePoint, Meetings, Emails, Teams</span></div>' +
                '<div class="tour-stat"><span class="tour-stat-num">🧱</span><span class="tour-stat-label">Fabric IQ — Semantic models + operational data</span></div>' +
                '</div>' +
                '<div class="tour-tech-row">' +
                '<span class="tour-tech-chip">Azure AI Foundry</span>' +
                '<span class="tour-tech-chip">Microsoft 365 Work IQ</span>' +
                '<span class="tour-tech-chip">Microsoft Fabric IQ</span>' +
                '<span class="tour-tech-chip">GPT-4o</span>' +
                '<span class="tour-tech-chip">Azure AI Search</span>' +
                '<span class="tour-tech-chip">Grants.gov API</span>' +
                '</div>' +
                '<p class="tour-final-tagline">Try: <em>"Use my latest meetings, SharePoint docs, and Fabric data to prioritize the top 3 grants this quarter."</em></p>',
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
