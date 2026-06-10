import { useEffect, useMemo, useState } from "react";
import { IconCheck, IconDownload } from "./Icons";
import { fetchCityContext, refreshCityContext } from "../api";
import type { WorkIqCityContext } from "../types";
import "./WorkIqPanel.css";

interface Milestone {
  week: number;
  task: string;
  owner?: string;
}

export interface WorkIqPanelProps {
  grantName: string;
  agency: string;
  deadline: string;
  milestones?: Milestone[];
  actionItems?: string[];
  cityContext?: WorkIqCityContext;
}

interface PlanTask {
  title: string;
  due: Date | null;
  owner?: string;
  kind: "milestone" | "action" | "deadline";
}

const MS_PER_WEEK = 7 * 86400000;

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** YYYYMMDD for all-day iCalendar DATE values (UTC). */
function icsDate(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

/** Full UTC timestamp for DTSTAMP. */
function icsStamp(d: Date): string {
  return `${icsDate(d)}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** Escape per RFC 5545 (commas, semicolons, newlines). */
function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function triggerDownload(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "grant";
}

/**
 * WorkIqPanel — Action Plan & Calendar Export for an analyzed grant.
 *
 * Turns the analysis deadline + the reasoning agent's weekly milestones into a
 * downloadable work plan. 100% client-side (no auth, no tenant setup):
 *  - "Add to Calendar" builds an RFC-5545 .ics with the grant deadline (7-day
 *    reminder) plus every milestone scheduled by week.
 *  - "Export Task List" downloads a plain-text (.txt) checklist for To Do / planners.
 *
 * NOTE: this is local file generation only — it does NOT call M365 Graph or any
 * calendar/task backend. It is the action-plan/export step of the UI, not a
 * separate "IQ layer" or server-side integration.
 */
export function WorkIqPanel({ grantName, agency, deadline, milestones, actionItems, cityContext }: WorkIqPanelProps) {
  const [synced, setSynced] = useState(false);
  const [context, setContext] = useState<WorkIqCityContext | undefined>(cityContext);
  const [refreshing, setRefreshing] = useState(false);

  const { tasks, deadlineDate } = useMemo(() => {
    const dlTime = new Date(deadline).getTime();
    const hasDeadline = !Number.isNaN(dlTime);
    const dl = hasDeadline ? new Date(dlTime) : null;
    const now = Date.now();

    const ms: Milestone[] = (milestones ?? []).filter((m) => m && m.task);
    const sorted = [...ms].sort((a, b) => (a.week ?? 0) - (b.week ?? 0));

    const out: PlanTask[] = [];

    if (sorted.length > 0) {
      const maxWeek = Math.max(...sorted.map((m) => m.week ?? 1));
      for (const m of sorted) {
        // Back-schedule from the deadline when we have one; else forward from today.
        let due: Date | null = null;
        if (dl) {
          due = new Date(dl.getTime() - (maxWeek - (m.week ?? 1)) * MS_PER_WEEK);
        } else {
          due = new Date(now + (m.week ?? 1) * MS_PER_WEEK);
        }
        out.push({ title: m.task.replace(/\*\*/g, ""), due, owner: m.owner, kind: "milestone" });
      }
    } else if (actionItems && actionItems.length > 0) {
      // Fallback: evenly space action items between now and the deadline.
      const items = actionItems.slice(0, 6);
      items.forEach((item, i) => {
        let due: Date | null = null;
        if (dl) {
          const span = dl.getTime() - now;
          due = new Date(now + (span * (i + 1)) / (items.length + 1));
        } else {
          due = new Date(now + (i + 1) * MS_PER_WEEK);
        }
        out.push({ title: item.replace(/\*\*/g, "").replace(/\*/g, ""), due, kind: "action" });
      });
    }

    return { tasks: out, deadlineDate: dl };
  }, [deadline, milestones, actionItems]);

  useEffect(() => {
    if (cityContext) setContext(cityContext);
  }, [cityContext]);

  const handleRefreshContext = async () => {
    setRefreshing(true);
    try {
      setContext(await refreshCityContext());
    } finally {
      setRefreshing(false);
    }
  };

  const handleLoadContext = async () => {
    setRefreshing(true);
    try {
      setContext(await fetchCityContext());
    } finally {
      setRefreshing(false);
    }
  };

  if (tasks.length === 0 && !deadlineDate) return null;

  const fmt = (d: Date | null) =>
    d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "TBD";

  const handleAddToCalendar = () => {
    const stamp = icsStamp(new Date());
    const lines: string[] = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//CivicGrant IQ//Work IQ//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
    ];

    const addEvent = (uid: string, start: Date, summary: string, desc: string, alarmDays?: number) => {
      const end = new Date(start.getTime() + 86400000);
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${uid}@civicgrant-iq`);
      lines.push(`DTSTAMP:${stamp}`);
      lines.push(`DTSTART;VALUE=DATE:${icsDate(start)}`);
      lines.push(`DTEND;VALUE=DATE:${icsDate(end)}`);
      lines.push(`SUMMARY:${icsEscape(summary)}`);
      lines.push(`DESCRIPTION:${icsEscape(desc)}`);
      if (alarmDays) {
        lines.push("BEGIN:VALARM");
        lines.push(`TRIGGER:-P${alarmDays}D`);
        lines.push("ACTION:DISPLAY");
        lines.push(`DESCRIPTION:${icsEscape(`Reminder: ${summary}`)}`);
        lines.push("END:VALARM");
      }
      lines.push("END:VEVENT");
    };

    tasks.forEach((t, i) => {
      if (!t.due) return;
      addEvent(
        `civicgrant-${slugify(grantName)}-task-${i}`,
        t.due,
        `${grantName}: ${t.title}`,
        `${t.kind === "milestone" ? "Milestone" : "Action item"} for the ${grantName} application (${agency}).${t.owner ? ` Owner: ${t.owner}.` : ""}`,
        2
      );
    });

    if (deadlineDate) {
      addEvent(
        `civicgrant-${slugify(grantName)}-deadline`,
        deadlineDate,
        `⏰ ${grantName} — APPLICATION DEADLINE`,
        `Final submission deadline for the ${grantName} grant (${agency}). Generated by CivicGrant IQ.`,
        7
      );
    }

    lines.push("END:VCALENDAR");
    triggerDownload(`${slugify(grantName)}-workplan.ics`, lines.join("\r\n"), "text/calendar;charset=utf-8");
    setSynced(true);
    setTimeout(() => setSynced(false), 2600);
  };

  const handleExportTasks = () => {
    const header = `CivicGrant IQ — Work Plan\n${grantName} (${agency})\n${deadlineDate ? `Deadline: ${deadlineDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}` : "Deadline: see NOFO"}\n${"=".repeat(48)}\n\n`;
    const body = tasks
      .map((t, i) => `[ ] ${String(i + 1).padStart(2, "0")}. ${t.title}\n        Due: ${t.due ? t.due.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "TBD"}${t.owner ? `  ·  Owner: ${t.owner}` : ""}`)
      .join("\n\n");
    triggerDownload(`${slugify(grantName)}-tasks.txt`, header + body + "\n", "text/plain;charset=utf-8");
  };

  return (
    <div className="workiq-panel">
      <div className="workiq-head">
        <div className="workiq-head-left">
          <span className="workiq-badge">Action Plan</span>
          <span className="workiq-title">Calendar &amp; Task Export</span>
        </div>
        <span className="workiq-sub">{tasks.length} task{tasks.length === 1 ? "" : "s"}{deadlineDate ? " scheduled to deadline" : " on your timeline"}</span>
      </div>

      <div className="workiq-context">
        <div className="workiq-context-head">
          <span className={`workiq-dot workiq-dot--${context?.source === "sharepoint" ? "live" : "fallback"}`} aria-hidden="true" />
          <span className="workiq-context-title">Microsoft 365 Work IQ</span>
          <span className="workiq-context-meta">
            {context ? `${context.filesRead.length} file${context.filesRead.length === 1 ? "" : "s"} · ${new Date(context.pulledAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : "Not loaded"}
          </span>
          <button className="workiq-refresh" onClick={context ? handleRefreshContext : handleLoadContext} disabled={refreshing}>
            {refreshing ? "Refreshing" : context ? "Refresh" : "Load"}
          </button>
        </div>
        {context && (
          <>
            <div className="workiq-pills">
              {context.priorityThemes.slice(0, 5).map((theme) => <span key={theme} className="workiq-pill">{theme}</span>)}
            </div>
            {context.activeProjects.length > 0 && (
              <ul className="workiq-projects">
                {context.activeProjects.slice(0, 3).map((project) => (
                  <li key={project.name}>{project.name}{project.budget ? ` · ${project.budget}` : ""}{project.status ? ` — ${project.status}` : ""}</li>
                ))}
              </ul>
            )}
            {/* Live M365 signals — calendar, Teams, mail */}
            {(context.calendarEvents?.length || context.teamsInsights?.length || context.mailSignals?.length) ? (
              <div className="workiq-live-signals">
                <span className="workiq-live-label">Live M365 Signals</span>
                {context.calendarEvents?.length ? (
                  <div className="workiq-signal-group">
                    <span className="workiq-signal-icon">📅</span>
                    <ul className="workiq-signal-list">
                      {context.calendarEvents.slice(0, 4).map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </div>
                ) : null}
                {context.teamsInsights?.length ? (
                  <div className="workiq-signal-group">
                    <span className="workiq-signal-icon">💬</span>
                    <ul className="workiq-signal-list">
                      {context.teamsInsights.slice(0, 3).map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                  </div>
                ) : null}
                {context.mailSignals?.length ? (
                  <div className="workiq-signal-group">
                    <span className="workiq-signal-icon">✉️</span>
                    <ul className="workiq-signal-list">
                      {context.mailSignals.slice(0, 3).map((m, i) => <li key={i}>{m}</li>)}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
            {/* Risk signals from past rejected applications */}
            {context.riskSignals.length > 0 && (
              <div className="workiq-risks">
                <span className="workiq-risks-label">⚠ Lessons from Past Applications</span>
                <ul className="workiq-risk-list">
                  {context.riskSignals.slice(0, 3).map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}
            {context.error && <p className="workiq-context-error">Fallback active: {context.error}</p>}
          </>
        )}
      </div>

      <ul className="workiq-tasks">
        {tasks.map((t, i) => (
          <li key={i} className={`workiq-task workiq-task--${t.kind}`}>
            <span className="workiq-check" aria-hidden="true" />
            <span className="workiq-task-body">
              <span className="workiq-task-title">{t.title}</span>
              {t.owner && <span className="workiq-task-owner">{t.owner}</span>}
            </span>
            <span className="workiq-task-due">{fmt(t.due)}</span>
          </li>
        ))}
        {deadlineDate && (
          <li className="workiq-task workiq-task--deadline">
            <span className="workiq-check workiq-check--deadline" aria-hidden="true" />
            <span className="workiq-task-body">
              <span className="workiq-task-title">Application deadline — submit</span>
            </span>
            <span className="workiq-task-due workiq-task-due--deadline">{fmt(deadlineDate)}</span>
          </li>
        )}
      </ul>

      <div className="workiq-actions">
        <button className={`workiq-btn workiq-btn--primary ${synced ? "workiq-btn--synced" : ""}`} onClick={handleAddToCalendar}>
          {synced ? <><IconCheck size={13} /> Calendar exported</> : <><IconDownload size={13} /> Add to Calendar (.ics)</>}
        </button>
        <button className="workiq-btn workiq-btn--secondary" onClick={handleExportTasks}>
          <IconDownload size={13} /> Export Task List
        </button>
      </div>
    </div>
  );
}
