import { useEffect, useRef, useState } from "react";
import "./GrantRadarSkeleton.css";

const IDLE_FACTS = [
  "Scanning 4,200+ active federal grant programs…",
  "Cross-referencing municipal eligibility criteria…",
  "Parsing NOFO compliance requirements…",
  "Evaluating 10% local match thresholds…",
  "Checking BRIC infrastructure funding windows…",
  "Analyzing RAISE grant competitive landscape…",
  "Reviewing EPA Water SRF deadlines…",
  "Scoring project-to-program alignment…",
  "Verifying SAM.gov registration requirements…",
  "Assessing HUD CDBG income targeting rules…",
];

interface Props {
  statusLog?: string[];
  completedSteps?: number;
}

export function GrantRadarSkeleton({ statusLog = [], completedSteps = 0 }: Props) {
  const [idleFactIdx, setIdleFactIdx] = useState(0);
  const [gaugeAngle, setGaugeAngle] = useState(0);
  const [pulsePhase, setPulsePhase] = useState(0);
  const prevSteps = useRef(0);

  // Rotate idle facts when no live status
  useEffect(() => {
    if (statusLog.length > 0) return;
    const t = setInterval(() => setIdleFactIdx((i) => (i + 1) % IDLE_FACTS.length), 1800);
    return () => clearInterval(t);
  }, [statusLog.length]);

  // Gauge tracks step completion
  useEffect(() => {
    const target = completedSteps > 0 ? Math.min((completedSteps / 6) * 210, 210) : Math.min(gaugeAngle + 10, 35);
    if (Math.abs(target - gaugeAngle) < 0.3) return;
    const from = gaugeAngle;
    const duration = prevSteps.current !== completedSteps ? 500 : 2800;
    prevSteps.current = completedSteps;
    const start = Date.now();
    let raf = 0;
    const tick = () => {
      const pct = Math.min((Date.now() - start) / duration, 1);
      const eased = 1 - Math.pow(1 - pct, 3);
      setGaugeAngle(from + (target - from) * eased);
      if (pct < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedSteps]);

  // Scan line
  useEffect(() => {
    const t = setInterval(() => setPulsePhase((p) => (p + 1) % 100), 40);
    return () => clearInterval(t);
  }, []);

  // SVG gauge
  const r = 46, cx = 58, cy = 58;
  const startAngle = -200;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const arcX = (d: number) => cx + r * Math.cos(toRad(d));
  const arcY = (d: number) => cy + r * Math.sin(toRad(d));
  const endAngle = startAngle + gaugeAngle;
  const largeArc = gaugeAngle > 180 ? 1 : 0;
  const bgEnd = startAngle + 210;
  const bgD = `M ${arcX(startAngle)} ${arcY(startAngle)} A ${r} ${r} 0 1 1 ${arcX(bgEnd)} ${arcY(bgEnd)}`;
  const pathD = gaugeAngle > 0.5
    ? `M ${arcX(startAngle)} ${arcY(startAngle)} A ${r} ${r} 0 ${largeArc} 1 ${arcX(endAngle)} ${arcY(endAngle)}`
    : "";

  // ECG waveform
  const ecgW = 280, ecgH = 32;
  const buildEcg = () => {
    const off = (pulsePhase / 100) * ecgW;
    let d = `M 0 ${ecgH / 2}`;
    for (let x = 0; x <= ecgW; x += 4) {
      const xo = ((x + off) % ecgW) / ecgW;
      let y = ecgH / 2;
      const sp = xo % 0.18;
      if (sp < 0.02) y = ecgH / 2 - 2;
      else if (sp < 0.04) y = ecgH / 2 + 4;
      else if (sp < 0.055) y = ecgH / 2 - 14;
      else if (sp < 0.07) y = ecgH / 2 + 8;
      else if (sp < 0.09) y = ecgH / 2 - 3;
      d += ` L ${x} ${y}`;
    }
    return d;
  };

  const latestStatus = statusLog.length > 0 ? statusLog[statusLog.length - 1] : IDLE_FACTS[idleFactIdx];
  const tickerKey = statusLog.length > 0 ? `s${statusLog.length}` : `i${idleFactIdx}`;

  return (
    <div className="grs-card">
      <div className="grs-scan-line" style={{ left: `${(pulsePhase / 100) * 100}%` }} />

      <div className="grs-header">
        <div className="grs-badge">
          <span className="grs-badge-dot" />
          <span className="grs-badge-text">Grant Intelligence Analysis</span>
        </div>
        <div className="grs-progress-label">
          {completedSteps > 0 ? `Step ${completedSteps} of 6` : "Connecting…"}
        </div>
      </div>

      <div className="grs-score-row">
        <div className="grs-gauge-wrap">
          <svg width="116" height="116" viewBox="0 0 116 116">
            <path d={bgD} fill="none" stroke="#deeaf7" strokeWidth="8" strokeLinecap="round" />
            {pathD && (
              <path d={pathD} fill="none" stroke="url(#grsGrad)" strokeWidth="8" strokeLinecap="round" />
            )}
            <defs>
              <linearGradient id="grsGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#1a6fba" />
                <stop offset="100%" stopColor="#f0b42a" />
              </linearGradient>
            </defs>
          </svg>
          <div className="grs-gauge-center">
            {completedSteps > 0 ? (
              <>
                <div className="grs-gauge-count">{completedSteps}<span>/6</span></div>
                <div className="grs-gauge-label">steps done</div>
              </>
            ) : (
              <>
                <div className="grs-gauge-dots"><span /><span /><span /></div>
                <div className="grs-gauge-label">Scoring…</div>
              </>
            )}
          </div>
        </div>

        <div className="grs-meta">
          <div className="grs-ticker">
            <span className="grs-ticker-bar" />
            <span className="grs-ticker-text" key={tickerKey}>{latestStatus}</span>
          </div>
          <div className="grs-step-track">
            {[1,2,3,4,5,6].map((n) => (
              <div
                key={n}
                className={`grs-step-dot ${n <= completedSteps ? "grs-step-dot--done" : n === completedSteps + 1 ? "grs-step-dot--active" : ""}`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="grs-ecg-wrap">
        <svg width="100%" height={ecgH} viewBox={`0 0 ${ecgW} ${ecgH}`} preserveAspectRatio="none">
          <path d={buildEcg()} fill="none" stroke="#1a6fba" strokeWidth="1.5" opacity="0.3" />
        </svg>
        <div className="grs-ecg-label">
          <span className="grs-ecg-dot" />
          Foundry IQ processing
        </div>
      </div>
    </div>
  );
}
