import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowsClockwise,
  CalendarBlank,
  CaretRight,
  Clock,
  Funnel,
  MagnifyingGlass,
  MapPin,
  WarningCircle,
} from "@phosphor-icons/react";
import { API_BASE_URL } from "../config";

function getUiRefreshMs() {
  const hour = new Date().getHours();
  return hour >= 8 && hour < 23 ? 60 * 1000 : 3 * 60 * 1000;
}

function formatRelative(dateValue) {
  if (!dateValue) return "Waiting for sync";
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return "Recently synced";

  const seconds = Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 1000));
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function formatDate(dateValue) {
  if (!dateValue || dateValue === "N/A") return "Date TBA";
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return dateValue;
  return parsed.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
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

function firstLetter(value) {
  return String(value || "?").trim().slice(0, 1).toUpperCase() || "?";
}

const filters = ["ALL", "LIVE", "FIXTURE", "RESULT"];

const ScoreBoard = () => {
  const navigate = useNavigate();
  const [matches, setMatches] = useState([]);
  const [activeFilter, setActiveFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const fetchHome = async ({ showLoader = false } = {}) => {
    if (showLoader) setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/get-data`);
      if (!response.ok) throw new Error("matches");
      const matchJson = await response.json();

      setMatches(Array.isArray(matchJson) ? matchJson : []);
      setError("");
    } catch {
      setError("We couldn't load matches right now. Please try again in a moment.");
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
      if (!response.ok) throw new Error("sync");
      await fetchHome();
    } catch {
      setError("Sync did not finish. Please try again.");
    } finally {
      setRefreshing(false);
    }
  };

  const visibleMatches = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return matches.filter((match) => {
      const statusMatch =
        activeFilter === "ALL" || String(match.status || "").toUpperCase() === activeFilter;
      const searchable = [
        match.team1,
        match.team2,
        match.series,
        match.venue,
        match.match_result,
      ]
        .join(" ")
        .toLowerCase();

      return statusMatch && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [activeFilter, matches, query]);

  if (loading) {
    return <div className="state-panel">Loading matches...</div>;
  }

  return (
    <section className="dashboard-stack">
      <div className="command-panel">
        <div>
          <p className="eyebrow">Live match desk</p>
          <h1>Matches</h1>
        </div>
        <button className="button button--primary" onClick={triggerRefresh} disabled={refreshing}>
          <ArrowsClockwise size={18} weight="bold" className={refreshing ? "spin" : ""} />
          {refreshing ? "Syncing" : "Sync now"}
        </button>
      </div>

      <div className="toolbar">
        <div className="segmented-control" aria-label="Filter matches">
          <Funnel size={18} weight="bold" />
          {filters.map((filter) => (
            <button
              key={filter}
              className={activeFilter === filter ? "is-active" : ""}
              onClick={() => setActiveFilter(filter)}
            >
              {filter.toLowerCase()}
            </button>
          ))}
        </div>

        <label className="search-box">
          <MagnifyingGlass size={18} weight="bold" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search team, venue, series"
          />
        </label>
      </div>

      {error && (
        <div className="alert-panel">
          <WarningCircle size={20} weight="duotone" />
          <span>{error}</span>
        </div>
      )}

      <div className="match-grid">
        {visibleMatches.map((match) => (
          <article
            key={`${match.match_id}-${match.last_synced_at}`}
            className="match-card"
            onClick={() => navigate(`/match/${match.match_id}`)}
          >
            <div className="match-card__head">
              <span className={`status-pill status-pill--${getStatusClass(match.status)}`}>
                {match.status || "FIXTURE"}
              </span>
              <span className="tiny-meta">
                <Clock size={14} weight="bold" />
                {formatRelative(match.last_synced_at)}
              </span>
            </div>

            <div className="match-card__teams">
              <div className="team-line">
                {match.team1_img ? (
                  <img src={match.team1_img} alt={match.team1} />
                ) : (
                  <span>{firstLetter(match.team1)}</span>
                )}
                <div>
                  <strong>{match.team1 || "Team TBA"}</strong>
                  <small>{match.score1 || "Yet to bat"}</small>
                </div>
              </div>

              <div className="team-line">
                {match.team2_img ? (
                  <img src={match.team2_img} alt={match.team2} />
                ) : (
                  <span>{firstLetter(match.team2)}</span>
                )}
                <div>
                  <strong>{match.team2 || "Team TBA"}</strong>
                  <small>{match.score2 || "Yet to bat"}</small>
                </div>
              </div>
            </div>

            <div className="match-card__meta">
              <span>
                <MapPin size={15} weight="bold" />
                {match.venue || "Venue TBA"}
              </span>
              <span>
                <CalendarBlank size={15} weight="bold" />
                {formatDate(match.date)}
              </span>
            </div>

            <p className="match-card__series">{getDisplaySeriesName(match)}</p>
            <p className="match-card__status">{match.match_result || "Status unavailable"}</p>

            <div className="match-card__actions">
              <span className="open-detail">
                Open match
                <CaretRight size={16} weight="bold" />
              </span>
            </div>
          </article>
        ))}
      </div>

      {!visibleMatches.length && (
        <div className="state-panel">No matches matched your current filters.</div>
      )}
    </section>
  );
};

export default ScoreBoard;
