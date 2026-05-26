import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import {
  TrendingUp,
  Activity,
  DollarSign,
  Cpu,
  Search,
  ExternalLink,
  RefreshCw,
  TrendingDown,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon
} from "lucide-react";
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid
} from "recharts";

export default function App() {
  // Real-time Convex Queries
  const recentTweets = useQuery(api.tweets.getRecentTweets, { limit: 1000 });
  const tweetStats = useQuery(api.tweets.getTweetStats);
  const recentRuns = useQuery(api.runs.getRecentRuns, { limit: 50 });
  const runStats = useQuery(api.runs.getRunStats);

  // Loading indicator helper
  const isLoading = recentTweets === undefined || tweetStats === undefined || recentRuns === undefined || runStats === undefined;

  // Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSignal, setSelectedSignal] = useState("ALL");
  const [selectedTicker, setSelectedTicker] = useState("ALL");
  const [activeChartTab, setActiveChartTab] = useState("SENTIMENT");

  // Format date nicely
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "N/A";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + " " + d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  // Filtered Tweets computation
  const filteredTweets = useMemo(() => {
    if (!recentTweets) return [];
    return recentTweets.filter((t) => {
      // Search matches handle, text, or tickers
      const matchesSearch =
        t.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.tickers.toLowerCase().includes(searchQuery.toLowerCase());

      // Signal filter matches
      let matchesSignal = true;
      if (selectedSignal === "BUY/SELL") {
        matchesSignal = t.signal === "buy" || t.signal === "sell";
      } else if (selectedSignal !== "ALL") {
        matchesSignal = t.signal.toLowerCase() === selectedSignal.toLowerCase();
      }

      // Ticker filter matches
      let matchesTicker = true;
      if (selectedTicker !== "ALL") {
        const list = t.tickers.split(",").map((s) => s.trim().toUpperCase());
        matchesTicker = list.includes(selectedTicker);
      }

      return matchesSearch && matchesSignal && matchesTicker;
    });
  }, [recentTweets, searchQuery, selectedSignal, selectedTicker]);

  // Aggregate tickers data for the sidebar sorted by count
  const sortedTickers = useMemo(() => {
    if (!tweetStats?.tickerCounts) return [];
    return Object.entries(tweetStats.tickerCounts)
      .map(([name, count]) => ({ name, count: Number(count) }))
      .sort((a, b) => b.count - a.count);
  }, [tweetStats]);

  // Render a moving ticker tape of trending items
  const marqueeItems = useMemo(() => {
    if (!sortedTickers || sortedTickers.length === 0) {
      return ["BINANCE 22", "OKX 38 ↑", "ETHENA 71 ↑", "CURVE 31 ↑", "COINBASE 14 ↓", "AAVE 17", "LIDO 12 ↓"];
    }
    return sortedTickers.slice(0, 10).map((t) => `${t.name} ${t.count}`);
  }, [sortedTickers]);

  // Chart Data: Sentiment Breakdown
  const sentimentChartData = useMemo(() => {
    if (!tweetStats?.signalCounts) return [];
    return Object.entries(tweetStats.signalCounts).map(([name, value]) => ({
      name: name.toUpperCase(),
      value: Number(value),
    }));
  }, [tweetStats]);

  // Chart Data: Cost Trend across recent 15 runs (reversed to chronological order)
  const costChartData = useMemo(() => {
    if (!recentRuns) return [];
    return recentRuns
      .slice(0, 15)
      .map((r) => ({
        time: r.timestamp ? new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "N/A",
        cost: r.totalCost * 1000, // Show in milli-cents or small units for readability
        tweets: r.tweetsProcessed,
      }))
      .reverse();
  }, [recentRuns]);

  // Colors for Sentiment Pie Chart
  const SENTIMENT_COLORS: Record<string, string> = {
    BUY: "#d83a1f",      // Brutalist Red
    SELL: "#d83a1f",     // Brutalist Red
    BULLISH: "#ffd400",  // Brutalist Yellow
    BEARISH: "#0a0a0a",  // Brutalist Ink
    NEUTRAL: "#ffffff",  // Stark White
  };

  return (
    <div className="app-container">
      {/* Navbar Header */}
      <header className="navbar glass-panel">
        <div className="brand">
          <div className="brand-icon">
            <TrendingUp size={16} color="var(--paper)" />
          </div>
          <div className="brand-text">Tweet Alpha Terminal</div>
        </div>
        <div className="live-status">
          <div className="live-pulse" />
          <span>REAL-TIME STREAMING</span>
        </div>
      </header>

      {/* Marquee Ticker Tape */}
      <div className="strip">
        <div className="track">
          {[...marqueeItems, ...marqueeItems, ...marqueeItems, ...marqueeItems].map((item, idx) => (
            <span className="item" key={idx}>
              <span className="dot" />
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* KPI Metrics Row */}
      <section className="metrics-grid">
        <div className="metric-card glass-panel">
          <div className="metric-header">
            <span>Tweets Screened</span>
            <Activity size={16} className="empty-icon" color="var(--ink)" />
          </div>
          <div className="metric-value">
            {isLoading ? "..." : tweetStats?.totalTweets}
          </div>
          <div className="metric-sub">
            <span>from background list updates</span>
          </div>
        </div>

        <div className="metric-card glass-panel success">
          <div className="metric-header">
            <span>Alpha Yield</span>
            <TrendingUp size={16} className="empty-icon" color="var(--red)" />
          </div>
          <div className="metric-value">
            {isLoading
              ? "..."
              : `${Object.entries(tweetStats?.signalCounts || {}).reduce(
                  (acc, [sig, val]) => (sig === "buy" || sig === "bullish" ? acc + Number(val) : acc),
                  0
                )} Signals`}
          </div>
          <div className="metric-sub">
            <span>Bullish or Buy classifications</span>
          </div>
        </div>

        <div className="metric-card glass-panel warning">
          <div className="metric-header">
            <span>Total API Cost</span>
            <DollarSign size={16} className="empty-icon" color="var(--ink)" />
          </div>
          <div className="metric-value">
            {isLoading ? "..." : `$${runStats?.totalCost.toFixed(6)}`}
          </div>
          <div className="metric-sub">
            <span>LiteLLM + gemini costs</span>
          </div>
        </div>

        <div className="metric-card glass-panel">
          <div className="metric-header">
            <span>System Runs</span>
            <Cpu size={16} className="empty-icon" color="var(--ink)" />
          </div>
          <div className="metric-value">
            {isLoading ? "..." : runStats?.runCountSample}
          </div>
          <div className="metric-sub">
            <span>Total scrape runs logged</span>
          </div>
        </div>
      </section>

      {/* Dashboard Body Main Grid */}
      <main className="dashboard-grid">
        
        {/* Left Column: Live Alpha Feed */}
        <section className="glass-panel">
          <div className="section-title">
            <Activity size={18} color="#6366f1" />
            <span>Live Alpha Stream</span>
            {isLoading && <RefreshCw size={14} className="animate-spin" style={{ marginLeft: "auto" }} />}
          </div>

          {/* Filtering Controls */}
          <div className="feed-controls">
            <div style={{ position: "relative", flex: 1, display: "flex", alignItems: "center" }}>
              <Search size={16} color="var(--ink)" style={{ position: "absolute", left: "12px" }} />
              <input
                type="text"
                placeholder="Search username, tickers, text..."
                className="search-input"
                style={{ paddingLeft: "36px" }}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            <button
              className={`filter-btn ${selectedSignal === "ALL" ? "active" : ""}`}
              onClick={() => setSelectedSignal("ALL")}
            >
              All Signals
            </button>
            <button
              className={`filter-btn ${selectedSignal === "BUY/SELL" ? "active" : ""}`}
              onClick={() => setSelectedSignal("BUY/SELL")}
            >
              ⚠️ Alerts Only
            </button>
            <button
              className={`filter-btn ${selectedSignal === "BULLISH" ? "active" : ""}`}
              onClick={() => setSelectedSignal("BULLISH")}
            >
              Bullish
            </button>
            <button
              className={`filter-btn ${selectedSignal === "BEARISH" ? "active" : ""}`}
              onClick={() => setSelectedSignal("BEARISH")}
            >
              Bearish
            </button>
            
            {selectedTicker !== "ALL" && (
              <button
                className="filter-btn active"
                style={{ borderColor: "#10b981" }}
                onClick={() => setSelectedTicker("ALL")}
              >
                Ticker: {selectedTicker} (x)
              </button>
            )}
          </div>

          {/* Scrolling Feed */}
          <div className="tweets-list">
            {isLoading ? (
              <div className="empty-state">
                <RefreshCw size={32} className="animate-spin" color="#6366f1" />
                <p>Establishing secure connection to Convex data stream...</p>
              </div>
            ) : filteredTweets.length === 0 ? (
              <div className="empty-state">
                <TrendingDown size={32} />
                <p>No screening tweets match your filters.</p>
              </div>
            ) : (
              filteredTweets.map((t) => (
                <article className="tweet-card" key={t._id}>
                  <div className="tweet-card-header">
                    <div className="tweet-author">
                      <a
                        href={`https://x.com/${t.username}`}
                        target="_blank"
                        rel="noreferrer"
                        className="author-name"
                      >
                        @{t.username}
                      </a>
                      <span className="tweet-time">{formatDate(t.processedAt)}</span>
                    </div>
                    
                    <span className={`signal-badge ${t.signal.toLowerCase()}`}>
                      {t.signal.toLowerCase() === "buy" || t.signal.toLowerCase() === "sell" ? "⚠️ " : ""}
                      {t.signal}
                    </span>
                  </div>

                  <p className="tweet-content">{t.text}</p>

                  <div className="tweet-card-footer">
                    <div className="tweet-tickers-row">
                      {t.tickers &&
                        t.tickers.split(",").map((tick) => {
                          const cleanTick = tick.trim().toUpperCase();
                          if (!cleanTick) return null;
                          return (
                            <span
                              className={`ticker-badge ${selectedTicker === cleanTick ? "active" : ""}`}
                              key={cleanTick}
                              onClick={() => setSelectedTicker(selectedTicker === cleanTick ? "ALL" : cleanTick)}
                            >
                              ${cleanTick}
                            </span>
                          );
                        })}
                    </div>
                    
                    <a
                      href={`https://x.com/${t.username}/status/${t.tweetId}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ display: "flex", alignItems: "center", gap: "0.25rem", color: "#64748b", fontSize: "0.8rem", textDecoration: "none" }}
                    >
                      <span>View Tweet</span>
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        {/* Right Column: Trending Tickers & Recharts */}
        <section style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          
          {/* Ticker Watchboard */}
          <div className="glass-panel">
            <div className="section-title">
              <TrendingUp size={18} color="#10b981" />
              <span>Trending Tickers</span>
            </div>
            <div className="tickers-panel">
              {isLoading ? (
                <p style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>Calculating trending ticker frequency...</p>
              ) : sortedTickers.length === 0 ? (
                <p style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>No stock/crypto tickers mentioned yet.</p>
              ) : (
                <div className="tickers-flex">
                  <div
                    className={`ticker-widget ${selectedTicker === "ALL" ? "active" : ""}`}
                    onClick={() => setSelectedTicker("ALL")}
                  >
                    <span className="ticker-name">ALL</span>
                  </div>
                  {sortedTickers.map((tick) => (
                    <div
                      className={`ticker-widget ${selectedTicker === tick.name ? "active" : ""}`}
                      key={tick.name}
                      onClick={() => setSelectedTicker(selectedTicker === tick.name ? "ALL" : tick.name)}
                    >
                      <span className="ticker-name">${tick.name}</span>
                      <span className="ticker-count">{tick.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recharts Analytics Panel */}
          <div className="glass-panel">
            <div className="section-title">
              <LineChartIcon size={18} color="#a855f7" />
              <span>Terminal Analytics</span>
            </div>
            
            <div className="chart-tabs">
              <button
                className={`chart-tab ${activeChartTab === "SENTIMENT" ? "active" : ""}`}
                onClick={() => setActiveChartTab("SENTIMENT")}
              >
                <PieChartIcon size={14} style={{ marginRight: "4px", verticalAlign: "middle" }} />
                Sentiment Mix
              </button>
              <button
                className={`chart-tab ${activeChartTab === "COST" ? "active" : ""}`}
                onClick={() => setActiveChartTab("COST")}
              >
                <LineChartIcon size={14} style={{ marginRight: "4px", verticalAlign: "middle" }} />
                Execution Costs
              </button>
            </div>

            <div className="chart-container">
              {isLoading ? (
                <div className="empty-state">
                  <RefreshCw size={24} className="animate-spin" />
                </div>
              ) : activeChartTab === "SENTIMENT" ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={sentimentChartData}
                      cx="50%"
                      cy="45%"
                      innerRadius={45}
                      outerRadius={75}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {sentimentChartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={SENTIMENT_COLORS[entry.name] || "#64748b"}
                          stroke="#0a0a0a"
                          strokeWidth={2}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: "#ffffff", border: "2px solid #0a0a0a", borderRadius: "0px", color: "#0a0a0a", fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: "700" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={costChartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#0a0a0a" strokeOpacity={0.1} />
                    <XAxis dataKey="time" stroke="#0a0a0a" fontSize={9} fontFamily="var(--font-mono)" fontWeight={700} />
                    <YAxis stroke="#0a0a0a" fontSize={9} fontFamily="var(--font-mono)" fontWeight={700} />
                    <Tooltip
                      formatter={(val: any) => [`$${(val / 1000).toFixed(6)}`, "Cost"]}
                      contentStyle={{ background: "#ffffff", border: "2px solid #0a0a0a", borderRadius: "0px", color: "#0a0a0a", fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: "700" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="cost"
                      stroke="#d83a1f"
                      strokeWidth={3}
                      dot={{ r: 4, stroke: "#0a0a0a", strokeWidth: 2, fill: "#ffd400" }}
                      activeDot={{ r: 6, fill: "#d83a1f", stroke: "#0a0a0a", strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
            
            {activeChartTab === "SENTIMENT" && !isLoading && (
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0.75rem", marginTop: "-10px", fontSize: "0.75rem" }}>
                {sentimentChartData.map((d) => (
                  <div key={d.name} style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: SENTIMENT_COLORS[d.name] || "#64748b" }} />
                    <span style={{ color: "var(--text-muted)" }}>{d.name}: {d.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Background Run Logs */}
          <div className="glass-panel">
            <div className="section-title">
              <Activity size={18} color="#94a3b8" />
              <span>Background Runs Log</span>
            </div>
            <div className="runs-list">
              {isLoading ? (
                <p style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>Retrieving scheduler history...</p>
              ) : recentRuns.length === 0 ? (
                <p style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>No runs recorded yet.</p>
              ) : (
                recentRuns.map((r) => (
                  <div className="run-row" key={r._id}>
                    <div className="run-left">
                      <div className={`run-indicator ${r.tweetsProcessed > 0 ? "active" : ""}`} />
                      <span className="run-time">{formatDate(r.timestamp)}</span>
                    </div>
                    <div className="run-middle">
                      <span>{r.tweetsProcessed} processed</span>
                    </div>
                    <div className="run-right">
                      <span className="run-cost">${r.totalCost.toFixed(6)}</span>
                      <span className="run-model">{r.modelUsed.split("/")[1] || r.modelUsed}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
        
      </main>
    </div>
  );
}
