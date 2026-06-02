import React, { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

// Synthesizes a premium dual-tone brutalist chime using Web Audio API
function playAlertSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    
    const now = ctx.currentTime;
    
    // First pleasant tone (Melodic perfect fifth)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, now); // D5
    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.1); // A5
    
    gain1.gain.setValueAtTime(0.12, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Second tone (slightly delayed resolving octave chime)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880, now + 0.12); // A5
    osc2.frequency.exponentialRampToValueAtTime(1174.66, now + 0.22); // D6
    
    gain2.gain.setValueAtTime(0.12, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    
    osc2.start(now + 0.12);
    osc2.stop(now + 0.45);
  } catch (err) {
    console.error("Failed to play alert sound:", err);
  }
}

const SUPPORTED_MODELS = [
  { value: "gemini/gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite" },
  { value: "gemini/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
  { value: "xai/grok-4-1-fast-non-reasoning", label: "Grok 4.1 Fast" },
  { value: "xai/grok-2", label: "Grok 2" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4o-mini", label: "GPT-4o-mini" },
  { value: "claude-3-7-sonnet-20250219", label: "Claude 3.7 Sonnet" },
  { value: "claude-3-haiku-20240307", label: "Claude 3 Haiku" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { value: "deepseek-chat", label: "DeepSeek Chat" },
  { value: "deepseek-reasoner", label: "DeepSeek Reasoner" }
];

interface ConvexTweet {
  _id: string;
  username: string;
  text: string;
  tickers: string;
  signal: string;
  processedAt?: string;
  tweetId: string;
}

interface ConvexRun {
  _id: string;
  tweetsProcessed: number;
  totalCost: number;
  modelUsed: string;
  timestamp?: string | number;
}

interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, "stroke" | "d"> {
  w?: number;
  fill?: string;
  vb?: number;
  stroke?: number;
  d?: string | string[];
}

function I({ d, w = 16, fill, vb = 24, stroke = 2, children, ...p }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={w}
      height={w}
      viewBox={`0 0 ${vb} ${vb}`}
      fill={fill || "none"}
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      {children || (Array.isArray(d) ? d.map((x, i) => <path key={i} d={x} />) : <path d={d} />)}
    </svg>
  );
}

const Icon = {
  trend: (p: IconProps) => <I {...p} d={["M16 7h6v6", "m22 7-8.5 8.5-5-5L2 17"]} />,
  search: (p: IconProps) => (
    <I {...p}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </I>
  ),
  cpu: (p: IconProps) => (
    <I {...p}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2" />
    </I>
  ),
  dollar: (p: IconProps) => (
    <I {...p}>
      <line x1="12" x2="12" y1="2" y2="22" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </I>
  ),
  activity: (p: IconProps) => (
    <I
      {...p}
      d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"
    />
  ),
  x: (p: IconProps) => <I {...p} d={["M18 6 6 18", "m6 6 12 12"]} />,
  ext: (p: IconProps) => <I {...p} d={["M15 3h6v6", "M10 14 21 3", "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"]} />,
  bell: (p: IconProps) => <I {...p} d={["M10.27 21a1.94 1.94 0 0 0 3.46 0", "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"]} />,
  vol: (p: IconProps) => (
    <I {...p}>
      <path d="M11 4.7 6.4 9H2v6h4.4l4.6 4.3z" />
      <path d="M16 9a3 3 0 0 1 0 6" />
      <path d="M19.4 5.6a8 8 0 0 1 0 12.8" />
    </I>
  ),
  mute: (p: IconProps) => (
    <I {...p}>
      <path d="M11 4.7 6.4 9H2v6h4.4l4.6 4.3z" />
      <path d="m23 9-6 6M17 9l6 6" />
    </I>
  ),
  sun: (p: IconProps) => (
    <I {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" />
    </I>
  ),
  moon: (p: IconProps) => <I {...p} d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />,
  pie: (p: IconProps) => <I {...p} d={["M21 12c.552 0 1.005-.449.95-.998a10 10 0 0 0-8.953-8.951c-.55-.055-.998.398-.998.95v8a1 1 0 0 0 1 1z", "M21.21 15.89A10 10 0 1 1 8 2.83"]} />,
  line: (p: IconProps) => <I {...p} d={["M3 3v16a2 2 0 0 0 2 2h16", "m19 9-5 5-4-4-3 3"]} />,
  zap: (p: IconProps) => <I {...p} d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />,
  filter: (p: IconProps) => <I {...p} d="M3 4h18l-7 8v6l-4 2v-8z" />,
};

const TOKEN_RE = /(https?:\/\/[^\s]+|\$[A-Za-z]{1,6}\b|@\w+)/g;

function renderContent(text: string) {
  const parts = String(text).split(TOKEN_RE);
  return parts.map((p, i) => {
    if (!p) return null;
    if (/^https?:\/\//.test(p)) {
      let label = p.replace(/^https?:\/\//, "").replace(/^www\./, "");
      if (label.length > 26) label = label.slice(0, 26) + "…";
      return (
        <a key={i} href={p} target="_blank" rel="noreferrer">
          {label}
        </a>
      );
    }
    if (/^\$[A-Za-z]/.test(p)) {
      return (
        <span key={i} className="mention" style={{ color: "inherit", fontWeight: 600 }}>
          {p}
        </span>
      );
    }
    if (/^@\w/.test(p)) {
      return (
        <span key={i} className="mention">
          {p}
        </span>
      );
    }
    return p;
  });
}

const SIG_LABEL: Record<string, string> = {
  buy: "BUY",
  sell: "SELL",
  bullish: "BULLISH",
  bearish: "BEARISH",
  neutral: "NEUTRAL",
};

const SIG_COLOR: Record<string, string> = {
  buy: "var(--buy)",
  bullish: "var(--bull)",
  neutral: "var(--neutral)",
  bearish: "var(--bear)",
  sell: "var(--sell)",
};

interface SignalBadgeProps {
  signal: string;
}

function SignalBadge({ signal }: SignalBadgeProps) {
  const s = signal.toLowerCase();
  const alert = s === "buy" || s === "sell";
  return (
    <span className={`sig ${s} ${alert ? "alert" : ""}`}>
      {alert && <Icon.bell w={11} />}
      {!alert && <span className="sd" />}
      {SIG_LABEL[s] || signal.toUpperCase()}
    </span>
  );
}

interface TweetCardProps {
  tw: ConvexTweet;
  activeTicker: string | null;
  onTicker: (ticker: string) => void;
  formatDate: (dateStr?: string) => string;
}

function TweetCard({ tw, activeTicker, onTicker, formatDate }: TweetCardProps) {
  const s = tw.signal.toLowerCase();
  const alert = s === "buy" || s === "sell";
  const tickerArray = tw.tickers
    ? tw.tickers
        .split(",")
        .map((t) => {
          let clean = t.trim().toUpperCase();
          while (clean.startsWith("$")) {
            clean = clean.substring(1);
          }
          return clean;
        })
        .filter(Boolean)
    : [];

  return (
    <article className={`tw s-${s} ${alert ? "alert" : ""}`}>
      <div className="tw-head">
        <div className="tw-author">
          <a
            className="tw-name"
            href={`https://x.com/${tw.username}`}
            target="_blank"
            rel="noreferrer"
          >
            @{tw.username}
          </a>
          <span className="tw-time">{formatDate(tw.processedAt)}</span>
        </div>
        <SignalBadge signal={tw.signal} />
      </div>
      <div className="tw-body">{renderContent(tw.text)}</div>
      <div className="tw-foot">
        <div className="tw-tickers">
          {tickerArray.map((t, i) => (
            <span
              key={i}
              className={`tk ${activeTicker === t ? "on" : ""}`}
              onClick={() => onTicker(t)}
            >
              ${t}
            </span>
          ))}
        </div>
        <a
          className="tw-link"
          href={`https://x.com/${tw.username}/status/${tw.tweetId}`}
          target="_blank"
          rel="noreferrer"
        >
          view
          <Icon.ext w={12} />
        </a>
      </div>
    </article>
  );
}

interface DonutProps {
  counts: Record<string, number>;
  total: number;
}

function Donut({ counts, total }: DonutProps) {
  const order = ["buy", "bullish", "neutral", "bearish", "sell"];
  const r = 52;
  const sw = 18;
  const C = 2 * Math.PI * r;
  let acc = 0;

  const segs = order
    .filter((k) => counts[k])
    .map((k) => {
      const frac = counts[k] / total;
      const seg = { k, frac, off: acc, len: frac * C };
      acc += frac;
      return seg;
    });

  return (
    <div className="donut-wrap">
      <svg className="donut" width="132" height="132" viewBox="0 0 132 132">
        <circle cx="66" cy="66" r={r} fill="none" stroke="var(--rule-soft)" strokeWidth={sw} />
        {segs.map((s, i) => (
          <circle
            key={i}
            cx="66"
            cy="66"
            r={r}
            fill="none"
            stroke={SIG_COLOR[s.k]}
            strokeWidth={sw}
            strokeDasharray={`${s.len} ${C - s.len}`}
            strokeDashoffset={-s.off * C}
            transform="rotate(-90 66 66)"
            style={{ transition: "stroke-dasharray .5s var(--ease), stroke-dashoffset .5s var(--ease)" }}
          />
        ))}
        <text
          x="66"
          y="61"
          textAnchor="middle"
          fill="var(--fg)"
          fontSize="24"
          fontWeight="700"
          fontFamily="var(--font-mono)"
        >
          {total}
        </text>
        <text
          x="66"
          y="78"
          textAnchor="middle"
          fill="var(--fg-3)"
          fontSize="9"
          fontFamily="var(--font-mono)"
          letterSpacing="1.5"
        >
          SIGNALS
        </text>
      </svg>
      <div className="donut-legend">
        {order.map((k) => (
          <div className="dl-row" key={k}>
            <span className="sw" style={{ background: SIG_COLOR[k] }} />
            <span className="lbl">{k}</span>
            <span className="val">{counts[k] || 0}</span>
            <span className="pct">{total ? Math.round(((counts[k] || 0) / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface CostChartProps {
  runs: ConvexRun[];
}

function CostChart({ runs }: CostChartProps) {
  const data = useMemo(() => {
    return runs
      .slice(0, 15)
      .reverse()
      .map((r) => ({
        t: r.timestamp ? new Date(r.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "N/A",
        cost: r.totalCost || 0,
      }));
  }, [runs]);

  const W = 300;
  const H = 130;
  const pad = 8;
  const max = Math.max(...data.map((d) => d.cost), 0.000001);

  const pts = data.map((d, i) => {
    const x = pad + (i / (data.length - 1 || 1)) * (W - pad * 2);
    const y = H - pad - (d.cost / max) * (H - pad * 2);
    return [x, y];
  });

  const path = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area =
    pts.length > 0
      ? `${path} L ${pts[pts.length - 1][0].toFixed(1)} ${H - pad} L ${pts[0][0].toFixed(1)} ${H - pad} Z`
      : "";

  const total = data.reduce((s, d) => s + d.cost, 0);
  const avg = total / (data.length || 1);

  if (data.length === 0) {
    return <div className="empty" style={{ padding: "20px" }}>No runs history available</div>;
  }

  return (
    <div>
      <div className="cost-meta">
        <div className="cost-stat">
          <div className="cs-v acc">${total.toFixed(6)}</div>
          <div className="cs-k">total</div>
        </div>
        <div className="cost-stat">
          <div className="cs-v">${avg.toFixed(6)}</div>
          <div className="cs-k">avg / run</div>
        </div>
        <div className="cost-stat">
          <div className="cs-v">{data.length}</div>
          <div className="cs-k">runs shown</div>
        </div>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block" }}>
        <defs>
          <linearGradient id="costg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--buy)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--buy)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={pad}
            x2={W - pad}
            y1={pad + f * (H - pad * 2)}
            y2={pad + f * (H - pad * 2)}
            stroke="var(--rule-soft)"
            strokeWidth="1"
          />
        ))}
        {area && <path d={area} fill="url(#costg)" />}
        {path && <path d={path} fill="none" stroke="var(--buy)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
        {pts.map((p, i) => i % 6 === 0 && <circle key={i} cx={p[0]} cy={p[1]} r="2.2" fill="var(--buy)" />)}
      </svg>
    </div>
  );
}

interface MarqueeProps {
  items: string[];
}

function Marquee({ items }: MarqueeProps) {
  const list = items.length ? items : [];
  const doubled = [...list, ...list];
  return (
    <div className="marquee">
      <div className="track">
        {doubled.map((it, i) => {
          const [sym, n] = it.split(" ");
          return (
            <span className="mq-item" key={i}>
              <span className="dot" />
              {sym} <b>{n}</b>
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default function App() {
  // Real-time Convex Queries
  const recentTweets = useQuery(api.tweets.getRecentTweets, { limit: 1000 });
  const tweetStats = useQuery(api.tweets.getTweetStats);
  const recentRuns = useQuery(api.runs.getRecentRuns, { limit: 50 });
  const runStats = useQuery(api.runs.getRunStats);
  
  // Real-time active model setting with fallback
  const activeModel = useQuery(api.settings.getSetting, { key: "active_model" }) ?? "gemini/gemini-3.1-flash-lite";
  const updateSetting = useMutation(api.settings.updateSetting);

  // States
  const [theme, setTheme] = useState(() => localStorage.getItem("at-theme") || "dark");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // all | buy | sell | bullish | bearish
  const [ticker, setTicker] = useState<string | null>(null);
  const [chartTab, setChartTab] = useState("sentiment"); // sentiment | cost
  const [railTab, setRailTab] = useState("analytics"); // analytics | runs
  const [modelOpen, setModelOpen] = useState(false);
  const [sound, setSound] = useState(true);
  const [tkQuery, setTkQuery] = useState("");
  const [clock, setClock] = useState("");

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sound settings tracking
  const seenTweetIds = useRef<Set<string>>(new Set());
  const isInitialLoad = useRef(true);

  // Apply theme to html root
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.setAttribute("data-glow", "off");
    localStorage.setItem("at-theme", theme);
  }, [theme]);

  // UTC clock ticking
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const hh = String(d.getUTCHours()).padStart(2, "0");
      const mm = String(d.getUTCMinutes()).padStart(2, "0");
      const ss = String(d.getUTCSeconds()).padStart(2, "0");
      setClock(`${hh}:${mm}:${ss}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Monitor for new buy/sell alerts to play retrograde sound
  useEffect(() => {
    if (!recentTweets) return;

    if (isInitialLoad.current) {
      recentTweets.forEach((t) => {
        seenTweetIds.current.add(t._id);
      });
      isInitialLoad.current = false;
      return;
    }

    let hasNewBuySell = false;
    recentTweets.forEach((t) => {
      if (!seenTweetIds.current.has(t._id)) {
        seenTweetIds.current.add(t._id);
        const s = t.signal.toLowerCase();
        if (s === "buy" || s === "sell") {
          hasNewBuySell = true;
        }
      }
    });

    if (hasNewBuySell && sound) {
      playAlertSound();
    }
  }, [recentTweets, sound]);

  // Dropdown Click-Outside handler
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setModelOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Close model menu on dropdown blur
  useEffect(() => {
    if (!modelOpen) return;
    const h = () => setModelOpen(false);
    window.addEventListener("click", h);
    return () => window.removeEventListener("click", h);
  }, [modelOpen]);

  // Date formatting utility
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "N/A";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " " + d.toLocaleDateString([], { month: "short", day: "numeric" });
    } catch {
      return dateStr;
    }
  };

  // Filtered Tweets computation
  const filteredTweets = useMemo(() => {
    if (!recentTweets) return [];
    const q = search.trim().toLowerCase();
    return recentTweets.filter((tw) => {
      // Ticker filter matches
      if (ticker) {
        const twTickers = tw.tickers
          ? tw.tickers.split(",").map(t => t.trim().toUpperCase()).filter(Boolean)
          : [];
        if (!twTickers.includes(ticker)) return false;
      }
      
      // Signal filter matches
      if (filter !== "all") {
        if (tw.signal.toLowerCase() !== filter.toLowerCase()) return false;
      }
      
      // Search matches handle, text, or tickers
      if (q) {
        const twTickersStr = tw.tickers ? tw.tickers.toLowerCase() : "";
        const hay = `${tw.text} ${tw.username} ${twTickersStr}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      
      return true;
    });
  }, [recentTweets, search, filter, ticker]);

  // Ticker stats map dynamically compiled from recentTweets
  const tickerStats = useMemo(() => {
    const m: Record<string, { total: number; buy: number; bullish: number; neutral: number; bearish: number; sell: number }> = {};
    if (!recentTweets) return m;
    recentTweets.forEach((t) => {
      const tickersList = t.tickers ? t.tickers.split(",").map(tk => tk.trim().toUpperCase()).filter(Boolean) : [];
      tickersList.forEach((tk) => {
        if (!m[tk]) {
          m[tk] = { total: 0, buy: 0, bullish: 0, neutral: 0, bearish: 0, sell: 0 };
        }
        const s = m[tk];
        s.total++;
        const sig = t.signal.toLowerCase();
        if (sig === "buy") s.buy++;
        else if (sig === "bullish") s.bullish++;
        else if (sig === "neutral") s.neutral++;
        else if (sig === "bearish") s.bearish++;
        else if (sig === "sell") s.sell++;
      });
    });
    return m;
  }, [recentTweets]);

  // Compute bull/bear stats for selected ticker
  const tkSel = ticker ? (tickerStats[ticker] || { total: 0, buy: 0, bullish: 0, neutral: 0, bearish: 0, sell: 0 }) : null;
  const bb = tkSel ? {
    bull: (tkSel.buy || 0) + (tkSel.bullish || 0),
    bear: (tkSel.sell || 0) + (tkSel.bearish || 0),
    neu: (tkSel.neutral || 0)
  } : null;

  // Aggregate counts for signal filter badges (based on full stream or selected ticker)
  const filterCounts = useMemo(() => {
    const base = ticker && recentTweets
      ? recentTweets.filter((tw) => {
          const twTickers = tw.tickers
            ? tw.tickers.split(",").map(t => t.trim().toUpperCase()).filter(Boolean)
            : [];
          return twTickers.includes(ticker);
        })
      : (recentTweets || []);
    
    return {
      all: base.length,
      buy: base.filter((tw) => tw.signal.toLowerCase() === "buy").length,
      sell: base.filter((tw) => tw.signal.toLowerCase() === "sell").length,
      bullish: base.filter((tw) => tw.signal.toLowerCase() === "bullish").length,
      bearish: base.filter((tw) => tw.signal.toLowerCase() === "bearish").length,
    };
  }, [recentTweets, ticker]);

  // Donut chart distribution (sentiment mix)
  const donutData = useMemo(() => {
    const counts = { buy: 0, bullish: 0, neutral: 0, bearish: 0, sell: 0 };
    const src = ticker && recentTweets
      ? recentTweets.filter((tw) => {
          const twTickers = tw.tickers
            ? tw.tickers.split(",").map(t => t.trim().toUpperCase()).filter(Boolean)
            : [];
          return twTickers.includes(ticker);
        })
      : (recentTweets || []);

    src.forEach((tw) => {
      const sig = tw.signal.toLowerCase() as keyof typeof counts;
      if (sig in counts) {
        counts[sig]++;
      }
    });

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return { counts, total };
  }, [recentTweets, ticker]);

  // Sidebar trending tickers sorted by count
  const sortedTickers = useMemo(() => {
    if (!tweetStats?.tickerCounts) return [];
    return Object.entries(tweetStats.tickerCounts)
      .map(([name, count]) => ({ name: name.toUpperCase(), count: Number(count) }))
      .sort((a, b) => b.count - a.count);
  }, [tweetStats]);

  // Sidebar trending tickers filtered by ticker search query
  const tickerList = useMemo(() => {
    const q = tkQuery.trim().toUpperCase().replace("$", "");
    return sortedTickers
      .filter((w) => w.name !== "ALL" && w.count > 0)
      .filter((w) => !q || w.name.includes(q));
  }, [sortedTickers, tkQuery]);

  // Marquee strip items
  const marqueeItems = useMemo(() => {
    if (!sortedTickers || sortedTickers.length === 0) {
      return ["BINANCE 22", "OKX 38", "ETHENA 71", "CURVE 31", "COINBASE 14", "AAVE 17", "LIDO 12"];
    }
    return sortedTickers.slice(0, 10).map((t) => `${t.name} ${t.count}`);
  }, [sortedTickers]);

  const pickTicker = (tk: string) => {
    setTicker((prev) => (prev === tk ? null : tk));
  };

  const isLoading = recentTweets === undefined || tweetStats === undefined || recentRuns === undefined || runStats === undefined;

  // Background run items
  const runItems = useMemo(() => {
    if (!recentRuns) return [];
    return recentRuns.map((r) => {
      const hhmmss = r.timestamp
        ? new Date(r.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
        : "N/A";
      return {
        time: hhmmss,
        middle: `${r.tweetsProcessed} processed`,
        cost: `$${r.totalCost.toFixed(6)}`,
        active: r.tweetsProcessed > 0
      };
    });
  }, [recentRuns]);

  return (
    <div className="app">
      {/* COMMAND BAR */}
      <header className="cmdbar">
        <div className="cmd-brand">
          <div className="cmd-mark">
            <span className="dot" />
          </div>
          <div>
            <div className="cmd-title">
              ALPHA <b>TERMINAL</b>
            </div>
            <div className="cmd-sub">signal intelligence</div>
          </div>
        </div>

        <div className="live-chip">
          <span className="live-led" />
          LIVE · STREAMING
        </div>
        <div className="cmd-clock">
          <b>{clock}</b> UTC
        </div>

        <div className="cmd-spacer" />

        <div className="model-wrap" ref={dropdownRef} onClick={(e) => e.stopPropagation()}>
          <button className="cmd-btn" onClick={() => setModelOpen((o) => !o)}>
            <Icon.cpu w={14} />
            <span className="k">MODEL</span>
            <span className="v">
              {SUPPORTED_MODELS.find((m) => m.value === activeModel)?.label || activeModel}
            </span>
            <span style={{ fontSize: 8, color: "var(--fg-3)" }}>▾</span>
          </button>
          {modelOpen && (
            <div className="model-menu">
              {SUPPORTED_MODELS.map((m) => (
                <div
                  key={m.value}
                  className={`model-opt ${m.value === activeModel ? "active" : ""}`}
                  onClick={async () => {
                    try {
                      await updateSetting({ key: "active_model", value: m.value });
                    } catch (err) {
                      console.error("Failed to update active model:", err);
                    }
                    setModelOpen(false);
                  }}
                >
                  {m.label}
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          className="cmd-btn"
          onClick={() => setSound((s) => !s)}
          title={sound ? "Mute alerts" : "Enable alerts"}
        >
          {sound ? <Icon.vol w={14} /> : <Icon.mute w={14} />}
          <span className="k">{sound ? "SOUND ON" : "MUTED"}</span>
        </button>

        <button
          className="cmd-btn"
          onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          title="Toggle theme"
        >
          {theme === "dark" ? <Icon.sun w={14} /> : <Icon.moon w={14} />}
        </button>
      </header>

      {/* METRICS */}
      <div className="metrics">
        <div className="metric">
          <div className="metric-k">
            <Icon.activity w={13} />
            <span className="caps">Tweets Screened</span>
          </div>
          <div className="metric-v">
            {isLoading ? "..." : (tweetStats?.totalTweets ?? 0).toLocaleString()}
          </div>
          <div className="metric-sub">from background list updates</div>
        </div>
        <div className="metric accent">
          <div className="metric-k">
            <Icon.trend w={13} />
            <span className="caps">Alpha Yield</span>
          </div>
          <div className="metric-v">
            {isLoading
              ? "..."
              : (Object.entries(tweetStats?.signalCounts || {}).reduce(
                  (acc, [sig, val]) => (sig === "buy" || sig === "bullish" ? acc + Number(val) : acc),
                  0
                ))}
            <span className="u">signals</span>
          </div>
          <div className="metric-sub">bullish or buy classifications</div>
        </div>
        <div className="metric">
          <div className="metric-k">
            <Icon.dollar w={13} />
            <span className="caps">Total API Cost</span>
          </div>
          <div className="metric-v">
            {isLoading ? "..." : `$${(runStats?.totalCost ?? 0).toFixed(6)}`}
          </div>
          <div className="metric-sub">litellm + gemini costs</div>
        </div>
        <div className="metric">
          <div className="metric-k">
            <Icon.cpu w={13} />
            <span className="caps">System Runs</span>
          </div>
          <div className="metric-v">
            {isLoading ? "..." : (runStats?.runCountSample ?? 0).toLocaleString()}
          </div>
          <div className="metric-sub">total scrape runs logged</div>
        </div>
      </div>

      {/* MAIN */}
      <div className="main">
        {/* STREAM */}
        <section className="panel stream">
          <div className="panel-head">
            <h2>
              <span className="dot" />
              Live Alpha Stream
            </h2>
            <span className="count">
              {filteredTweets.length} / {isLoading ? 0 : recentTweets.length}
            </span>
          </div>

          <div className="toolbar">
            <div className="search">
              <Icon.search w={14} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="search posts, authors, tickers…"
              />
            </div>
            <div className="filters">
              <button
                className={`fbtn ${filter === "all" ? "active" : ""}`}
                onClick={() => setFilter("all")}
              >
                All <span className="pill">{filterCounts.all}</span>
              </button>
              <button
                className={`fbtn buy ${filter === "buy" ? "active" : ""}`}
                onClick={() => setFilter("buy")}
              >
                <Icon.bell w={13} /> Buy <span className="pill">{filterCounts.buy}</span>
              </button>
              <button
                className={`fbtn sell ${filter === "sell" ? "active" : ""}`}
                onClick={() => setFilter("sell")}
              >
                <Icon.bell w={13} /> Sell <span className="pill">{filterCounts.sell}</span>
              </button>
              <button
                className={`fbtn bull ${filter === "bullish" ? "active" : ""}`}
                onClick={() => setFilter("bullish")}
              >
                Bullish <span className="pill">{filterCounts.bullish}</span>
              </button>
              <button
                className={`fbtn bear ${filter === "bearish" ? "active" : ""}`}
                onClick={() => setFilter("bearish")}
              >
                Bearish <span className="pill">{filterCounts.bearish}</span>
              </button>
            </div>
          </div>

          {ticker && bb && tkSel && (
            <div className="research">
              <div className="research-top">
                <span className="research-tk">${ticker}</span>
                <span className="research-meta">{tkSel.total} mentions · researching</span>
                <button
                  className="research-x"
                  onClick={() => setTicker(null)}
                  title="Clear ticker"
                >
                  <Icon.x w={15} />
                </button>
              </div>
              <div className="senti-bar">
                {bb.bull > 0 && <i style={{ width: `${(bb.bull / tkSel.total) * 100}%`, background: "var(--bull)" }} />}
                {bb.neu > 0 && <i style={{ width: `${(bb.neu / tkSel.total) * 100}%`, background: "var(--neutral)" }} />}
                {bb.bear > 0 && <i style={{ width: `${(bb.bear / tkSel.total) * 100}%`, background: "var(--bear)" }} />}
              </div>
              <div className="senti-legend">
                <span>
                  <span className="sw" style={{ background: "var(--bull)" }} />
                  {bb.bull} bullish
                </span>
                <span>
                  <span className="sw" style={{ background: "var(--neutral)" }} />
                  {bb.neu} neutral
                </span>
                <span>
                  <span className="sw" style={{ background: "var(--bear)" }} />
                  {bb.bear} bearish
                </span>
              </div>
            </div>
          )}

          <div className="tweets">
            {isLoading ? (
              <div className="empty">
                <Icon.activity w={28} style={{ stroke: "var(--accent)" }} />
                <div>Establishing secure connection to Convex data stream...</div>
              </div>
            ) : filteredTweets.length === 0 ? (
              <div className="empty">
                <Icon.search w={28} />
                <div>
                  No posts match your filters.
                  <br />
                  Try clearing search or the ticker.
                </div>
              </div>
            ) : (
              filteredTweets.map((tw) => (
                <TweetCard
                  key={tw._id}
                  tw={tw}
                  activeTicker={ticker}
                  onTicker={pickTicker}
                  formatDate={formatDate}
                />
              ))
            )}
          </div>
        </section>

        {/* RAIL */}
        <aside className="rail">
          {/* trending tickers */}
          <div className="rail-section grow">
            <div className="panel-head">
              <h2>
                <Icon.trend w={14} />
                Trending Tickers
              </h2>
              <span className="count">{tickerList.length}</span>
            </div>
            <div className="tk-search">
              <div className="search">
                <Icon.search w={14} />
                <input
                  value={tkQuery}
                  onChange={(e) => setTkQuery(e.target.value)}
                  placeholder="find ticker…"
                />
              </div>
            </div>
            <div className="tk-list">
              {isLoading ? (
                <div className="empty" style={{ minHeight: "80px", padding: "10px" }}>
                  Calculating trending tickers...
                </div>
              ) : tickerList.length === 0 ? (
                <div className="empty" style={{ minHeight: "80px", padding: "10px" }}>
                  No stock/crypto tickers mentioned yet.
                </div>
              ) : (
                tickerList.map((w) => {
                  const st = tickerStats[w.name] || { total: w.count, buy: 0, bullish: 0, neutral: 0, bearish: 0, sell: 0 };
                  const b = {
                    bull: (st.buy || 0) + (st.bullish || 0),
                    bear: (st.sell || 0) + (st.bearish || 0),
                    neu: (st.neutral || 0)
                  };
                  const tot = st.total || w.count || 1;
                  return (
                    <div
                      key={w.name}
                      className={`tk-row ${ticker === w.name ? "on" : ""}`}
                      onClick={() => pickTicker(w.name)}
                    >
                      <span className="tkr-name">${w.name}</span>
                      <span className="tkr-bar">
                        {b.bull > 0 && <i style={{ width: `${(b.bull / tot) * 100}%`, background: "var(--bull)" }} />}
                        {b.neu > 0 && <i style={{ width: `${(b.neu / tot) * 100}%`, background: "var(--neutral)" }} />}
                        {b.bear > 0 && <i style={{ width: `${(b.bear / tot) * 100}%`, background: "var(--bear)" }} />}
                      </span>
                      <span className="tkr-count">{w.count}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* analytics + runs — combined tabbed panel */}
          <div className="rail-section panel-tabs">
            <div className="panel-head">
              <div className="seg">
                <button
                  className={`segbtn ${railTab === "analytics" ? "active" : ""}`}
                  onClick={() => setRailTab("analytics")}
                >
                  <Icon.pie w={13} />
                  Analytics
                </button>
                <button
                  className={`segbtn ${railTab === "runs" ? "active" : ""}`}
                  onClick={() => setRailTab("runs")}
                >
                  <Icon.cpu w={13} />
                  System Runs
                </button>
              </div>
              <span className="spacer" />
              {railTab === "analytics" ? (
                <div className="chart-tabs">
                  <button
                    className={`ctab ${chartTab === "sentiment" ? "active" : ""}`}
                    onClick={() => setChartTab("sentiment")}
                  >
                    <Icon.pie w={12} />
                    Sentiment
                  </button>
                  <button
                    className={`ctab ${chartTab === "cost" ? "active" : ""}`}
                    onClick={() => setChartTab("cost")}
                  >
                    <Icon.line w={12} />
                    Cost
                  </button>
                </div>
              ) : (
                <span className="count">last {isLoading ? 0 : recentRuns.length}</span>
              )}
            </div>
            {railTab === "analytics" ? (
              <div className="chart-body">
                {chartTab === "sentiment" ? (
                  <Donut counts={donutData.counts} total={donutData.total} />
                ) : (
                  <CostChart runs={recentRuns || []} />
                )}
              </div>
            ) : (
              <div className="runs">
                {isLoading ? (
                  <div className="empty" style={{ padding: "20px" }}>
                    Loading runs log...
                  </div>
                ) : runItems.length === 0 ? (
                  <div className="empty" style={{ padding: "20px" }}>
                    No runs recorded yet.
                  </div>
                ) : (
                  runItems.map((r, i) => (
                    <div className="run" key={i}>
                      <span className={`run-led ${r.active ? "on" : ""}`} />
                      <span className="run-t">{r.time} UTC</span>
                      <span className="run-mid">{r.middle}</span>
                      <span className="run-cost">{r.cost}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* MARQUEE */}
      <Marquee items={marqueeItems} />
    </div>
  );
}
