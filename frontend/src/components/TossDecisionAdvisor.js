import React, { useEffect, useState } from "react";
import {
  CloudSun,
  Lightning,
  MapPin,
  Target,
  Trophy,
  WarningCircle,
} from "@phosphor-icons/react";
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
        if (!res.ok) throw new Error("matches");
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
      .catch(() => setError("Toss advisor matches could not be loaded right now."));
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
      setError(err.message || "Toss decision could not be calculated right now.");
    } finally {
      setLoadingDecision(false);
    }
  };

  return (
    <section className="dashboard-stack">
      <div className="command-panel">
        <div>
          <p className="eyebrow">Toss strategy</p>
          <h2>T20 toss decision</h2>
          <p>Supported teams use venue and weather features from the backend dataset.</p>
        </div>
        <button
          className="button button--primary"
          onClick={handleDecision}
          disabled={!selectedMatch || !weather || loadingDecision}
        >
          <Lightning size={18} weight="bold" />
          {loadingDecision ? "Thinking" : "Suggest"}
        </button>
      </div>

      {error && (
        <div className="alert-panel">
          <WarningCircle size={20} weight="duotone" />
          <span>{error}</span>
        </div>
      )}

      {matches.length > 0 ? (
        <>
          <label className="field-control">
            <span>Select match</span>
            <select value={selectedMatchId} onChange={(e) => setSelectedMatchId(e.target.value)}>
              <option value="">Select a T20 match</option>
              {matches.map((match) => (
                <option key={match.match_id} value={match.match_id}>
                  {`${match.team1} vs ${match.team2} - ${match.date}`}
                </option>
              ))}
            </select>
          </label>

          {selectedMatch && (
            <div className="detail-layout detail-layout--two">
              <section className="data-panel">
                <div className="section-heading">
                  <p className="eyebrow">Match</p>
                  <h2>{selectedMatch.team1} vs {selectedMatch.team2}</h2>
                </div>
                <div className="info-list">
                  <p><Trophy size={17} weight="duotone" /> {selectedMatch.series || "Series unavailable"}</p>
                  <p><MapPin size={17} weight="duotone" /> {selectedMatch.venue || "Venue TBA"}</p>
                  <p><strong>Status</strong><span>{selectedMatch.status || "N/A"}</span></p>
                </div>
              </section>

              <section className="data-panel">
                <div className="section-heading">
                  <p className="eyebrow">Conditions</p>
                  <h2>Weather snapshot</h2>
                </div>
                {weather ? (
                  <div className="info-list">
                    <p><CloudSun size={17} weight="duotone" /> {weather.conditions || "N/A"}</p>
                    <p><strong>Temperature</strong><span>{weather.temperature ?? "N/A"} C</span></p>
                    <p><strong>Humidity</strong><span>{weather.humidity ?? "N/A"}%</span></p>
                  </div>
                ) : (
                  <p className="muted-copy">Weather not available for this match yet.</p>
                )}
              </section>
            </div>
          )}
        </>
      ) : (
        <div className="state-panel">No eligible T20 matches between supported teams are available right now.</div>
      )}

      {decision && (
        <section className="decision-card">
          <Target size={26} weight="duotone" />
          <div>
            <p className="eyebrow">Suggested decision</p>
            <h2>{decision}</h2>
          </div>
        </section>
      )}
    </section>
  );
};

export default TossDecisionAdvisor;
