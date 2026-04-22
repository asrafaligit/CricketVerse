import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
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

const MatchDetails = () => {
  const { id: matchId } = useParams();
  const [matchData, setMatchData] = useState(null);
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let intervalId;
    const fetchMatchDetails = async () => {
      try {
        const [matchRes, weatherRes] = await Promise.all([
          fetch(`${API_BASE_URL}/get-match-by-matchid/${matchId}?includePerformance=true`),
          fetch(`${API_BASE_URL}/get-weather-by-match/${matchId}`),
        ]);

        if (!matchRes.ok) throw new Error(`Server error: ${matchRes.status}`);
        const data = await matchRes.json();
        setMatchData(data);

        if (weatherRes.ok) {
          const weatherData = await weatherRes.json();
          setWeather(weatherData);
        } else {
          setWeather(null);
        }

        setError("");
      } catch (err) {
        setError(err.message || "Unable to load match details");
      } finally {
        setLoading(false);
      }
    };

    if (matchId) {
      fetchMatchDetails();
      intervalId = setInterval(fetchMatchDetails, getRefreshMs());
    }

    return () => clearInterval(intervalId);
  }, [matchId]);

  const handleRefreshLatest = async () => {
    setRefreshing(true);
    try {
      const response = await fetch(`${API_BASE_URL}/refresh-live-data`, {
        method: "POST",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.message || "Refresh failed");
      }
      const [matchRes, weatherRes] = await Promise.all([
        fetch(`${API_BASE_URL}/get-match-by-matchid/${matchId}?includePerformance=true`),
        fetch(`${API_BASE_URL}/get-weather-by-match/${matchId}`),
      ]);
      if (!matchRes.ok) {
        throw new Error(`Server error: ${matchRes.status}`);
      }
      const data = await matchRes.json();
      setMatchData(data);
      if (weatherRes.ok) {
        setWeather(await weatherRes.json());
      }
    } catch (err) {
      setError(err.message || "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  const insights = useMemo(() => {
    if (!matchData?.match_stats) return [];
    const stats = matchData.match_stats;
    return [
      { label: "Current RR", value: stats.currentRunRate ?? "N/A" },
      { label: "Required RR", value: stats.requiredRunRate ?? "N/A" },
      { label: "Runs needed", value: stats.runsRequired ?? "N/A" },
      { label: "Balls left", value: stats.ballsRemaining ?? "N/A" },
      { label: "Wickets in hand", value: stats.wicketsInHand ?? "N/A" },
      { label: "Target", value: stats.target ?? "N/A" },
    ];
  }, [matchData]);

  if (loading) return <div className="cv-panel cv-loading">Loading match details...</div>;
  if (error) return <div className="cv-panel cv-error">{error}</div>;
  if (!matchData) return <div className="cv-panel cv-error">Match not found</div>;

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
    score_breakdown,
    inning_1,
    inning_2,
    top_batters = [],
    top_bowlers = [],
    scorecard_available,
    scorecard_error,
  } = matchData;

  const knownTeams = [
    "INDIA",
    "AUSTRALIA",
    "ENGLAND",
    "PAKISTAN",
    "WEST INDIES",
    "SOUTH AFRICA",
    "SRI LANKA",
    "BANGLADESH",
  ];

  const isPredictableMatch =
    knownTeams.includes(team1?.toUpperCase()) &&
    knownTeams.includes(team2?.toUpperCase()) &&
    /t20|t-20|twenty20/i.test(matchData.match_format || "");

  const renderRows = (title, rows, columns) => {
    if (!rows?.length) return null;
    return (
      <section className="cv-panel cv-table-panel">
        <div className="cv-section-head">
          <p className="cv-eyebrow">Detailed card</p>
          <h3>{title}</h3>
        </div>
        <div className="cv-table-wrap">
          <table className="cv-table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col.key}>{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.name}-${index}`}>
                  {columns.map((col) => (
                    <td key={col.key}>{row[col.key] ?? "N/A"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  };

  return (
    <section className="cv-dashboard">
      <div className="cv-hero cv-panel cv-hero--detail">
        <div className="detail-header">
          <div>
            <p className="cv-eyebrow">{status}</p>
            <p className="detail-line">{getDisplaySeriesName(matchData)}</p>
            <p className="detail-line detail-line--muted">{venue || "Ground TBA"}</p>
          </div>
          <div className="sync-stack sync-stack--detail">
            <button
              className={`sync-dial ${refreshing ? "sync-dial--active" : ""}`}
              onClick={handleRefreshLatest}
              title="Sync match detail"
              aria-label="Sync match detail"
            >
              <span className="sync-dial__ring" />
              <span className="sync-dial__core">{refreshing ? "..." : "Sync"}</span>
            </button>
            <button className="detail-refresh" onClick={handleRefreshLatest}>
              {refreshing ? "Refreshing..." : "Refresh for latest match detail"}
            </button>
          </div>
        </div>

        <div className="detail-scoreboard detail-scoreboard--full">
          <div className="detail-team detail-team--left">
            {team1_img ? <img src={team1_img} alt={team1} /> : <span>{team1?.slice(0, 1)}</span>}
            <div>
              <label>{team1}</label>
              <strong>{score1 || "Yet to bat"}</strong>
            </div>
          </div>
          <div className="team-stack__divider team-stack__divider--hero">VS</div>
          <div className="detail-team detail-team--right">
            {team2_img ? <img src={team2_img} alt={team2} /> : <span>{team2?.slice(0, 1)}</span>}
            <div>
              <label>{team2}</label>
              <strong>{score2 || "Yet to bat"}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="cv-analytics">
        {insights.map((item) => (
          <article className="cv-stat cv-panel" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        ))}
      </div>

      <div className="cv-detail-grid">
        <section className="cv-panel">
          <div className="cv-section-head">
            <p className="cv-eyebrow">Match state</p>
            <h3>{status === "RESULT" ? "Final outcome" : "Live edge"}</h3>
          </div>
          {status === "RESULT" ? (
            <p className="cv-result-copy">{match_result}</p>
          ) : isPredictableMatch && scorecard_available ? (
            <Prediction match={matchData} />
          ) : (
            <p className="cv-result-copy">
              {scorecard_error || "Prediction is waiting for a richer scorecard snapshot."}
            </p>
          )}
        </section>

        <section className="cv-panel">
          <div className="cv-section-head">
            <p className="cv-eyebrow">Conditions</p>
            <h3>Weather</h3>
          </div>
          {weather ? (
            <div className="cv-meta-list">
              <p><strong>Conditions:</strong> {weather.conditions || "N/A"}</p>
              <p><strong>Temperature:</strong> {weather.temperature ?? "N/A"} C</p>
              <p><strong>Humidity:</strong> {weather.humidity ?? "N/A"}%</p>
              <p><strong>Wind:</strong> {weather.windSpeed ?? "N/A"} km/h</p>
              <p><strong>Cloud cover:</strong> {weather.cloudCover ?? "N/A"}%</p>
            </div>
          ) : (
            <p className="cv-subtext">Weather information is not available for this match yet.</p>
          )}
        </section>

        <section className="cv-panel">
          <div className="cv-section-head">
            <p className="cv-eyebrow">Context</p>
            <h3>Match info</h3>
          </div>
          <div className="cv-meta-list">
            <p><strong>Date:</strong> {date || "N/A"}</p>
            <p><strong>Toss:</strong> {toss || "N/A"}</p>
            <p><strong>Run rate:</strong> {current_run_rate || "N/A"}</p>
            <p><strong>Player of the match:</strong> {player_of_the_match || "N/A"}</p>
            <p><strong>Status note:</strong> {match_result || "N/A"}</p>
          </div>
        </section>
      </div>

      {!!score_breakdown?.length && (
        <section className="cv-panel">
          <div className="cv-section-head">
            <p className="cv-eyebrow">Innings flow</p>
            <h3>Score breakdown</h3>
          </div>
          <div className="cv-breakdown-grid">
            {score_breakdown.map((item, index) => (
              <article className="cv-breakdown-card" key={`${item.inning}-${index}`}>
                <p>{item.inning}</p>
                <strong>{item.summary || "Unavailable"}</strong>
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="cv-detail-grid">
        <section className="cv-panel">
          <div className="cv-section-head">
            <p className="cv-eyebrow">Performance</p>
            <h3>Top batters</h3>
          </div>
          <div className="cv-leader-list">
            {top_batters.length ? top_batters.slice(0, 4).map((player, index) => (
              <div className="cv-leader-row" key={`${player.name}-${index}`}>
                <span>{player.name}</span>
                <strong>{player.runs} ({player.balls})</strong>
              </div>
            )) : <p className="cv-subtext">No batting leaders available yet.</p>}
          </div>
        </section>

        <section className="cv-panel">
          <div className="cv-section-head">
            <p className="cv-eyebrow">Performance</p>
            <h3>Top bowlers</h3>
          </div>
          <div className="cv-leader-list">
            {top_bowlers.length ? top_bowlers.slice(0, 4).map((player, index) => (
              <div className="cv-leader-row" key={`${player.name}-${index}`}>
                <span>{player.name}</span>
                <strong>{player.wickets}/{player.runsConceded}</strong>
              </div>
            )) : <p className="cv-subtext">No bowling leaders available yet.</p>}
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
