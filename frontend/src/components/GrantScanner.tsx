import { useState } from "react";
import type { CityProfile } from "../types";
import { IconBuilding, IconSearch, IconChevronDown } from "./Icons";
import "./GrantScanner.css";

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
  const [cityName, setCityName] = useState("Buffalo Grove");
  const [state, setState] = useState("IL");
  const [population, setPopulation] = useState("41,496");
  const [focusAreas, setFocusAreas] = useState<string[]>(["Transportation & Infrastructure", "Water & Sewer", "Environmental / Climate"]);
  const [focusOpen, setFocusOpen] = useState(false);
  const [selectedProjects, setSelectedProjects] = useState<string[]>(DEFAULT_PROJECTS);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(DEFAULT_OPEN_GROUPS);

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
  };

  const toggleProject = (item: string) => {
    setSelectedProjects((prev) =>
      prev.includes(item) ? prev.filter((p) => p !== item) : [...prev, item]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cityName || !state || focusAreas.length === 0) return;
    onScan({
      cityName,
      state,
      population: parseInt(population.replace(/,/g, ""), 10) || 0,
      focusAreas,
      currentProjects: selectedProjects.join(", "),
    });
  };

  if (collapsed) {
    return (
      <div className="grant-scanner grant-scanner--collapsed" onClick={onExpand} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onExpand?.()}>
        <div className="scanner-collapsed-bar">
          <span className="scanner-collapsed-icon"><IconBuilding size={14} /></span>
          <span className="scanner-collapsed-city"><strong>{cityName}, {state}</strong></span>
          <span className="scanner-collapsed-pills">
            {focusAreas.map((a) => <span key={a} className="scanner-collapsed-pill">{a}</span>)}
          </span>
          <span className="scanner-collapsed-edit">
            <IconChevronDown size={14} /> Edit profile
          </span>
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
        {population && <div className="scanner-profile-pop">{population} residents</div>}
      </div>

      {/* Form body */}
      <div className="scanner-body">
        <div className="form-row">
        <div className="form-group">
          <label>City Name *</label>
          <input
            type="text"
            value={cityName}
            onChange={(e) => setCityName(e.target.value)}
            placeholder="e.g. Cedar Rapids"
            required
          />
        </div>
        <div className="form-group">
          <label>State *</label>
          <input
            type="text"
            value={state}
            onChange={(e) => setState(e.target.value)}
            placeholder="IL"
            required
          />
        </div>
      </div>

      <div className="form-group form-group--pop">
        <label>Population <span className="hint">(optional)</span></label>
        <input
          type="text"
          value={population}
          onChange={(e) => setPopulation(e.target.value)}
          placeholder="e.g. 41,496"
        />
      </div>

      <div className="focus-section">
        <button
          type="button"
          className="focus-section-header"
          onClick={() => setFocusOpen((o) => !o)}
          aria-expanded={focusOpen}
        >
          <span className="focus-section-title">Priority Focus Areas *</span>
          {focusAreas.length > 0 && (
            <span className="project-group-badge">{focusAreas.length} selected</span>
          )}
          <span className={`project-group-chevron${focusOpen ? " project-group-chevron--open" : ""}`}>
            <IconChevronDown size={13} aria-hidden />
          </span>
        </button>
        {focusOpen ? (
          <div className="focus-chips-expanded">
            {FOCUS_AREA_OPTIONS.map((area) => (
              <button
                key={area}
                type="button"
                className={`chip chip--sm ${focusAreas.includes(area) ? "chip--active" : ""}`}
                onClick={() => toggleFocus(area)}
              >
                {area}
              </button>
            ))}
          </div>
        ) : focusAreas.length > 0 ? (
          <div className="focus-preview-row">
            {focusAreas.map((a) => (
              <span key={a} className="focus-preview-pill">{a}</span>
            ))}
          </div>
        ) : (
          <div className="focus-empty-hint">Tap to select at least one area</div>
        )}
      </div>

      <div className="focus-section">
        <button
          type="button"
          className="focus-section-header"
          onClick={() => setProjectsOpen((o) => !o)}
          aria-expanded={projectsOpen}
        >
          <span className="focus-section-title">Active Projects &amp; Initiatives</span>
          {selectedProjects.length > 0 && (
            <span className="project-group-badge">{selectedProjects.length} selected</span>
          )}
          <span className={`project-group-chevron${projectsOpen ? " project-group-chevron--open" : ""}`}>
            <IconChevronDown size={13} aria-hidden />
          </span>
        </button>
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
                      {groupSelected.length > 0 && (
                        <span className="project-group-badge">{groupSelected.length}</span>
                      )}
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
                          >
                            {item}
                          </button>
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
            {selectedProjects.map((p) => (
              <span key={p} className="focus-preview-pill">{p}</span>
            ))}
          </div>
        ) : (
          <div className="focus-empty-hint">Tap to add active projects (improves matching)</div>
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
