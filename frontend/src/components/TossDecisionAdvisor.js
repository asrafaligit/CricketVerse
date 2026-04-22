import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "../config";

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
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [weather, setWeather] = useState({});
  const [decision, setDecision] = useState("");
  const backendUrl = API_BASE_URL;

  useEffect(() => {
    fetch(`${backendUrl}/get-data`)
      .then((res) => res.json())
      .then((raw) => {
        const uniqueMatches = new Map();
        // Filter for T20 matches between top teams
        // This is the original logic that was commented out
        // raw.forEach((m) => {
        //   if (!uniqueMatches.has(m.match_id)) {
        //     uniqueMatches.set(m.match_id, m);
        //   }
        // });

        // New logic to filter T20 matches between top teams
        raw.forEach((m) => {
          const isT20 = /t20/i.test(m.match_format || "");
          const isTopTeams =
            TOP_TEAMS.includes(m.team1) && TOP_TEAMS.includes(m.team2);

          if (isT20 && isTopTeams && !uniqueMatches.has(m.match_id)) {
            uniqueMatches.set(m.match_id, m);
          }
        });

        setMatches(Array.from(uniqueMatches.values()));
      })
      .catch(console.error);
  }, [backendUrl]);

  useEffect(() => {
    if (selectedMatch) {
      fetch(
        `${backendUrl}/fetch-weather/${encodeURIComponent(
          selectedMatch.venue
        )}`
      )
        .then((res) => res.json())
        .then((data) => {
          const today =
            data.days?.find((d) => d.datetime === selectedMatch.date) ||
            data.days?.[0];
          setWeather({
            temperature: today.temp,
            humidity: today.humidity,
            windSpeed: today.windspeed,
            cloudCover: today.cloudcover,
            conditions: today.conditions,
          });
          if (!today) {
            console.warn(
              `⚠️ No weather data found for ${selectedMatch.venue} on ${selectedMatch.date}`
            );
          }
        })
        .catch(console.error);
    }
  }, [backendUrl, selectedMatch]);

  const handleMatchSelect = (id) => {
    const match = matches.find((m) => m.match_id === id);
    setSelectedMatch(match);
    setDecision("");
  };

  const handleDecision = () => {
    if (!selectedMatch || !weather) return;
    fetch("http://localhost:5001/toss-decision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        team1: selectedMatch.team1,
        team2: selectedMatch.team2,
        venue: selectedMatch.venue,
        weather: weather,
      }),
    })
      .then((res) => res.json())
      .then((json) => setDecision(json.decision))
      .catch(console.error);
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.header}>🧠 Toss Decision Recommendation</h1>

      {matches.length > 0 ? (
        <div style={styles.matchSelector}>
          <h2 style={styles.subHeading}>📝 Select a T20 Match</h2>
          <div style={styles.selectWrapper}>
            <select
              style={styles.select}
              onChange={(e) => handleMatchSelect(e.target.value)}
              defaultValue=""
            >
              <option value="" disabled>
                — Select match —
              </option>
              {matches.map((m, idx) => (
                <React.Fragment key={m.match_id}>
                  {idx !== 0 && (
                    <option disabled>
                      ───────────────────────────────────────
                    </option>
                  )}
                  <option value={m.match_id}>
                    {`${m.team1} vs ${m.team2} — ${m.date} @ ${m.venue}`}
                  </option>
                </React.Fragment>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <div style={styles.noMatchContainer}>
          <h2 style={styles.noMatchHeading}>⚠️ No Eligible Matches Found</h2>
          <p style={styles.noMatchText}>
            Only <strong>T20</strong> matches between major international teams
            (India, Australia, England, Pakistan, West Indies, South Africa, Sri
            Lanka, Bangladesh) will be listed here.
          </p>
        </div>
      )}

      {selectedMatch && weather.temperature != null && (
        <div style={styles.infoBox}>
          <p>
            <strong>Venue:</strong> {selectedMatch.venue}
          </p>
          <p>
            <strong>Date:</strong> {selectedMatch.date}
          </p>
          <p>
            <strong>Weather:</strong> {weather.conditions},{" "}
            {weather.temperature}°C, Humidity {weather.humidity}%
          </p>
          <button style={styles.button} onClick={handleDecision}>
            Suggest Decision
          </button>
        </div>
      )}

      {decision && (
        <div style={styles.result}>
          🏆 Suggested Decision: <span style={styles.decision}>{decision}</span>
        </div>
      )}
    </div>
  );
};

const styles = {
  container: {
    maxWidth: "700px",
    margin: "auto",
    padding: "2rem",
    color: "#e0e0e0",
    background: "#121212",
  },
  header: {
    fontSize: "2.5rem",
    color: "#bb86fc",
    marginBottom: "1.5rem",
    textAlign: "center",
  },
  matchSelector: {
    marginBottom: "1.5rem",
    padding: "1rem",
    border: "1px solid #03dac6",
    borderRadius: "8px",
  },
  subHeading: {
    fontSize: "1.6rem",
    color: "#03dac6",
    marginBottom: "1rem",
    textAlign: "center",
  },
  selectWrapper: {
    padding: "0.5rem",
    backgroundColor: "#1e1e1e",
    borderRadius: "6px",
  },
  select: {
    width: "100%",
    padding: "1rem",
    fontSize: "1.1rem",
    background: "#2c2c2c",
    color: "#fff",
    border: "1px solid #03dac6",
    borderRadius: "6px",
    appearance: "none",
  },
  infoBox: {
    margin: "1.5rem 0",
    padding: "1rem",
    border: "1px dashed #03dac6",
    borderRadius: "6px",
  },
  button: {
    padding: "0.8rem 1.2rem",
    background: "#03dac6",
    border: "none",
    borderRadius: "6px",
    fontSize: "1.1rem",
    color: "#121212",
    cursor: "pointer",
    marginTop: "1rem",
    fontWeight: "bold",
  },
  result: {
    marginTop: "2rem",
    fontSize: "1.8rem",
    textAlign: "center",
    color: "#03dac6",
  },
  decision: {
    fontWeight: "bold",
    color: "#ffffff",
  },
  noMatchContainer: {
    backgroundColor: "#1e1e1e",
    border: "2px dashed #bb86fc",
    borderRadius: "12px",
    padding: "2rem",
    marginTop: "2rem",
    textAlign: "center",
    color: "#e0e0e0",
  },
  noMatchHeading: {
    fontSize: "1.8rem",
    color: "#ff5252",
    marginBottom: "1rem",
  },
  noMatchText: {
    fontSize: "1.3rem",
    color: "#cccccc",
    lineHeight: "1.6",
  },
};

export default TossDecisionAdvisor;
