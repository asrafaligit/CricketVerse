import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL } from "../config";

function getUiRefreshMs() {
  const hour = new Date().getHours();
  return hour >= 8 && hour < 23 ? 60 * 1000 : 3 * 60 * 1000;
}

function formatRelative(dateValue) {
  if (!dateValue) return "Waiting for sync";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(dateValue).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3600)}h ago`;
}

function getStatusClass(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "live") return "live";
  if (normalized === "result") return "result";
  return "fixture";
}

function getDisplaySeriesName(match) {
  const fullSeries = String(match?.series || "").trim();
  const matchup = `${match?.team1 || ""} vs ${match?.team2 || ""}`.trim();

  if (!fullSeries) return "Series unavailable";
  if (matchup && fullSeries.toLowerCase().startsWith(matchup.toLowerCase())) {
    return fullSeries.slice(matchup.length).replace(/^,\s*/, "").trim() || fullSeries;
  }

  return fullSeries;
}

const ScoreBoard = () => {
  const navigate = useNavigate();
  const railRef = useRef(null);
  const [matches, setMatches] = useState([]);
  const [refreshMeta, setRefreshMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const fetchHome = async ({ showLoader = false } = {}) => {
    if (showLoader) setLoading(true);
    try {
      const [matchesRes, statusRes] = await Promise.all([
        fetch(`${API_BASE_URL}/get-data`),
        fetch(`${API_BASE_URL}/refresh-status`),
      ]);

      if (!matchesRes.ok) throw new Error(`Match feed failed: ${matchesRes.status}`);
      if (!statusRes.ok) throw new Error(`Refresh status failed: ${statusRes.status}`);

      const [matchJson, statusJson] = await Promise.all([
        matchesRes.json(),
        statusRes.json(),
      ]);

      setMatches(Array.isArray(matchJson) ? matchJson : []);
      setRefreshMeta(statusJson);
      setError("");
    } catch (err) {
      setError(err.message || "Unable to load matches");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHome({ showLoader: true });
    const intervalId = setInterval(() => fetchHome(), getUiRefreshMs());
    return () => clearInterval(intervalId);
  }, []);

  const triggerRefresh = async () => {
    setRefreshing(true);
    try {
      const response = await fetch(`${API_BASE_URL}/refresh-live-data`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "Sync failed");
      await fetchHome();
    } catch (err) {
      setError(err.message || "Sync failed");
    } finally {
      setRefreshing(false);
    }
  };

  const scrollRail = (direction) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({
      left: direction * Math.max(rail.clientWidth * 0.92, 320),
      behavior: "smooth",
    });
  };

  if (loading) {
    return <div className="cv-panel cv-loading">Loading matches...</div>;
  }

  return (
    <section className="home-shell">
      <div className="home-hero cv-panel">
        <div className="home-hero__copy">
          <p className="cv-eyebrow">Live match desk</p>
          <h2>Track multiple matches at a glance.</h2>
          <p className="home-hero__sub">
            Browse the compact match cards, then open any match for the richer full-width detail view.
          </p>
        </div>

        <div className="sync-stack">
          <button
            className={`sync-dial ${refreshing ? "sync-dial--active" : ""}`}
            onClick={triggerRefresh}
            title="Sync live data"
            aria-label="Sync live data"
          >
            <span className="sync-dial__ring" />
            <span className="sync-dial__core">{refreshing ? "..." : "Sync"}</span>
          </button>
          <button className="detail-refresh" onClick={triggerRefresh}>
            {refreshing ? "Refreshing..." : "Refresh for latest match detail"}
          </button>
        </div>
      </div>

      <div className="home-strip__meta cv-panel">
        <div>
          <p className="cv-eyebrow">Auto cadence</p>
          <strong>{refreshMeta?.window === "day" ? "Day mode" : "Night mode"}</strong>
        </div>
        <div>
          <p className="cv-eyebrow">Last sync</p>
          <strong>{formatRelative(refreshMeta?.lastRunCompletedAt)}</strong>
        </div>
        <div>
          <p className="cv-eyebrow">Matches</p>
          <strong>{matches.length}</strong>
        </div>
      </div>

      {error && <div className="cv-panel cv-error">{error}</div>}

      <div className="rail-stage cv-panel">
        <button
          className="rail-control rail-control--left"
          onClick={() => scrollRail(-1)}
          aria-label="Scroll left"
        >
          &#8592;
        </button>

        <div className="match-rail" ref={railRef}>
          {matches.map((match) => (
            <article
              key={`${match.match_id}-${match.last_synced_at}`}
              className="match-shell match-shell--compact"
              onClick={() => navigate(`/match/${match.match_id}`)}
            >
              <div className="match-shell__top">
                <div>
                  <p className="match-series">{match.series || "Series unavailable"}</p>
                  <span className="match-shell__time">{formatRelative(match.last_synced_at)}</span>
                </div>
                <span className={`match-pill match-pill--${getStatusClass(match.status)}`}>
                  {match.status}
                </span>
              </div>

              <div className="team-stack">
                <div className="team-stack__row">
                  <div className="team-stack__identity">
                    {match.team1_img ? (
                      <img src={match.team1_img} alt={match.team1} />
                    ) : (
                      <span>{match.team1.slice(0, 1)}</span>
                    )}
                    <label>{match.team1}</label>
                  </div>
                  <strong>{match.score1 || "Yet to bat"}</strong>
                </div>

                <div className="team-stack__divider">vs</div>

                <div className="team-stack__row">
                  <div className="team-stack__identity">
                    {match.team2_img ? (
                      <img src={match.team2_img} alt={match.team2} />
                    ) : (
                      <span>{match.team2.slice(0, 1)}</span>
                    )}
                    <label>{match.team2}</label>
                  </div>
                  <strong>{match.score2 || "Yet to bat"}</strong>
                </div>
              </div>

              <p className="match-series match-series--compact">
                {getDisplaySeriesName(match)}
              </p>
            </article>
          ))}
        </div>

        <button
          className="rail-control rail-control--right"
          onClick={() => scrollRail(1)}
          aria-label="Scroll right"
        >
          &#8594;
        </button>
      </div>
    </section>
  );
};

export default ScoreBoard;
