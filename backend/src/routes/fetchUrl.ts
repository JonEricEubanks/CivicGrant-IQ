import { Router, Request, Response } from "express";
import { lookup } from "node:dns/promises";
import net from "node:net";

export const fetchUrlRouter = Router();

const MAX_BYTES = 200_000; // 200 KB cap
const TIMEOUT_MS = 8_000;

/**
 * Returns true if `ip` falls in a private, loopback, link-local, or otherwise
 * non-public range. Covers IPv4 (incl. the full 172.16.0.0/12 block) and IPv6
 * (loopback ::1, ULA fc00::/7, link-local fe80::/10, and IPv4-mapped ::ffff:x.x.x.x).
 */
function isPrivateIp(ip: string): boolean {
  const kind = net.isIP(ip);

  if (kind === 4) {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
      return true; // malformed — treat as unsafe
    }
    const [a, b] = parts;
    return (
      a === 0 ||                                  // 0.0.0.0/8 "this host"
      a === 10 ||                                 // 10.0.0.0/8
      (a === 100 && b >= 64 && b <= 127) ||       // 100.64.0.0/10 CGNAT
      a === 127 ||                                // 127.0.0.0/8 loopback
      (a === 169 && b === 254) ||                 // 169.254.0.0/16 link-local / IMDS
      (a === 172 && b >= 16 && b <= 31) ||        // 172.16.0.0/12 (full block)
      (a === 192 && b === 168)                    // 192.168.0.0/16
    );
  }

  if (kind === 6) {
    const lower = ip.toLowerCase();
    // IPv4-mapped (::ffff:a.b.c.d) — validate the embedded IPv4
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    if (lower === "::1" || lower === "::") return true; // loopback / unspecified
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7 ULA
    if (lower.startsWith("fe8") || lower.startsWith("fe9") ||
        lower.startsWith("fea") || lower.startsWith("feb")) return true; // fe80::/10 link-local
    return false;
  }

  return true; // not a recognizable IP — fail closed
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? m[1].trim() : "Untitled";
}

/**
 * POST /api/fetch-url
 * Body: { url: string }
 * Returns: { url, title, text, wordCount }
 *
 * Server-side URL fetch — avoids CORS, lets user paste any grant
 * announcement URL and have it analyzed against the KB.
 */
fetchUrlRouter.post("/", async (req: Request, res: Response) => {
  const { url } = req.body as { url?: string };

  if (!url || !/^https?:\/\//i.test(url)) {
    res.status(400).json({ error: "A valid http/https URL is required." });
    return;
  }

  // Block internal network requests (SSRF prevention).
  // String-based host checks are insufficient: a public hostname can resolve to a
  // private/loopback IP (DNS rebinding), and decimal/hex IP forms evade prefix matches.
  // We therefore resolve the host and validate EVERY resolved address.
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    res.status(400).json({ error: "Invalid URL format." });
    return;
  }

  // Block non-standard ports — only 80, 443, and default (empty) are allowed.
  // Prevents reaching internal services on custom ports (e.g. :3000, :8080).
  const port = parsed.port;
  if (port && port !== "80" && port !== "443") {
    res.status(400).json({ error: "Only standard HTTP/HTTPS ports are allowed." });
    return;
  }

  const host = parsed.hostname.toLowerCase();

  // Fast reject obvious internal hostnames before any DNS work.
  if (host === "localhost" || host.endsWith(".internal") || host.endsWith(".local")) {
    res.status(400).json({ error: "Internal network URLs are not allowed." });
    return;
  }

  // Resolve the host (handles literal IPs too) and reject if ANY address is private.
  try {
    const addresses = net.isIP(host)
      ? [{ address: host }]
      : await lookup(host, { all: true });
    if (!addresses.length || addresses.some((a) => isPrivateIp(a.address))) {
      res.status(400).json({ error: "Internal network URLs are not allowed." });
      return;
    }
  } catch {
    res.status(400).json({ error: "Could not resolve host." });
    return;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "CivicGrantIQ/1.0 (grant-research-tool; contact: info@civicgrant.ai)",
        Accept: "text/html,application/xhtml+xml,text/plain",
      },
    });
    clearTimeout(timer);

    if (!response.ok) {
      res
        .status(502)
        .json({ error: `Remote server returned ${response.status}` });
      return;
    }

    const contentType = response.headers.get("content-type") ?? "";
    let text: string;
    let title: string;

    if (contentType.includes("text/html")) {
      // Read up to MAX_BYTES
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        chunks.push(value);
        totalBytes += value.byteLength;
        if (totalBytes >= MAX_BYTES) {
          reader.cancel();
          break;
        }
      }
      const html = new TextDecoder().decode(
        chunks.reduce((a, b) => {
          const merged = new Uint8Array(a.length + b.length);
          merged.set(a);
          merged.set(b, a.length);
          return merged;
        })
      );
      title = extractTitle(html);
      text = stripHtml(html);
    } else {
      // Plain text / PDF text
      const raw = await response.text();
      text = raw.slice(0, MAX_BYTES);
      title = url.split("/").pop() ?? url;
    }

    // Trim to ~50k chars for prompt injection safety and token budget
    const trimmed = text.slice(0, 50_000);
    const wordCount = trimmed.split(/\s+/).filter(Boolean).length;

    res.json({
      url,
      title,
      text: trimmed,
      wordCount,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("abort") || msg.includes("AbortError")) {
      res.status(504).json({ error: "Request timed out after 8 seconds." });
    } else {
      res.status(502).json({ error: `Could not fetch URL: ${msg}` });
    }
  }
});
