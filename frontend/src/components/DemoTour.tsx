import { useRef } from "react";
import { driver } from "driver.js";
import type { Driver } from "driver.js";
import "driver.js/dist/driver.css";
import type { AppTab } from "./AppHeader";
import "./DemoTour.css";

interface DemoTourProps {
  onNavigate: (tab: AppTab) => void;
}

// ── Inline SVG strings for tour HTML content (no JSX allowed in driver.js steps) ──
const SVG_FOUNDRY = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:inline-block;vertical-align:middle;margin-right:5px"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`;
const SVG_WORKIQ = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:inline-block;vertical-align:middle;margin-right:5px"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
const SVG_FABRIC = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:inline-block;vertical-align:middle;margin-right:5px"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/><line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="8.5" x2="22" y2="8.5"/><line x1="2" y1="15.5" x2="22" y2="15.5"/></svg>`;

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
                '<p class="tour-intro-sub">The municipal copilot powered by three intelligence layers — turning city data into fundable grant strategy.</p>' +
                '<div class="tour-iq-trio">' +
                `<div class="tour-iq-card tour-iq-card--foundry"><div class="tour-iq-icon">${SVG_FOUNDRY}</div><strong>Foundry IQ</strong><span>GPT-4o + Azure AI Search grounded retrieval</span></div>` +
                `<div class="tour-iq-card tour-iq-card--workiq"><div class="tour-iq-icon">${SVG_WORKIQ}</div><strong>Work IQ</strong><span>SharePoint, Meetings, Emails &amp; Teams</span></div>` +
                `<div class="tour-iq-card tour-iq-card--fabric"><div class="tour-iq-icon">${SVG_FABRIC}</div><strong>Fabric IQ</strong><span>Semantic models + operational data</span></div>` +
                '</div>' +
                '<p class="tour-cta-hint">Let\'s walk through each layer</p>',
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
              title: `${SVG_FOUNDRY}<span style="vertical-align:middle">Foundry IQ — The Intelligence Engine</span>`,
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
              title: `${SVG_WORKIQ}<span style="vertical-align:middle">Work IQ — Microsoft 365 Workflow Intelligence</span>`,
              description:
                '<p>Work IQ pulls <strong>live signals from Microsoft 365</strong> and injects them directly into grant analysis — so every recommendation reflects what your team is actually working on.</p>' +
                '<ul class="tour-feature-list">' +
                '<li><strong>SharePoint</strong> — city grant documents, CIP files, past applications</li>' +
                '<li><strong>Outlook Calendar</strong> — upcoming deadline meetings, council votes, project milestones</li>' +
                '<li><strong>Outlook Mail</strong> — grant-related email threads and staff communications</li>' +
                '<li><strong>Microsoft Teams</strong> — active project discussions and department insights</li>' +
                '</ul>' +
                '<p class="tour-tip">Demo line: <em>"It already knows about the Aptakisic Road project from your SharePoint — it used that as eligibility evidence."</em></p>',
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
              title: `${SVG_WORKIQ}<span style="vertical-align:middle">Work IQ Signal Sources — Live &amp; Selectable</span>`,
              description:
                '<p>All M365 signal sources are individually selectable. Pin exactly the context you want — or attach all of them with one click.</p>' +
                '<div class="tour-chip-row">' +
                '<span class="tour-mini-chip tour-mini-chip--sp">SharePoint 5</span>' +
                '<span class="tour-mini-chip tour-mini-chip--cal">Meetings</span>' +
                '<span class="tour-mini-chip tour-mini-chip--mail">Emails</span>' +
                '<span class="tour-mini-chip tour-mini-chip--foundry">Foundry IQ 13</span>' +
                '<span class="tour-mini-chip tour-mini-chip--fabric">Fabric IQ 4</span>' +
                '</div>' +
                '<p class="tour-tip">This is the proof of <strong>real workflow intelligence</strong> — not generic prompt engineering. The AI knows your city\'s operational context.</p>',
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
              title: `${SVG_FABRIC}<span style="vertical-align:middle">Fabric IQ — Operational Data Intelligence</span>`,
              description:
                '<p><strong>Fabric IQ</strong> connects grant strategy to your city\'s real financial and operational data via <strong>Microsoft Fabric</strong> semantic models.</p>' +
                '<ul class="tour-feature-list">' +
                '<li><strong>Semantic models</strong> — grant lifecycle, disbursement facts, milestone tracking</li>' +
                '<li><strong>Dim tables</strong> — agency, city, program, and grant reference data</li>' +
                '<li><strong>Ontology</strong> — grant lifecycle knowledge graph for structured reasoning</li>' +
                '<li>Enables claims like: <em>"Your city has a 94% compliance rate on past federal grants"</em> — backed by real Fabric data</li>' +
                '</ul>' +
                '<p class="tour-tip">Demo line: <em>"Fabric IQ is what separates a smart chatbot from a true municipal intelligence platform."</em></p>',
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
                '<p class="tour-final-text">Three intelligence layers — unified into one municipal grant workflow.</p>' +
                '<div class="tour-iq-trio">' +
                `<div class="tour-iq-card tour-iq-card--foundry"><div class="tour-iq-icon">${SVG_FOUNDRY}</div><strong>Foundry IQ</strong><span>GPT-4o + AI Search grounded retrieval</span></div>` +
                `<div class="tour-iq-card tour-iq-card--workiq"><div class="tour-iq-icon">${SVG_WORKIQ}</div><strong>Work IQ</strong><span>SharePoint, Meetings, Emails, Teams</span></div>` +
                `<div class="tour-iq-card tour-iq-card--fabric"><div class="tour-iq-icon">${SVG_FABRIC}</div><strong>Fabric IQ</strong><span>Semantic models + operational data</span></div>` +
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
