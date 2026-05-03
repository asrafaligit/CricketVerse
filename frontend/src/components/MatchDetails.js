import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  ArrowsClockwise,
  CalendarBlank,
  CloudSun,
  Gauge,
  MapPin,
  ShieldCheck,
  Target,
  WarningCircle,
} from "@phosphor-icons/react";
import { API_BASE_URL } from "../config";
import Prediction from "./Prediction";

function getRefreshMs() {
  const hour = new Date().getHours();
  return hour >= 8 && hour < 23 ? 60 * 1000 : 3 * 60 * 1000;
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

function getStatusClass(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "live") return "live";
  if (normalized === "result") return "result";
  return "fixture";
}

function formatDate(value) {
  if (!value || value === "N/A") return "Date TBA";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function firstLetter(value) {
  return String(value || "?").trim().slice(0, 1).toUpperCase() || "?";
}

function cleanCell(value) {
  if (value == null || value === "") return "N/A";
  if (typeof value === "object") return value.name || value.playerName || "N/A";
  return String(value);
}

function findBreakdownScore(match, teamName, fallback) {
  const normalizedTeam = String(teamName || "").toLowerCase();
  const breakdown = Array.isArray(match?.score_breakdown) ? match.score_breakdown : [];
  const item = breakdown.find((entry) =>
    String(entry?.inning || "").toLowerCase().includes(normalizedTeam)
  );

  return item?.summary || fallback || "Yet to bat";
}

const KNOWN_TEAMS = [
  "INDIA",
  "AUSTRALIA",
  "ENGLAND",
  "PAKISTAN",
  "WEST INDIES",
  "SOUTH AFRICA",
  "SRI LANKA",
  "BANGLADESH",
];

const MatchDetails = () => {
  const { id: matchId } = useParams();
  const [matchData, setMatchData] = useState(null);
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const fetchMatchDetails = useCallback(async () => {
    try {
      const [matchRes, weatherRes] = await Promise.all([
        fetch(`${API_BASE_URL}/get-match-by-matchid/${matchId}?includePerformance=true`),
        fetch(`${API_BASE_URL}/get-weather-by-match/${matchId}`),
      ]);

      if (!matchRes.ok) throw new Error("match");
      const data = await matchRes.json();
      setMatchData(data);

      if (weatherRes.ok) {
        setWeather(await weatherRes.json());
      } else {
        setWeather(null);
      }

      setError("");
    } catch {
      setError("We couldn't load this match right now. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    let intervalId;

    if (matchId) {
      fetchMatchDetails();
      intervalId = setInterval(fetchMatchDetails, getRefreshMs());
    }

    return () => clearInterval(intervalId);
  }, [fetchMatchDetails, matchId]);

  const handleRefreshLatest = async () => {
    setRefreshing(true);
    try {
      const response = await fetch(`${API_BASE_URL}/refresh-live-data`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("refresh");
      await fetchMatchDetails();
    } catch {
      setError("Refresh did not finish. Please try again.");
    } finally {
      setRefreshing(false);
    }
  };

  const isPredictableMatch = useMemo(() => {
    if (!matchData) return false;
    return (
      KNOWN_TEAMS.includes(matchData.team1?.toUpperCase()) &&
      KNOWN_TEAMS.includes(matchData.team2?.toUpperCase()) &&
      /t20|t-20|twenty20/i.test(matchData.match_format || "")
    );
  }, [matchData]);

  if (loading) return <div className="state-panel">Loading match details...</div>;
  if (error) {
    return (
      <div className="alert-panel">
        <WarningCircle size={20} weight="duotone" />
        <span>{error}</span>
      </div>
    );
  }
  if (!matchData) return <div className="state-panel">Match not found</div>;

  const {
    team1,
    team2,
    team1_img,
    team2_img,
    score1,
    score2,
    match_result,
    toss,
    venue,
    date,
    player_of_the_match,
    current_run_rate,
    status,
    inning_1,
    inning_2,
    top_batters = [],
    top_bowlers = [],
    scorecard_available,
  } = matchData;

  const isResult = status === "RESULT";
  const isLive = status === "LIVE";
  const team1Score = findBreakdownScore(matchData, team1, score1);
  const team2Score = findBreakdownScore(matchData, team2, score2);

  const renderRows = (title, rows, columns) => {
    if (!rows?.length) return null;
    return (
      <section className="data-panel">
        <h2 className="table-title">{title}</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col.key}>{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${cleanCell(row.name)}-${index}`}>
                  {columns.map((col) => (
                    <td key={col.key}>{cleanCell(row[col.key])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  };

  const renderTeam = (name, image, score, align = "left") => (
    <div className={`score-team score-team--${align}`}>
      {image ? <img src={image} alt={name} /> : <span>{firstLetter(name)}</span>}
      <div>
        <label>{name || "Team TBA"}</label>
        <strong>{score}</strong>
      </div>
    </div>
  );

  return (
    <section className="match-detail-page">
      <div className="match-detail-head">
        <div>
          <span className={`status-pill status-pill--${getStatusClass(status)}`}>
            {status || "FIXTURE"}
          </span>
          <h1>{team1} vs {team2}</h1>
          <p>{getDisplaySeriesName(matchData)}</p>
        </div>
        <button className="button button--primary" onClick={handleRefreshLatest} disabled={refreshing}>
          <ArrowsClockwise size={18} weight="bold" className={refreshing ? "spin" : ""} />
          {refreshing ? "Refreshing" : "Refresh"}
        </button>
      </div>

      <div className="score-panel score-panel--hero">
        {renderTeam(team1, team1_img, team1Score, "left")}
        <span className="score-versus">VS</span>
        {renderTeam(team2, team2_img, team2Score, "right")}
      </div>

      <section className="result-panel">
        <p className="eyebrow">Match result</p>
        {isResult ? (
          <h2>{match_result || "Result unavailable"}</h2>
        ) : isLive && isPredictableMatch && scorecard_available ? (
          <Prediction match={matchData} />
        ) : (
          <h2>Prediction not available for this match.</h2>
        )}
      </section>

      <div className="detail-layout detail-layout--two">
        <section className="data-panel">
          <div className="section-heading">
            <p className="eyebrow">Match details</p>
            <h2>Details</h2>
          </div>
          <div className="info-list">
            <p><MapPin size={17} weight="duotone" /> <span>{venue || "Venue TBA"}</span></p>
            <p><CalendarBlank size={17} weight="duotone" /> <span>{formatDate(date)}</span></p>
            <p><strong>Toss</strong><span>{toss || "N/A"}</span></p>
            <p><strong>Player of the match</strong><span>{player_of_the_match || "N/A"}</span></p>
            <p><strong>Run rate</strong><span>{current_run_rate || "N/A"}</span></p>
          </div>
        </section>

        <section className="data-panel">
          <div className="section-heading">
            <p className="eyebrow">Weather</p>
            <h2>Conditions</h2>
          </div>
          {weather ? (
            <div className="info-list">
              <p><CloudSun size={17} weight="duotone" /> <span>{weather.conditions || "N/A"}</span></p>
              <p><Gauge size={17} weight="duotone" /> <span>{weather.temperature ?? "N/A"} C</span></p>
              <p><Target size={17} weight="duotone" /> <span>{weather.humidity ?? "N/A"}% humidity</span></p>
              <p><ShieldCheck size={17} weight="duotone" /> <span>{weather.windSpeed ?? "N/A"} km/h wind</span></p>
            </div>
          ) : (
            <p className="muted-copy">Weather information is not available for this match.</p>
          )}
        </section>
      </div>

      <div className="detail-layout detail-layout--two">
        <section className="data-panel">
          <div className="section-heading">
            <p className="eyebrow">Performance</p>
            <h2>Top batters</h2>
          </div>
          <div className="leader-list">
            {top_batters.length ? top_batters.slice(0, 5).map((player, index) => (
              <div className="leader-row" key={`${player.name}-${index}`}>
                <span>{cleanCell(player.name)}</span>
                <strong>{player.runs} ({player.balls})</strong>
              </div>
            )) : <p className="muted-copy">No batting leaders available yet.</p>}
          </div>
        </section>

        <section className="data-panel">
          <div className="section-heading">
            <p className="eyebrow">Performance</p>
            <h2>Top bowlers</h2>
          </div>
          <div className="leader-list">
            {top_bowlers.length ? top_bowlers.slice(0, 5).map((player, index) => (
              <div className="leader-row" key={`${player.name}-${index}`}>
                <span>{cleanCell(player.name)}</span>
                <strong>{player.wickets}/{player.runsConceded}</strong>
              </div>
            )) : <p className="muted-copy">No bowling leaders available yet.</p>}
          </div>
        </section>
      </div>

      {renderRows(`${team1} batting`, inning_1?.batting, [
        { key: "name", label: "Batter" },
        { key: "diss_summary", label: "Dismissal" },
        { key: "runs", label: "Runs" },
        { key: "balls", label: "Balls" },
        { key: "fours", label: "4s" },
        { key: "sixes", label: "6s" },
        { key: "strike_rate", label: "SR" },
      ])}
      {renderRows(`${team2} bowling`, inning_1?.bowling, [
        { key: "name", label: "Bowler" },
        { key: "overs", label: "Overs" },
        { key: "maidens", label: "Mdns" },
        { key: "runs_conceded", label: "Runs" },
        { key: "wickets", label: "Wkts" },
        { key: "economy", label: "Eco" },
      ])}
      {renderRows(`${team2} batting`, inning_2?.batting, [
        { key: "name", label: "Batter" },
        { key: "diss_summary", label: "Dismissal" },
        { key: "runs", label: "Runs" },
        { key: "balls", label: "Balls" },
        { key: "fours", label: "4s" },
        { key: "sixes", label: "6s" },
        { key: "strike_rate", label: "SR" },
      ])}
      {renderRows(`${team1} bowling`, inning_2?.bowling, [
        { key: "name", label: "Bowler" },
        { key: "overs", label: "Overs" },
        { key: "maidens", label: "Mdns" },
        { key: "runs_conceded", label: "Runs" },
        { key: "wickets", label: "Wkts" },
        { key: "economy", label: "Eco" },
      ])}
    </section>
  );
};

export default MatchDetails;
