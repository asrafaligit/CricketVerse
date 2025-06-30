"use client";

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Prediction from "./Prediction";

const MatchDetails = () => {
  const { id: matchId } = useParams();
  const [matchData, setMatchData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let intervalId;

    const fetchMatchDetails = async () => {
      try {
        const res = await fetch(
          `http://localhost:3001/get-match-by-matchid/${matchId}`
        );
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        const data = await res.json();
        setMatchData(data);
      } catch (error) {
        console.error("Error fetching match details:", error);
      } finally {
        setLoading(false);
      }
    };

    if (matchId) {
      fetchMatchDetails(); // initial load

      intervalId = setInterval(fetchMatchDetails, 10000); // fetch every 10 seconds
    }

    return () => clearInterval(intervalId); // cleanup
  }, [matchId]);

  if (loading)
    return <div style={styles.loadingContainer}>Loading match details...</div>;
  if (!matchData)
    return <div style={styles.errorContainer}>Match not found</div>;

  const {
    team1,
    team2,
    score1,
    score2,
    match_result,
    toss,
    venue,
    player_of_the_match,
    current_run_rate,
    status,
    inning_1,
    inning_2,
  } = matchData;

  const isPredictableMatch = (match) => {
    const t20Keywords = ["t20", "t-20", "twenty20"];
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
    const teamsSupported =
      knownTeams.includes(match.team1?.toUpperCase()) &&
      knownTeams.includes(match.team2?.toUpperCase());
    const isT20 = t20Keywords.some((keyword) =>
      match.match_result?.toLowerCase().includes(keyword)
    );
    return teamsSupported && isT20;
  };

  const renderBatting = (teamName, batters = []) => (
    <div style={styles.statsSection}>
      <h2 style={styles.inningTeamTitle}>{teamName} Batting</h2>
      <div style={styles.tableContainer}>
        <table style={styles.statsTable}>
          <thead>
            <tr>
              <th style={styles.tableHeader}>Batsman</th>
              <th style={styles.tableHeader}></th>
              <th style={styles.tableHeader}>Runs</th>
              <th style={styles.tableHeader}>Balls</th>
              <th style={styles.tableHeader}>4s</th>
              <th style={styles.tableHeader}>6s</th>
              <th style={styles.tableHeader}>SR</th>
            </tr>
          </thead>
          <tbody>
            {batters.map((player, idx) => (
              <tr
                key={idx}
                style={idx % 2 === 0 ? styles.tableRowEven : styles.tableRowOdd}
              >
                <td style={styles.tableCell}>{player.name}</td>
                <td style={styles.tableCell}>{player.diss_summary}</td>
                <td style={styles.tableCell}>{player.runs}</td>
                <td style={styles.tableCell}>{player.balls}</td>
                <td style={styles.tableCell}>{player.fours}</td>
                <td style={styles.tableCell}>{player.sixes}</td>
                <td style={styles.tableCell}>{player.strike_rate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderBowling = (teamName, bowlers = []) => (
    <div style={styles.statsSection}>
      <h2 style={styles.inningTeamTitle}>{teamName} Bowling</h2>
      <div style={styles.tableContainer}>
        <table style={styles.statsTable}>
          <thead>
            <tr>
              <th style={styles.tableHeader}>Bowler</th>
              <th style={styles.tableHeader}>Overs</th>
              <th style={styles.tableHeader}>Maidens</th>
              <th style={styles.tableHeader}>Runs</th>
              <th style={styles.tableHeader}>Wickets</th>
              <th style={styles.tableHeader}>Economy</th>
            </tr>
          </thead>
          <tbody>
            {bowlers.map((player, idx) => (
              <tr
                key={idx}
                style={idx % 2 === 0 ? styles.tableRowEven : styles.tableRowOdd}
              >
                <td style={styles.tableCell}>{player.name}</td>
                <td style={styles.tableCell}>{player.overs}</td>
                <td style={styles.tableCell}>{player.maidens}</td>
                <td style={styles.tableCell}>{player.runs_conceded}</td>
                <td style={styles.tableCell}>{player.wickets}</td>
                <td style={styles.tableCell}>{player.economy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div style={styles.container}>
      <div style={styles.matchHeader}>
        <div style={styles.liveIndicator}>{status}</div>
      </div>
      <div style={styles.scoreboardContainer}>
        <div style={styles.teamContainer}>
          <h2 style={styles.teamName}>{team1}</h2>
          <p style={styles.score}>{score1}</p>
        </div>
        <div style={styles.vsContainer}>
          <div style={styles.vsCircle}>VS</div>
        </div>
        <div style={styles.teamContainer}>
          <h2 style={styles.teamName}>{team2}</h2>
          <p style={styles.score}>{score2}</p>
        </div>
      </div>
      {status === "RESULT" ? (
        <div style={styles.victoryContainer}>
          <h3 style={styles.victoryTitle}>MATCH RESULT</h3>
          <p style={styles.victoryPercentage}>{match_result}</p>
        </div>
      ) : isPredictableMatch(matchData) ? (
        <div style={styles.victoryContainer}>
          <Prediction match={matchData} />
        </div>
      ) : (
        <div style={styles.victoryContainer}>
          <h3 style={styles.victoryTitle}>Live Match</h3>
          <p style={styles.victoryPercentage}>
            Prediction not available for this match
          </p>
        </div>
      )}

      <div style={styles.metaInfo}>
        <p>
          <strong>Toss:</strong> {toss}
        </p>
        <p>
          <strong>Venue:</strong> {venue}
        </p>
        <p>
          <strong>Player of the Match:</strong> {player_of_the_match}
        </p>
        <p>
          <strong>Run Rate:</strong> {current_run_rate}
        </p>
        <p>
          <strong>Result:</strong> {match_result}
        </p>
      </div>
      {inning_1 && (
        <>
          {renderBatting(team1, inning_1.batting)}
          {renderBowling(team2, inning_1.bowling)}
        </>
      )}
      {inning_2 && (
        <>
          {renderBatting(team2, inning_2.batting)}
          {renderBowling(team1, inning_2.bowling)}
        </>
      )}
    </div>
  );
};

const styles = {
  container: {
    backgroundColor: "#121212",
    color: "#e0e0e0",
    padding: "2rem",
    maxWidth: "1500px",
    margin: "0 auto",
    borderRadius: "15px",
  },
  loadingContainer: {
    textAlign: "center",
    padding: "50px",
    fontSize: "1.2rem",
    color: "#aaa",
  },
  errorContainer: {
    textAlign: "center",
    padding: "50px",
    fontSize: "1.2rem",
    color: "#f44336",
  },
  matchHeader: {
    display: "flex",
    justifyContent: "center",
    marginBottom: "20px",
  },
  liveIndicator: {
    backgroundColor: "#1e1e1e",
    color: "#03dac6",
    padding: "5px 15px",
    borderRadius: "20px",
    fontWeight: "bold",
    fontSize: "0.9rem",
  },
  scoreboardContainer: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "20px",
  },
  teamContainer: {
    flex: 1,
    textAlign: "center",
  },
  teamName: {
    fontSize: "2rem",
    fontWeight: "bold",
    marginBottom: "10px",
    color: "#bb86fc",
  },
  score: {
    fontSize: "1.8rem",
    fontWeight: "bold",
    color: "#03dac6",
  },
  vsContainer: {
    display: "flex",
    justifyContent: "center",
    width: "80px",
  },
  vsCircle: {
    width: "50px",
    height: "50px",
    borderRadius: "50%",
    backgroundColor: "#2a2a2a",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    color: "#bb86fc",
    fontWeight: "bold",
  },
  victoryContainer: {
    backgroundColor: "#1e1e1e",
    borderRadius: "15px",
    padding: "20px",
    margin: "30px 0",
  },
  victoryTitle: {
    textAlign: "center",
    color: "#bb86fc",
    marginBottom: "15px",
    fontWeight: "bold",
  },
  progressBarContainer: {
    height: "10px",
    backgroundColor: "#333",
    borderRadius: "5px",
    position: "relative",
    marginBottom: "10px",
  },
  progressBar: {
    height: "100%",
    backgroundColor: "#bb86fc",
    borderRadius: "5px",
  },
  progressDot: {
    position: "absolute",
    top: "50%",
    transform: "translate(-50%, -50%)",
    width: "12px",
    height: "12px",
    borderRadius: "50%",
    backgroundColor: "#bb86fc",
  },
  victoryPercentage: {
    textAlign: "center",
    color: "#bb86fc",
    fontWeight: "bold",
    fontSize: "1.2rem",
  },
  metaInfo: {
    marginTop: "20px",
    padding: "1rem",
    backgroundColor: "#1a1a1a",
    borderRadius: "8px",
    fontSize: "1.4rem",
  },
  statsSection: {
    marginTop: "30px",
  },
  sectionTitle: {
    fontSize: "1.5rem",
    color: "#bb86fc",
    marginBottom: "15px",
  },
  tableContainer: {
    overflowX: "auto",
  },
  statsTable: {
    width: "100%",
    borderCollapse: "collapse",
  },
  tableHeader: {
    backgroundColor: "#2a2a2a",
    color: "#03dac6",
    padding: "12px 15px",
    textAlign: "left",
  },
  tableRowEven: {
    backgroundColor: "#1e1e1e",
  },
  tableRowOdd: {
    backgroundColor: "#222",
  },
  tableCell: {
    fontSize: "1.3rem",
    padding: "12px 15px",
    borderBottom: "1px solid #333",
    color: "#e0e0e0",
  },
  inningTeamTitle: {
    fontSize: "1.6rem",
    fontWeight: "bold",
    color: "#03dac6",
    marginBottom: "10px",
  },
};

export default MatchDetails;
