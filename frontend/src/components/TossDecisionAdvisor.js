import React, { useEffect, useState } from "react";
import { API_BASE_URL, TOSS_ADVISOR_API_URL } from "../config";

const TOP_TEAMS = [
  "India",
  "Australia",
  "England",
  "Pakistan",
  "West Indies",
  "South Africa",
  "Sri Lanka",
  "Bangladesh",
];

const TossDecisionAdvisor = () => {
  const [matches, setMatches] = useState([]);
  const [selectedMatchId, setSelectedMatchId] = useState("");
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [weather, setWeather] = useState(null);
  const [decision, setDecision] = useState("");
  const [error, setError] = useState("");
  const [loadingDecision, setLoadingDecision] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE_URL}/get-data`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load matches: ${res.status}`);
        return res.json();
      })
      .then((raw) => {
        const uniqueMatches = new Map();
        raw.forEach((match) => {
          const isT20 = /t20/i.test(match.match_format || "");
          const isTopTeams =
            TOP_TEAMS.includes(match.team1) && TOP_TEAMS.includes(match.team2);

          if (isT20 && isTopTeams && !uniqueMatches.has(match.match_id)) {
            uniqueMatches.set(match.match_id, match);
          }
        });

        setMatches(Array.from(uniqueMatches.values()));
      })
      .catch((err) => setError(err.message || "Unable to load toss advisor"));
  }, []);

  useEffect(() => {
    const match = matches.find((item) => item.match_id === selectedMatchId) || null;
    setSelectedMatch(match);
    setDecision("");

    if (!match) {
      setWeather(null);
      return;
    }

    fetch(`${API_BASE_URL}/get-weather-by-match/${match.match_id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setWeather(data))
      .catch(() => setWeather(null));
  }, [matches, selectedMatchId]);

  const handleDecision = async () => {
    if (!selectedMatch || !weather) return;
    setLoadingDecision(true);
    setError("");

    try {
      const response = await fetch(`${TOSS_ADVISOR_API_URL}/toss-decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team1: selectedMatch.team1,
          team2: selectedMatch.team2,
          venue: selectedMatch.venue,
          weather,
        }),
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || "Unable to get toss decision");
      }

      setDecision(json.decision);
    } catch (err) {
      setError(err.message || "Unable to get toss decision");
    } finally {
      setLoadingDecision(false);
    }
  };

  return (
    <section className="cv-dashboard">
      <div className="cv-panel advisor-shell">
        <div className="cv-section-head">
          <p className="cv-eyebrow">Toss strategy</p>
          <h3>Toss Decision Advisor</h3>
        </div>

        {matches.length > 0 ? (
          <>
            <div className="advisor-select-wrap">
              <select
                className="advisor-select"
                value={selectedMatchId}
                onChange={(e) => setSelectedMatchId(e.target.value)}
              >
                <option value="">Select a T20 match</option>
                {matches.map((match) => (
                  <option key={match.match_id} value={match.match_id}>
                    {`${match.team1} vs ${match.team2} - ${match.date}`}
                  </option>
                ))}
              </select>
            </div>

            {selectedMatch && (
              <div className="advisor-grid">
                <div className="cv-panel advisor-card">
                  <p className="detail-line">{selectedMatch.team1} vs {selectedMatch.team2}</p>
                  <p className="detail-line detail-line--muted">{selectedMatch.venue}</p>
                  <p className="cv-subtext">{selectedMatch.series || "Series unavailable"}</p>
                </div>

                <div className="cv-panel advisor-card">
                  <p className="detail-line">Weather snapshot</p>
                  {weather ? (
                    <div className="cv-meta-list">
                      <p><strong>Conditions:</strong> {weather.conditions || "N/A"}</p>
                      <p><strong>Temperature:</strong> {weather.temperature ?? "N/A"} C</p>
                      <p><strong>Humidity:</strong> {weather.humidity ?? "N/A"}%</p>
                    </div>
                  ) : (
                    <p className="cv-subtext">Weather not available for this match yet.</p>
                  )}
                </div>
              </div>
            )}

            {selectedMatch && (
              <button
                className="primary-button advisor-button"
                onClick={handleDecision}
                disabled={!weather || loadingDecision}
              >
                {loadingDecision ? "Thinking..." : "Suggest toss decision"}
              </button>
            )}
          </>
        ) : (
          <p className="cv-subtext">
            No eligible T20 matches between supported teams are available right now.
          </p>
        )}

        {error && <div className="cv-error advisor-error">{error}</div>}
        {decision && (
          <div className="advisor-result">
            Suggested decision: <strong>{decision}</strong>
          </div>
        )}
      </div>
    </section>
  );
};

export default TossDecisionAdvisor;
