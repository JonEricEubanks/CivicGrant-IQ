import { useState, useEffect, useRef } from "react";
import type { CityProfile } from "../types";
import { fetchCityContext } from "../api";
import { IconBuilding, IconSearch, IconChevronDown } from "./Icons";
import "./GrantScanner.css";

// Maps each focus area → project keywords for auto-filtering Work IQ projects
const FOCUS_TO_PROJECT_KEYWORDS: Record<string, string[]> = {
  "Transportation & Infrastructure": ["road", "intersection", "bridge", "sidewalk", "ada", "trail", "bike", "traffic", "signal", "transit", "mobility"],
  "Water & Sewer":                    ["water", "sewer", "stormwater", "flood", "lead", "culvert", "drainage"],
  "Environmental / Climate":          ["stormwater", "flood", "green infrastructure", "environmental", "remediation", "energy", "solar"],
  "Affordable Housing":               ["housing", "affordable", "revitalization", "downtown", "community center"],
  "Parks & Recreation":               ["park", "recreation", "trail", "open space", "library"],
  "Economic Development":             ["economic", "workforce", "development", "downtown", "revitalization", "broadband"],
  "Public Safety":                    ["fire", "ems", "police", "emergency", "fleet", "equipment"],
  "Broadband / Digital Equity":       ["broadband", "digital", "technology", "smart city"],
  "Public Health":                    ["health", "public health"],
  "Historic Preservation":            ["historic", "preservation"],
};

function filterProjectsByFocus(projects: string[], focusAreas: string[]): string[] {
  if (focusAreas.length === 0 || projects.length === 0) return [];
  const keywords = focusAreas.flatMap((f) => FOCUS_TO_PROJECT_KEYWORDS[f] ?? [f.toLowerCase().split(" & ")[0]]);
  return projects.filter((p) => keywords.some((kw) => p.toLowerCase().includes(kw)));
}

const FOCUS_AREA_OPTIONS = [
  "Transportation & Infrastructure",
  "Affordable Housing",
  "Water & Sewer",
  "Economic Development",
  "Public Safety",
  "Parks & Recreation",
  "Environmental / Climate",
  "Broadband / Digital Equity",
  "Public Health",
  "Historic Preservation",
];

// Grouped project/initiative options — covers capital, programs, planning
const PROJECT_GROUPS: { label: string; items: string[] }[] = [
  {
    label: "Roads & Mobility",
    items: [
      "Road & intersection improvements",
      "Bridge rehabilitation",
      "Sidewalk & ADA upgrades",
      "Trail & bike infrastructure",
      "Traffic signal modernization",
      "Transit & mobility services",
    ],
  },
  {
    label: "Water & Environment",
    items: [
      "Water main replacement",
      "Sewer rehabilitation",
      "Stormwater & flood mitigation",
      "Lead service line replacement",
      "Environmental remediation",
      "Green infrastructure",
    ],
  },
  {
    label: "Community & Housing",
    items: [
      "Affordable housing development",
      "Downtown revitalization",
      "Park & recreation improvements",
      "Community center / library",
      "Historic preservation",
      "Broadband / digital equity",
    ],
  },
  {
    label: "Public Safety & Facilities",
    items: [
      "Fire / EMS facility",
      "Police facility",
      "Fleet & equipment upgrades",
      "Emergency management",
      "Public health programs",
    ],
  },
  {
    label: "Planning & Programs",
    items: [
      "Comprehensive / master plan",
      "Economic development program",
      "Workforce development",
      "Energy efficiency / solar",
      "Smart city / technology",
    ],
  },
];

const DEFAULT_PROJECTS = [
  "Road & intersection improvements",
  "Trail & bike infrastructure",
  "Stormwater & flood mitigation",
  "Water main replacement",
];

// Groups that have pre-selected items start open
const DEFAULT_OPEN_GROUPS = new Set<string>();

interface Props {
  onScan: (profile: CityProfile) => void;
  onFocusChange?: (areas: string[]) => void;
  isLoading: boolean;
  collapsed?: boolean;
  onExpand?: () => void;
  onCollapse?: () => void;
}

export function GrantScanner({ onScan, onFocusChange, isLoading, collapsed, onExpand, onCollapse }: Props) {
  const [cityName, setCityName] = useState("");
  const [state, setState] = useState("");
  const [focusAreas, setFocusAreas] = useState<string[]>([]);
  const [focusOpen, setFocusOpen] = useState(true);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(DEFAULT_OPEN_GROUPS);
  const [useWorkIq, setUseWorkIq] = useState(false);
  const [workIqLoading, setWorkIqLoading] = useState(false);
  const [workIqSource, setWorkIqSource] = useState<string | null>(null);
  const autoTriggered = useRef(false);
  // Stores all Work IQ fetched projects — used to re-filter when focus areas change
  const workIqProjectsRef = useRef<string[]>([]);

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const toggleFocus = (area: string) => {
    const next = focusAreas.includes(area)
      ? focusAreas.filter((a) => a !== area)
      : [...focusAreas, area];
    setFocusAreas(next);
    onFocusChange?.(next);
    if (next.length === 0) setSelectedProjects([]);
  };

  const toggleProject = (item: string) => {
    setSelectedProjects((prev) =>
      prev.includes(item) ? prev.filter((p) => p !== item) : [...prev, item]
    );
  };

  const handleToggleWorkIq = async () => {
    if (useWorkIq) {
      setUseWorkIq(false);
      setWorkIqSource(null);
      workIqProjectsRef.current = [];
      setSelectedProjects([]);
      return;
    }
    setWorkIqLoading(true);
    try {
      const ctx = await fetchCityContext();
      const allItems = PROJECT_GROUPS.flatMap((g) => g.items);
      const matched = new Set<string>();
      for (const proj of ctx.activeProjects) {
        const needle = proj.name.toLowerCase();
        for (const item of allItems) {
          const hay = item.toLowerCase();
          const needleWords = needle.split(/\s+/).filter((w) => w.length > 3);
          if (hay.includes(needle) || needle.includes(hay) ||
              needleWords.some((w) => hay.includes(w))) {
            matched.add(item);
          }
        }
      }
      const allMatched = matched.size > 0 ? Array.from(matched) : DEFAULT_PROJECTS;
      workIqProjectsRef.current = allMatched;
      // Filter immediately to current focus areas
      const filtered = filterProjectsByFocus(allMatched, focusAreas);
      setSelectedProjects(filtered.length > 0 ? filtered : allMatched);
      setWorkIqSource(ctx.source);
      setUseWorkIq(true);
    } catch {
      setSelectedProjects(DEFAULT_PROJECTS);
    } finally {
      setWorkIqLoading(false);
    }
  };

  // Auto-activate Work IQ on first mount
  useEffect(() => {
    if (autoTriggered.current) return;
    autoTriggered.current = true;
    handleToggleWorkIq();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When focus areas change and Work IQ is active, re-filter selected projects
  useEffect(() => {
    if (!useWorkIq || workIqProjectsRef.current.length === 0) return;
    const filtered = filterProjectsByFocus(workIqProjectsRef.current, focusAreas);
    setSelectedProjects(filtered.length > 0 ? filtered : []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusAreas]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cityName || !state || focusAreas.length === 0) return;
    onScan({
      cityName,
      state,
      population: 0,
      focusAreas,
      currentProjects: selectedProjects.join(", "),
    });
  };

  if (collapsed) {
    return (
      <div className="grant-scanner grant-scanner--collapsed" onClick={onExpand} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onExpand?.()}>
        <div className="scanner-profile-header scanner-profile-header--collapsed">
          <div className="scanner-profile-header-row">
            <div className="scanner-profile-label">
              <IconBuilding size={13} />
              <span>City Profile</span>
            </div>
            <span className="scanner-collapsed-edit">
              <IconChevronDown size={13} /> Edit profile
            </span>
          </div>
          <div className="scanner-profile-city">
            {cityName
              ? <>{cityName}{state ? <span className="scanner-profile-state">, {state}</span> : null}</>
              : <span className="scanner-profile-placeholder">Enter your city</span>}
          </div>
          {focusAreas.length > 0 && (
            <div className="scanner-collapsed-pills-dark">
              {focusAreas.map((a) => <span key={a} className="scanner-collapsed-pill-dark">{a}</span>)}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <form className="grant-scanner" onSubmit={handleSubmit}>
      {/* Dark city identity header */}
      <div className="scanner-profile-header">
        <div className="scanner-profile-header-row">
          <div className="scanner-profile-label">
            <IconBuilding size={13} />
            <span>City Profile</span>
          </div>
          {onCollapse && (
            <button type="button" className="scanner-collapse-btn" onClick={onCollapse} aria-label="Collapse scanner">
              ↑ Collapse
            </button>
          )}
        </div>
        <div className="scanner-profile-city">
          {cityName
            ? <>{cityName}{state ? <span className="scanner-profile-state">, {state}</span> : null}</>
            : <span className="scanner-profile-placeholder">Enter your city</span>}
        </div>

      </div>

      {/* Form body — compact */}
      <div className="scanner-body">

        {/* City / State inline */}
        <div className="scanner-inline-row">
          <label htmlFor="scanner-city" className="sr-only">City name</label>
          <input
            id="scanner-city"
            className="scanner-inline-city"
            type="text"
            value={cityName}
            onChange={(e) => setCityName(e.target.value)}
            placeholder="City name"
            required
            aria-required="true"
          />
          <label htmlFor="scanner-state" className="sr-only">State abbreviation</label>
          <input
            id="scanner-state"
            className="scanner-inline-state"
            type="text"
            value={state}
            onChange={(e) => setState(e.target.value)}
            placeholder="ST"
            required
            aria-required="true"
            maxLength={2}
          />
        </div>

        {/* Focus Areas */}
        <div className="focus-section">
          <div className="focus-section-header-row">
            <button
              type="button"
              className="focus-section-header"
              onClick={() => setFocusOpen((o) => !o)}
              aria-expanded={focusOpen}
            >
              <span className="focus-section-title">Focus Areas *</span>
              {focusAreas.length > 0 && (
                <span className="project-group-badge">{focusAreas.length} selected</span>
              )}
              <span className={`project-group-chevron${focusOpen ? " project-group-chevron--open" : ""}`}>
                <IconChevronDown size={13} aria-hidden />
              </span>
            </button>
            {focusAreas.length > 0 && (
              <button
                type="button"
                className="section-clear-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setFocusAreas([]);
                  setSelectedProjects([]);
                  onFocusChange?.([]);
                }}
              >Clear</button>
            )}
          </div>
          {focusOpen ? (
            <div className="focus-chips-expanded">
              {FOCUS_AREA_OPTIONS.map((area) => (
                <button
                  key={area}
                  type="button"
                  className={`chip chip--sm ${focusAreas.includes(area) ? "chip--active" : ""}`}
                  onClick={() => toggleFocus(area)}
                  aria-pressed={focusAreas.includes(area)}
                  aria-label={`${focusAreas.includes(area) ? "Deselect" : "Select"} ${area}`}
                >{area}</button>
              ))}
            </div>
          ) : focusAreas.length > 0 ? (
            <div className="focus-preview-row">
              {focusAreas.map((a) => <span key={a} className="focus-preview-pill">{a}</span>)}
            </div>
          ) : (
            <div className="focus-empty-hint">Tap to select at least one area</div>
          )}
        </div>

        {/* Active Projects */}
        <div className="focus-section">
          <div className="focus-section-header-row">
            <button
              type="button"
              className="focus-section-header"
              onClick={() => setProjectsOpen((o) => !o)}
              aria-expanded={projectsOpen}
            >
              <span className="focus-section-title">Active Projects</span>
              {useWorkIq && (
                <span className="workiq-badge">✦ Work IQ{workIqSource === "sharepoint" ? " (SharePoint)" : " (AI)"}</span>
              )}
              {workIqLoading && <span className="workiq-badge">✦ Loading…</span>}
              {selectedProjects.length > 0 && (
                <span className="project-group-badge">{selectedProjects.length} selected</span>
              )}
              <span className={`project-group-chevron${projectsOpen ? " project-group-chevron--open" : ""}`}>
                <IconChevronDown size={13} aria-hidden />
              </span>
            </button>
            <button
              type="button"
              className={`workiq-toggle-btn${useWorkIq ? " workiq-toggle-btn--active" : ""}`}
              onClick={(e) => { e.stopPropagation(); handleToggleWorkIq(); }}
              disabled={workIqLoading}              aria-label={useWorkIq ? "Disable Work IQ auto-selection" : "Enable Work IQ auto-selection from SharePoint"}
              aria-pressed={useWorkIq}            >
              {workIqLoading ? "…" : useWorkIq ? "✦ On" : "Work IQ"}
            </button>
          </div>
          {projectsOpen ? (
            <div className="projects-expanded">
              <div className="project-groups">
                {PROJECT_GROUPS.map((group) => {
                  const groupSelected = group.items.filter((i) => selectedProjects.includes(i));
                  const isOpen = openGroups.has(group.label);
                  return (
                    <div key={group.label} className="project-group">
                      <button
                        type="button"
                        className="project-group-header"
                        onClick={() => toggleGroup(group.label)}
                        aria-expanded={isOpen}
                      >
                        <span className="project-group-title">{group.label}</span>
                        {groupSelected.length > 0 && <span className="project-group-badge">{groupSelected.length}</span>}
                        <span className={`project-group-chevron${isOpen ? " project-group-chevron--open" : ""}`}>
                          <IconChevronDown size={13} />
                        </span>
                      </button>
                      {isOpen && (
                        <div className="project-group-chips">
                          {group.items.map((item) => (
                            <button
                              key={item}
                              type="button"
                              className={`chip chip--sm${selectedProjects.includes(item) ? " chip--active" : ""}`}
                              onClick={() => toggleProject(item)}
                            >{item}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {selectedProjects.length > 0 && (
                <div className="project-selected-summary">
                  <span className="project-selected-count">{selectedProjects.length} selected</span>
                  <button type="button" className="project-clear-btn" onClick={() => setSelectedProjects([])}>Clear all</button>
                </div>
              )}
            </div>
          ) : selectedProjects.length > 0 ? (
            <div className="focus-preview-row">
              {selectedProjects.map((p) => <span key={p} className="focus-preview-pill">{p}</span>)}
            </div>
          ) : (
            <div className="focus-empty-hint">Tap to add active projects</div>
          )}
        </div>

      </div>{/* /scanner-body */}

      <div className="scanner-footer">
        <button
          type="submit"
          className="scan-btn"
          disabled={isLoading || !cityName || !state || focusAreas.length === 0}
        >
          {isLoading ? "Scanning grant databases…" : <><IconSearch size={14} /> Scan for Grants</>}
        </button>
      </div>
    </form>
  );
}
