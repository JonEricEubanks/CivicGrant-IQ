import type { Citation } from "../types";
import "./CitationsPanel.css";

interface Props {
  citations: Citation[];
}

const SOURCE_LABELS: Record<Citation["source"], string> = {
  municipal_docs: "Municipal Doc",
  web: "Web Source",
  foundry_iq: "Foundry IQ",
};

const SOURCE_COLORS: Record<Citation["source"], string> = {
  municipal_docs: "#3b82f6",
  web: "#8b5cf6",
  foundry_iq: "#10b981",
};

export function CitationsPanel({ citations }: Props) {
  if (citations.length === 0) return null;

  return (
    <div className="citations-panel">
      <h3 className="citations-title">
        <span>📚</span> Sources ({citations.length})
      </h3>
      <div className="citations-list">
        {citations.map((c, i) => (
          <div key={c.id ?? i} className="citation-card">
            <div className="citation-header">
              <span
                className="citation-badge"
                style={{ background: SOURCE_COLORS[c.source] + "22", color: SOURCE_COLORS[c.source] }}
              >
                {SOURCE_LABELS[c.source]}
              </span>
            </div>
            <p className="citation-title">
              {c.url ? (
                <a href={c.url} target="_blank" rel="noopener noreferrer">
                  {c.title}
                </a>
              ) : (
                c.title
              )}
            </p>
            {c.excerpt && <p className="citation-excerpt">"{c.excerpt}"</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
