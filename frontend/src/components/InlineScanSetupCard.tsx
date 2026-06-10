import { useState, useEffect, useRef } from "react";
import type { CityProfile } from "../types";
import { fetchCityContext } from "../api";
import "./InlineScanSetupCard.css";

// Maps focus area → keywords for auto-filtering Work IQ projects
const FOCUS_TO_KW: Record<string, string[]> = {
  "Transportation & Infrastructure": ["road", "intersection", "bridge", "sidewalk", "ada", "trail", "bike", "traffic", "signal", "transit"],
  "Water & Sewer":                    ["water", "sewer", "stormwater", "flood", "lead", "culvert", "drainage"],
  "Environmental / Climate":          ["stormwater", "flood", "green", "environmental", "remediation", "energy", "solar"],
  "Affordable Housing":               ["housing", "affordable", "revitalization", "downtown", "community"],
  "Parks & Recreation":               ["park", "recreation", "trail", "open space", "library"],
  "Economic Development":             ["economic", "workforce", "development", "downtown", "broadband"],
  "Public Safety":                    ["fire", "ems", "police", "emergency", "fleet"],
  "Broadband / Digital Equity":       ["broadband", "digital", "technology", "smart"],
  "Public Health":                    ["health", "public health"],
  "Historic Preservation":            ["historic", "preservation"],
};

const FOCUS_OPTIONS = [
  "Transportation & Infrastructure",
  "Water & Sewer",
  "Environmental / Climate",
  "Parks & Recreation",
  "Affordable Housing",
  "Economic Development",
  "Public Safety",
  "Broadband / Digital Equity",
  "Public Health",
  "Historic Preservation",
];

const CITY_SIZE_OPTIONS = [
  { label: "Village / Hamlet", sub: "< 2,500",    value: 1200 },
  { label: "Small Town",       sub: "2.5K-10K",   value: 6000 },
  { label: "Suburb / Township",sub: "10K-50K",    value: 28000 },
  { label: "Mid-Size City",    sub: "50K-250K",   value: 100000 },
  { label: "Large City",       sub: "250K+",       value: 400000 },
];

const PROJECT_ITEMS = [
  "Road & intersection improvements",
  "Bridge rehabilitation",
  "Sidewalk & ADA upgrades",
  "Trail & bike infrastructure",
  "Traffic signal modernization",
  "Water main replacement",
  "Sewer rehabilitation",
  "Stormwater & flood mitigation",
  "Lead service line replacement",
  "Green infrastructure",
  "Affordable housing development",
  "Downtown revitalization",
  "Park & recreation improvements",
  "Community center / library",
  "Historic preservation",
  "Broadband / digital equity",
  "Fire / EMS facility",
  "Emergency management",
  "Energy efficiency / solar",
  "Economic development program",
];

function filterByFocus(items: string[], focus: string[]): string[] {
  if (!focus.length) return [];
  const kws = focus.flatMap((f) => FOCUS_TO_KW[f] ?? []);
  return items.filter((p) => kws.some((k) => p.toLowerCase().includes(k)));
}

interface Props {
  onConfirm: (profile: CityProfile) => void;
  onDismiss?: () => void;
  disabled?: boolean;
}

export function InlineScanSetupCard({ onConfirm, onDismiss, disabled }: Props) {
  const [cityName, setCityName] = useState("");
  const [state, setState] = useState("");
  const [citySize, setCitySize] = useState<number | null>(null);
  const [focusAreas, setFocusAreas] = useState<string[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [workIqStatus, setWorkIqStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [workIqSource, setWorkIqSource] = useState<string | null>(null);
  const [showProjects, setShowProjects] = useState(false);
  const [wiqJustUpdated, setWiqJustUpdated] = useState(false);
  const allWorkIqProjects = useRef<string[]>([]);
  const cityRef = useRef<HTMLInputElement>(null);

  // Auto-load Work IQ on mount — store projects but don't pre-select until user picks focus areas
  useEffect(() => {
    setWorkIqStatus("loading");
    fetchCityContext()
      .then((ctx) => {
        const matched = new Set<string>();
        for (const proj of ctx.activeProjects) {
          const needle = proj.name.toLowerCase();
          for (const item of PROJECT_ITEMS) {
            const words = needle.split(/\s+/).filter((w) => w.length > 3);
            if (item.toLowerCase().includes(needle) || words.some((w) => item.toLowerCase().includes(w))) {
              matched.add(item);
            }
          }
        }
        allWorkIqProjects.current = matched.size > 0 ? Array.from(matched) : [];
        setWorkIqSource(ctx.source);
        setWorkIqStatus("loaded");
      })
      .catch(() => {
        setWorkIqStatus("error");
      });
    setTimeout(() => cityRef.current?.focus(), 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-filter projects whenever focus areas change
  useEffect(() => {
    if (focusAreas.length === 0) {
      setSelectedProjects([]);
      return;
    }
    const base = allWorkIqProjects.current.length > 0 ? allWorkIqProjects.current : PROJECT_ITEMS;
    const filtered = filterByFocus(base, focusAreas);
    setSelectedProjects(filtered);
    // Flash the Work IQ callout to show it just updated
    if (workIqStatus === "loaded" || workIqStatus === "error") {
      setWiqJustUpdated(true);
      setTimeout(() => setWiqJustUpdated(false), 1400);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusAreas]);

  const toggleFocus = (area: string) => {
    setFocusAreas((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]
    );
  };

  const toggleProject = (item: string) => {
    setSelectedProjects((prev) =>
      prev.includes(item) ? prev.filter((p) => p !== item) : [...prev, item]
    );
  };

  const canSubmit = cityName.trim().length > 0 && state.trim().length > 0 && focusAreas.length > 0;

  const handleSubmit = () => {
    if (!canSubmit || disabled) return;
    onConfirm({
      cityName: cityName.trim(),
      state: state.trim(),
      population: citySize ?? 0,
      focusAreas,
      currentProjects: selectedProjects.join(", "),
    });
  };

  return (
    <div className="issc-root">
      <div className="issc-header">
        <div className="issc-header-bg" aria-hidden="true" />
        <div className="issc-header-content">
          <div className="issc-badge">
            <span className="issc-badge-icon">◉</span>
            <span>Scan My City</span>
          </div>
          <div className="issc-headline">Portfolio Analysis Setup</div>
          <div className="issc-sub">
            Configure your city profile — the AI will run 5 parallel grant analyses tuned to your priorities
          </div>
        </div>
        <div className="issc-wiq-status">
          {workIqStatus === "loading" && (
            <div className="issc-wiq-pill issc-wiq-pill--loading">
              <span className="issc-wiq-dot issc-wiq-dot--pulse" />Work IQ loading…
            </div>
          )}
          {workIqStatus === "loaded" && (
            <div className="issc-wiq-pill issc-wiq-pill--done">
              <span className="issc-wiq-dot issc-wiq-dot--on" />
              Work IQ · {workIqSource === "sharepoint" ? "SharePoint" : "Local KB"}
            </div>
          )}
          {workIqStatus === "error" && (
            <div className="issc-wiq-pill issc-wiq-pill--warn">
              ⚠ Work IQ offline
            </div>
          )}
        </div>
      </div>

      <div className="issc-body">
        {/* ── City fields ── */}
        <div className="issc-row">
          <div className="issc-field issc-field--city">
            <label className="issc-label">City / Village / Municipality Name</label>
            <input
              ref={cityRef}
              className="issc-input"
              placeholder="e.g. Buffalo Grove"
              value={cityName}
              onChange={(e) => setCityName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && canSubmit && handleSubmit()}
              disabled={disabled}
            />
          </div>
          <div className="issc-field issc-field--state">
            <label className="issc-label">State</label>
            <input
              className="issc-input"
              placeholder="IL"
              value={state}
              maxLength={2}
              onChange={(e) => setState(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && canSubmit && handleSubmit()}
              disabled={disabled}
            />
          </div>
        </div>

        {/* ── City Size ── */}
        <div className="issc-section">
          <div className="issc-section-label">
            Municipality Size
            <span className="issc-section-note">affects grant program eligibility thresholds</span>
          </div>
          <div className="issc-size-chips">
            {CITY_SIZE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`issc-size-chip${citySize === opt.value ? " issc-size-chip--on" : ""}`}
                onClick={() => setCitySize(citySize === opt.value ? null : opt.value)}
                disabled={disabled}
              >
                <span className="issc-size-chip-label">{opt.label}</span>
                <span className="issc-size-chip-sub">{opt.sub}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Focus Areas ── */}
        <div className="issc-section">
          <div className="issc-section-label">
            Priority Focus Areas
            <span className="issc-section-note">selecting a priority auto-updates active projects below</span>
          </div>
          {focusAreas.length === 0 && (
            <div className="issc-focus-hint">Select at least one — the scan targets grants matching your priorities</div>
          )}
          <div className="issc-chips">
            {FOCUS_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                className={`issc-chip${focusAreas.includes(opt) ? " issc-chip--on" : ""}`}
                onClick={() => toggleFocus(opt)}
                disabled={disabled}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        {/* ── Work IQ Projects ── */}
        <div className="issc-section">
          {/* Prominent Work IQ callout — shows the connection: priorities → auto-matched projects */}
          {(workIqStatus === "loaded" || workIqStatus === "error") && focusAreas.length > 0 && (
            <div className={`issc-wiq-callout${wiqJustUpdated ? " issc-wiq-callout--flash" : ""}`}>
              <div className="issc-wiq-callout-left">
                <span className={`issc-wiq-dot${workIqStatus === "loaded" ? " issc-wiq-dot--on" : " issc-wiq-dot--warn"}`} />
                <span className="issc-wiq-callout-text">
                  {workIqStatus === "loaded"
                    ? `Work IQ (${workIqSource === "sharepoint" ? "SharePoint" : "Local KB"}) auto-matched ${selectedProjects.length} active project${selectedProjects.length !== 1 ? "s" : ""} from your selected priorities`
                    : `Projects auto-filtered from standard catalog based on your ${focusAreas.length} selected priorities`}
                </span>
              </div>
              {wiqJustUpdated && (
                <span className="issc-wiq-callout-updated">Updated</span>
              )}
            </div>
          )}
          <button
            type="button"
            className="issc-section-toggle"
            onClick={() => setShowProjects((s) => !s)}
          >
            <span className="issc-section-label issc-section-label--inline">
              Active Projects / Priorities
              {selectedProjects.length > 0 && (
                <span className="issc-proj-count">{selectedProjects.length} matched</span>
              )}
              {focusAreas.length > 0 && selectedProjects.length === 0 && (
                <span className="issc-proj-count issc-proj-count--none">none matched — add manually</span>
              )}
            </span>
            <span className="issc-toggle-chevron">{showProjects ? "▲" : "▼"}</span>
          </button>
          {showProjects && (
            <div className="issc-project-chips">
              {PROJECT_ITEMS.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`issc-proj-chip${selectedProjects.includes(item) ? " issc-proj-chip--on" : ""}`}
                  onClick={() => toggleProject(item)}
                  disabled={disabled}
                >
                  {item}
                </button>
              ))}
            </div>
          )}
          {!showProjects && selectedProjects.length > 0 && (
            <div className="issc-proj-preview">
              {selectedProjects.slice(0, 5).map((p) => (
                <span key={p} className="issc-proj-preview-tag">{p}</span>
              ))}
              {selectedProjects.length > 5 && (
                <span className="issc-proj-preview-more">+{selectedProjects.length - 5} more</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="issc-footer">
        {onDismiss && (
          <button type="button" className="issc-dismiss-btn" onClick={onDismiss} disabled={disabled}>
            Cancel
          </button>
        )}
        <button
          type="button"
          className={`issc-submit-btn${canSubmit ? "" : " issc-submit-btn--disabled"}`}
          onClick={handleSubmit}
          disabled={!canSubmit || disabled}
        >
          <span className="issc-submit-icon">◉</span>
          Run Portfolio Scan
          {focusAreas.length > 0 && (
            <span className="issc-submit-meta">{focusAreas.length} focus area{focusAreas.length !== 1 ? "s" : ""}</span>
          )}
        </button>
      </div>
    </div>
  );
}
