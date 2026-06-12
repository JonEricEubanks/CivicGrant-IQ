/** Minimal inline-SVG icon system — production-grade, no emoji */
import type { CSSProperties, ReactElement } from "react";

interface IconProps {
  size?: number;
  color?: string;
  style?: CSSProperties;
  className?: string;
}

const ico = (path: ReactElement | ReactElement[], viewBox = "0 0 24 24") =>
  ({ size = 16, color = "currentColor", style, className }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke={color}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      className={className}
      aria-hidden="true"
    >
      {path}
    </svg>
  );

// ─── Navigation / layout ────────────────────────────────────────────────
export const IconBuilding = ico([
  <path key="a" d="M3 21h18M6 21V7l6-4 6 4v14M9 21v-5h6v5" />,
]);

export const IconChat = ico([
  <path key="a" d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
]);

export const IconSearch = ico([
  <circle key="a" cx="11" cy="11" r="8" />,
  <path key="b" d="m21 21-4.35-4.35" />,
]);

export const IconSettings = ico([
  <circle key="a" cx="12" cy="12" r="3" />,
  <path key="b" d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />,
]);

export const IconPlus = ico([
  <path key="a" d="M12 5v14M5 12h14" />,
]);

export const IconNewChat = ico([
  <path key="a" d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />,
]);

// ─── Grant / finance ────────────────────────────────────────────────────
export const IconDollar = ico([
  <line key="a" x1="12" y1="1" x2="12" y2="23" />,
  <path key="b" d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />,
]);

export const IconBriefcase = ico([
  <rect key="a" x="2" y="7" width="20" height="14" rx="2" ry="2" />,
  <path key="b" d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />,
]);

export const IconHome = ico([
  <path key="a" d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  <polyline key="b" points="9 22 9 12 15 12 15 22" />,
]);

export const IconDroplets = ico([
  <path key="a" d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z" />,
  <path key="b" d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97" />,
]);

export const IconBolt = ico([
  <polygon key="a" points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
]);

// ─── Actions / UI ───────────────────────────────────────────────────────
export const IconCopy = ico([
  <rect key="a" x="9" y="9" width="13" height="13" rx="2" ry="2" />,
  <path key="b" d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />,
]);

export const IconCheck = ico([
  <polyline key="a" points="20 6 9 17 4 12" />,
]);

export const IconX = ico([
  <line key="a" x1="18" y1="6" x2="6" y2="18" />,
  <line key="b" x1="6" y1="6" x2="18" y2="18" />,
]);

export const IconPanelRight = ico([
  <rect key="r" x="1" y="3" width="22" height="18" rx="2" />,
  <line key="l" x1="16" y1="3" x2="16" y2="21" />,
]);

export const IconDownload = ico([
  <path key="a" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />,
  <polyline key="b" points="7 10 12 15 17 10" />,
  <line key="c" x1="12" y1="15" x2="12" y2="3" />,
]);

export const IconChevronDown = ico([
  <polyline key="a" points="6 9 12 15 18 9" />,
]);

// ─── Theme ──────────────────────────────────────────────────────────────
export const IconSun = ico([
  <circle key="a" cx="12" cy="12" r="5" />,
  <line key="b" x1="12" y1="1" x2="12" y2="3" />,
  <line key="c" x1="12" y1="21" x2="12" y2="23" />,
  <line key="d" x1="4.22" y1="4.22" x2="5.64" y2="5.64" />,
  <line key="e" x1="18.36" y1="18.36" x2="19.78" y2="19.78" />,
  <line key="f" x1="1" y1="12" x2="3" y2="12" />,
  <line key="g" x1="21" y1="12" x2="23" y2="12" />,
  <line key="h" x1="4.22" y1="19.78" x2="5.64" y2="18.36" />,
  <line key="i" x1="18.36" y1="5.64" x2="19.78" y2="4.22" />,
]);

export const IconMoon = ico([
  <path key="a" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />,
]);

// ─── View / layout ──────────────────────────────────────────────────────
export const IconMaximize = ico([
  <path key="a" d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />,
]);

export const IconMinimize = ico([
  <path key="a" d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />,
]);

// ─── Files / documents ──────────────────────────────────────────────────
export const IconGlobe = ico([
  <circle key="a" cx="12" cy="12" r="10" />,
  <line key="b" x1="2" y1="12" x2="22" y2="12" />,
  <path key="c" d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />,
]);

export const IconFileText = ico([
  <path key="a" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />,
  <polyline key="b" points="14 2 14 8 20 8" />,
  <line key="c" x1="16" y1="13" x2="8" y2="13" />,
  <line key="d" x1="16" y1="17" x2="8" y2="17" />,
  <polyline key="e" points="10 9 9 9 8 9" />,
]);

export const IconFilePdf = ico([
  <path key="a" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />,
  <polyline key="b" points="14 2 14 8 20 8" />,
  <path key="c" d="M9 13h1a1 1 0 0 1 0 2H9v-2zm0 2v2m6-4h-2v4h2m-2-2h1.5" />,
]);

export const IconChart = ico([
  <line key="a" x1="18" y1="20" x2="18" y2="10" />,
  <line key="b" x1="12" y1="20" x2="12" y2="4" />,
  <line key="c" x1="6" y1="20" x2="6" y2="14" />,
]);

export const IconDocument = ico([
  <path key="a" d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />,
  <polyline key="b" points="13 2 13 9 20 9" />,
]);

// ─── Status / tools ─────────────────────────────────────────────────────

export const IconCheckCircle = ico([
  <path key="a" d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />,
  <polyline key="b" points="22 4 12 14.01 9 11.01" />,
]);

export const IconClock = ico([
  <circle key="a" cx="12" cy="12" r="10" />,
  <polyline key="b" points="12 6 12 12 16 14" />,
]);

export const IconLoader = ico([
  <line key="a" x1="12" y1="2" x2="12" y2="6" />,
  <line key="b" x1="12" y1="18" x2="12" y2="22" />,
  <line key="c" x1="4.93" y1="4.93" x2="7.76" y2="7.76" />,
  <line key="d" x1="16.24" y1="16.24" x2="19.07" y2="19.07" />,
  <line key="e" x1="2" y1="12" x2="6" y2="12" />,
  <line key="f" x1="18" y1="12" x2="22" y2="12" />,
  <line key="g" x1="4.93" y1="19.07" x2="7.76" y2="16.24" />,
  <line key="h" x1="16.24" y1="7.76" x2="19.07" y2="4.93" />,
]);

export const IconBrain = ico([
  <path key="a" d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-1.14" />,
  <path key="b" d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-1.14" />,
]);

export const IconMap = ico([
  <polygon key="a" points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />,
  <line key="b" x1="9" y1="3" x2="9" y2="18" />,
  <line key="c" x1="15" y1="6" x2="15" y2="21" />,
]);

export const IconPencil = ico([
  <path key="a" d="M12 20h9" />,
  <path key="b" d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />,
]);

export const IconInfo = ico([
  <circle key="a" cx="12" cy="12" r="10" />,
  <line key="b" x1="12" y1="8" x2="12" y2="12" />,
  <line key="c" x1="12" y1="16" x2="12.01" y2="16" />,
]);

export const IconCircleDot = ico([
  <circle key="a" cx="12" cy="12" r="10" />,
  <circle key="b" cx="12" cy="12" r="3" />,
]);

export const IconXCircle = ico([
  <circle key="a" cx="12" cy="12" r="10" />,
  <line key="b" x1="15" y1="9" x2="9" y2="15" />,
  <line key="c" x1="9" y1="9" x2="15" y2="15" />,
]);

export const IconTriangleAlert = ico([
  <path key="a" d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />,
  <line key="b" x1="12" y1="9" x2="12" y2="13" />,
  <line key="c" x1="12" y1="17" x2="12.01" y2="17" />,
]);

export const IconPlug = ico([
  <path key="a" d="M12 22v-5M9 8V2M15 8V2M9 14H5a2 2 0 0 1-2-2v-1h14v1a2 2 0 0 1-2 2h-4z" />,
]);

export const IconSparkle = ico([
  <path key="a" d="M12 3l1.88 5.63L19.5 9l-5.62 4.12L15.76 19 12 15.4 8.24 19l2.38-5.88L5.5 9l5.62-.37z" />,
]);

export const IconBook = ico([
  <path key="a" d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />,
  <path key="b" d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />,
]);

export const IconExternalLink = ico([
  <path key="a" d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />,
  <polyline key="b" points="15 3 21 3 21 9" />,
  <line key="c" x1="10" y1="14" x2="21" y2="3" />,
]);

export const IconAlert = ico([
  <path key="a" d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />,
  <line key="b" x1="12" y1="9" x2="12" y2="13" />,
  <line key="c" x1="12" y1="17" x2="12.01" y2="17" />,
]);

export const IconLink = ico([
  <path key="a" d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />,
  <path key="b" d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />,
]);

export const IconScales = ico([
  <line key="a" x1="12" y1="3" x2="12" y2="21" />,
  <path key="b" d="M5 21h14" />,
  <path key="c" d="M3 9l9-6 9 6" />,
  <path key="d" d="M3 9l3 6h0a3 3 0 0 0 6 0h0" />,
  <path key="e" d="M21 9l-3 6h0a3 3 0 0 1-6 0h0" />,
]);

export const IconTarget = ico([
  <circle key="a" cx="12" cy="12" r="10" />,
  <circle key="b" cx="12" cy="12" r="6" />,
  <circle key="c" cx="12" cy="12" r="2" />,
]);

export const IconAward = ico([
  <circle key="a" cx="12" cy="8" r="6" />,
  <path key="b" d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />,
]);

export const IconPaperclip = ico([
  <path key="a" d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />,
]);

export const IconDatabase = ico([
  <ellipse key="a" cx="12" cy="5" rx="9" ry="3" />,
  <path key="b" d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />,
  <path key="c" d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />,
]);

/** Fabric IQ — diamond/layers icon matching Microsoft Fabric's visual identity */
export const IconFabricIQ = ico([
  <polygon key="a" points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />,
  <line key="b" x1="12" y1="2" x2="12" y2="22" />,
  <line key="c" x1="2" y1="8.5" x2="22" y2="8.5" />,
  <line key="d" x1="2" y1="15.5" x2="22" y2="15.5" />,
]);

// ─── Brand / product logos ───────────────────────────────────────────────

/**
 * MGP — Municipal Grant Portfolio — shield-badge monogram logo.
 * A modern government-tech mark: clipped shield with "MGP" lettermark
 * and a thin horizontal rule accent.
 */
export const IconMGP = ({ size = 32 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
    {/* Shield base */}
    <path
      d="M16 2L4 7v8c0 7.18 5.19 13.89 12 15.5C22.81 28.89 28 22.18 28 15V7L16 2Z"
      fill="url(#mgp-grad)"
    />
    {/* Inner shield highlight */}
    <path
      d="M16 4.8L6.4 9v6c0 5.9 4.26 11.41 9.6 12.75C21.34 26.41 25.6 20.9 25.6 15V9L16 4.8Z"
      fill="rgba(255,255,255,0.08)"
    />
    {/* "M" left stroke */}
    <path d="M8.5 20V12l3.5 4 3.5-4v8" stroke="white" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    {/* "G" */}
    <path d="M17 16.5h2.5V20h-2a2.5 2.5 0 1 1 0-5h2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    {/* Accent bar at bottom of shield */}
    <path d="M10 22.5h12" stroke="rgba(255,255,255,0.35)" strokeWidth="0.8" strokeLinecap="round"/>
    <defs>
      <linearGradient id="mgp-grad" x1="4" y1="2" x2="28" y2="32" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#1e40af"/>
        <stop offset="100%" stopColor="#1a6fba"/>
      </linearGradient>
    </defs>
  </svg>
);

/** CivicGrant IQ brand seal — circular badge with government building (legacy) */
export const IconBrandLogo = ({ size = 26 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 26 26" fill="none" aria-hidden="true">
    <circle cx="13" cy="13" r="12" fill="#1a6fba" />
    {/* Base platform */}
    <rect x="6" y="19.5" width="14" height="1.5" rx="0.5" fill="white" />
    {/* 3 columns */}
    <rect x="7.5" y="14" width="2" height="5.5" rx="0.4" fill="white" />
    <rect x="12" y="14" width="2" height="5.5" rx="0.4" fill="white" />
    <rect x="16.5" y="14" width="2" height="5.5" rx="0.4" fill="white" />
    {/* Pediment (triangle roof) */}
    <path d="M6.5 14 L13 8.5 L19.5 14 Z" fill="white" />
    {/* Flagpole dot */}
    <circle cx="13" cy="7.5" r="1" fill="white" />
    {/* Dollar accent ring */}
    <circle cx="13" cy="13" r="11.5" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
  </svg>
);

/** Microsoft 4-colour squares logo — for "Powered by Microsoft …" badges */
export const IconMicrosoft = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 21 21" aria-hidden="true">
    <rect x="1" y="1" width="9" height="9" fill="#f25022" />
    <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
    <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
    <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
  </svg>
);

