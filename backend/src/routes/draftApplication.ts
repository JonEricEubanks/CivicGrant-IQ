import { Router } from "express";
import type { Request, Response } from "express";
import { draftApplicationFromPrecedent } from "../agent";

export const draftApplicationRouter = Router();

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Inline markdown: **bold**, *italic*, `code`
function inline(s: string): string {
  return esc(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

/**
 * Minimal GitHub-flavored-Markdown → HTML converter covering the subset the
 * draft generator emits: headings, bold/italic, bullet lists, and pipe tables.
 */
function mdToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  let inList = false;

  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // Table: header row, separator row of ---, then body rows
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      closeList();
      const headerCells = line.split("|").slice(1, -1).map((c) => c.trim());
      out.push('<table><thead><tr>');
      headerCells.forEach((c) => out.push(`<th>${inline(c)}</th>`));
      out.push("</tr></thead><tbody>");
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        const cells = lines[i].split("|").slice(1, -1).map((c) => c.trim());
        out.push("<tr>");
        cells.forEach((c) => out.push(`<td>${inline(c)}</td>`));
        out.push("</tr>");
        i++;
      }
      out.push("</tbody></table>");
      continue;
    }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      closeList();
      const level = h[1].length;
      out.push(`<h${level}>${inline(h[2].trim())}</h${level}>`);
      i++;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${inline(line.replace(/^\s*[-*]\s+/, ""))}</li>`);
      i++;
      continue;
    }

    if (line.trim() === "") {
      closeList();
      i++;
      continue;
    }

    closeList();
    out.push(`<p>${inline(line.trim())}</p>`);
    i++;
  }
  closeList();
  return out.join("\n");
}

function buildApplicationHtml(
  bodyHtml: string,
  grantName: string,
  precedentTitle: string,
  grounded: boolean
): string {
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const sourceBadge = grounded ? "Foundry IQ — Azure AI Search" : "Foundry IQ — local knowledge base";
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(grantName)} — Draft Application</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Segoe UI", system-ui, -apple-system, sans-serif; color: #0f172a; background: #f1f5f9; }
  .page { max-width: 860px; margin: 0 auto; background: #ffffff; }
  .cover { background: linear-gradient(135deg, #0f766e, #0d9488, #14b8a6); color: #ffffff; padding: 34px 56px 28px; }
  .cover-eyebrow { font-size: 0.7rem; letter-spacing: 0.14em; text-transform: uppercase; opacity: 0.85; margin-bottom: 10px; }
  .cover-title { font-size: 1.45rem; font-weight: 700; line-height: 1.25; margin: 0 0 14px; }
  .cover-meta { display: flex; flex-wrap: wrap; gap: 10px 18px; font-size: 0.78rem; }
  .cover-pill { background: rgba(255,255,255,0.16); border: 1px solid rgba(255,255,255,0.28); border-radius: 999px; padding: 4px 12px; }
  .body { padding: 32px 56px 48px; }
  .body h1 { font-size: 1.5rem; margin: 8px 0 14px; color: #0f172a; border-bottom: 2px solid #0d9488; padding-bottom: 8px; }
  .body h2 { font-size: 1.15rem; margin: 26px 0 10px; color: #0f766e; }
  .body h3 { font-size: 0.98rem; margin: 18px 0 6px; color: #334155; }
  .body p { line-height: 1.6; margin: 8px 0; font-size: 0.9rem; }
  .body ul { margin: 8px 0 8px 4px; padding-left: 20px; }
  .body li { line-height: 1.55; margin: 4px 0; font-size: 0.9rem; }
  .body table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 0.82rem; }
  .body th { background: #f0fdfa; color: #0f766e; text-align: left; padding: 8px 10px; border: 1px solid #ccfbf1; font-weight: 600; }
  .body td { padding: 8px 10px; border: 1px solid #e2e8f0; vertical-align: top; }
  .body code { background: #f1f5f9; border-radius: 4px; padding: 1px 5px; font-size: 0.82em; }
  .precedent-note { background: #f0fdfa; border: 1px solid #99f6e4; border-left: 4px solid #0d9488; border-radius: 8px; padding: 12px 16px; margin: 0 0 4px; font-size: 0.82rem; color: #134e4a; }
  .footer { padding: 18px 56px 40px; font-size: 0.72rem; color: #64748b; border-top: 1px solid #e2e8f0; }
  .toolbar { position: sticky; top: 0; z-index: 50; background: #0f172a; padding: 10px 56px; display: flex; gap: 10px; align-items: center; }
  .toolbar .tb-hint { color: #94a3b8; font-size: 0.78rem; margin-right: auto; display: flex; align-items: center; gap: 7px; }
  .toolbar .tb-dot { width: 8px; height: 8px; border-radius: 50%; background: #14b8a6; box-shadow: 0 0 0 3px rgba(20,184,166,0.25); }
  .toolbar button { border: none; border-radius: 6px; padding: 8px 16px; font-weight: 600; font-size: 0.82rem; cursor: pointer; }
  .toolbar .tb-edit { background: #1e293b; color: #e2e8f0; border: 1px solid #334155; }
  .toolbar .tb-edit.is-on { background: #0d9488; color: #042f2e; border-color: #0d9488; }
  .toolbar .tb-pdf { background: #14b8a6; color: #042f2e; }
  /* Inline editing affordances */
  .editable { outline: none; }
  body.editing .editable [contenteditable] { transition: background 0.12s, box-shadow 0.12s; border-radius: 4px; }
  body.editing .editable h1:hover, body.editing .editable h2:hover, body.editing .editable h3:hover,
  body.editing .editable p:hover, body.editing .editable li:hover, body.editing .editable td:hover { background: #f0fdfa; }
  body.editing .editable [contenteditable]:focus { background: #ecfeff; box-shadow: inset 0 0 0 2px #14b8a6; }
  @media print {
    @page { size: A4; margin: 0; }
    html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: #fff; }
    .toolbar { display: none; }
    .editable [contenteditable]:focus, .editable *:hover { background: transparent !important; box-shadow: none !important; }
    .cover { -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 26px 44px 20px; page-break-after: avoid; }
    .cover-title { font-size: 1.25rem; }
    .body { padding: 26px 44px; }
    .body h2, .body h3 { page-break-after: avoid; }
    table, li { page-break-inside: avoid; }
  }
</style></head>
<body class="editing">
  <div class="toolbar">
    <span class="tb-hint"><span class="tb-dot"></span><span id="hint-text">Editing on — click any text to make changes</span></span>
    <button class="tb-edit is-on" id="edit-toggle" onclick="toggleEdit()">✏️ Editing</button>
    <button class="tb-pdf" onclick="savePdf()">Save as PDF</button>
  </div>
  <div class="page">
    <div class="cover">
      <div class="cover-eyebrow">Draft Grant Application · Generated by CivicGrant IQ · ${today}</div>
      <h1 class="cover-title">${esc(grantName)}</h1>
      <div class="cover-meta">
        <span class="cover-pill">Village of Buffalo Grove, IL</span>
        <span class="cover-pill">Modeled on: ${esc(precedentTitle)}</span>
        <span class="cover-pill">Source: ${sourceBadge}</span>
      </div>
    </div>
    <div class="body">
      <div class="precedent-note">
        <strong>Recreated from precedent.</strong> This draft was generated by adapting Buffalo Grove's
        proven past application — <em>${esc(precedentTitle)}</em> — retrieved from Foundry IQ, to the
        requirements of this target grant. Review all bracketed [TBD] items with Finance and Engineering
        before submission.
      </div>
      <div class="editable">${bodyHtml}</div>
    </div>
    <div class="footer">
      Generated by CivicGrant IQ • ${today} • Powered by Microsoft Azure Foundry •
      AI-generated draft — must be reviewed and verified by qualified grant professionals before submission.
    </div>
  </div>
  <script>
    var editable = document.querySelector(".editable");
    var dirty = false;
    // Make each block-level element individually editable so structure stays intact.
    var blocks = editable.querySelectorAll("h1,h2,h3,h4,p,li,td,th");
    function applyEditable(on) {
      blocks.forEach(function (el) { el.setAttribute("contenteditable", on ? "true" : "false"); });
    }
    applyEditable(true);
    editable.addEventListener("input", function () {
      if (!dirty) { dirty = true; document.getElementById("hint-text").textContent = "Unsaved edits — Save as PDF when ready"; }
    });
    function toggleEdit() {
      var on = !document.body.classList.contains("editing");
      document.body.classList.toggle("editing", on);
      applyEditable(on);
      var btn = document.getElementById("edit-toggle");
      btn.classList.toggle("is-on", on);
      btn.textContent = on ? "✏️ Editing" : "✏️ Edit";
      if (!dirty) document.getElementById("hint-text").textContent = on ? "Editing on — click any text to make changes" : "Editing off — preview mode";
    }
    function savePdf() {
      // Drop edit chrome so the print is clean, then restore after.
      var wasEditing = document.body.classList.contains("editing");
      document.body.classList.remove("editing");
      applyEditable(false);
      window.print();
      if (wasEditing) { document.body.classList.add("editing"); applyEditable(true); }
    }
    window.addEventListener("beforeunload", function (e) {
      if (dirty) { e.preventDefault(); e.returnValue = ""; }
    });
  </script>
</body></html>`;
}

draftApplicationRouter.post("/", async (req: Request, res: Response) => {
  const { grantName, agency, fundingAmount, awardRange, matchScore, analysisText } = req.body as {
    grantName?: string;
    agency?: string;
    fundingAmount?: number;
    awardRange?: string;
    matchScore?: number;
    analysisText?: string;
  };

  if (!grantName || typeof grantName !== "string") {
    res.status(400).json({ error: "grantName is required" });
    return;
  }

  try {
    const result = await draftApplicationFromPrecedent({
      grantName,
      agency,
      fundingAmount,
      awardRange,
      matchScore,
      analysisText,
    });

    if (!result.markdown) {
      res.status(502).json({ error: "Draft generation returned empty content" });
      return;
    }

    const html = buildApplicationHtml(
      mdToHtml(result.markdown),
      grantName,
      result.precedentTitle,
      result.grounded
    );

    res.json({
      html,
      title: `${grantName} — Draft Application`,
      precedentTitle: result.precedentTitle,
      grounded: result.grounded,
    });
  } catch (err) {
    console.error("[draft-application] failed:", (err as Error).message);
    res.status(500).json({ error: "Draft application generation failed" });
  }
});
