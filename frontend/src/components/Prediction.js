import React, { useEffect, useState } from "react";
import { PREDICTION_API_URL } from "../config";
import VictoryProgress from "./VictoryProgress";

function getScoreRuns(scoreText) {
  const match = String(scoreText || "").match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function getScoreWickets(scoreText) {
  const match = String(scoreText || "").match(/\d+\/(\d+)/);
  return match ? Number(match[1]) : 0;
}

const Prediction = ({ match }) => {
  const [probability, setProbability] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const makePrediction = async () => {
      try {
        setLoading(true);
        setMessage("");
        setProbability(null);

        const stats = match?.match_stats;
        const inning2 = match?.inning_2;

        if (!inning2?.batting?.length || !stats) {
          setMessage("Prediction needs a richer live scorecard snapshot.");
          return;
        }

        const targetScore = stats.target || getScoreRuns(match.score1) + 1;
        const currentScore = stats.currentRuns ?? getScoreRuns(match.score2);
        const wicketsFallen = stats.currentWickets ?? getScoreWickets(match.score2);
        const ballsRemaining = Math.max(stats.ballsRemaining ?? 0, 0);
        const runsToGet = Math.max(stats.runsRequired ?? targetScore - currentScore, 0);
        const currentRunRate = Number(stats.currentRunRate ?? 0);
        const requiredRunRate = Number(stats.requiredRunRate ?? 0);
        const wicketsRemaining = Math.max(stats.wicketsInHand ?? 10 - wicketsFallen, 0);

        if (!targetScore || ballsRemaining < 0) {
          setMessage("Prediction is unavailable for the current match state.");
          return;
        }

        if (runsToGet <= 0) {
          setMessage("Match Already Won");
          return;
        }

        if (ballsRemaining === 0 || wicketsRemaining === 0) {
          setMessage("Match Lost");
          return;
        }

        const striker = inning2.batting?.[0] || {};
        const nonStriker = inning2.batting?.[1] || {};

        const features = {
          "Target Score": targetScore,
          "Innings Runs": currentScore,
          "Innings Wickets": wicketsFallen,
          "Balls Remaining": ballsRemaining,
          wickets_remaining: wicketsRemaining,
          "Runs to Get": runsToGet,
          current_run_rate: currentRunRate,
          required_run_rate: requiredRunRate,
          "Total Batter Runs": Number(striker.runs || 0),
          "Total Non Striker Runs": Number(nonStriker.runs || 0),
          "Batter Balls Faced": Number(striker.balls || 0),
          "Non Striker Balls Faced": Number(nonStriker.balls || 0),
        };

        const res = await fetch(`${PREDICTION_API_URL}/predict`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(features),
        });

        const data = await res.json();
        if (res.ok) {
          setProbability(Number(data.victoryProbability));
          setMessage(data.message || "");
        } else {
          setMessage(data.error || "Prediction error");
        }
      } catch (err) {
        setMessage("Prediction not available for this match.");
      } finally {
        setLoading(false);
      }
    };

    if (match && match.status !== "RESULT") {
      makePrediction();
    } else {
      setLoading(false);
    }
  }, [match]);

  if (loading) {
    return <p className="cv-subtext">Calculating live prediction...</p>;
  }
  if (message === "Match Already Won") {
    return <p className="prediction-state prediction-state--win">Match already won.</p>;
  }
  if (message === "Match Lost") {
    return <p className="prediction-state prediction-state--loss">Chase no longer live.</p>;
  }
  if (probability !== null && Number.isFinite(probability)) {
    return <VictoryProgress probability={probability} />;
  }
  return <p className="prediction-state prediction-state--alert">{message}</p>;
};

export default Prediction;
