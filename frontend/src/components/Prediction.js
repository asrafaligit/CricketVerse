import React, { useEffect, useState } from "react";
import VictoryProgress from "./VictoryProgress";

const Prediction = ({ match }) => {
  const [probability, setProbability] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const makePrediction = async () => {
      try {
        const inning2 = match.inning_2;
        if (!inning2) return;

        const ballsBowled =
          inning2.batting?.reduce((sum, b) => {
            const balls = parseInt(b.balls || 0);
            return sum + (isNaN(balls) ? 0 : balls);
          }, 0) || 0;

        const oversCompleted = Math.floor(ballsBowled / 6);
        const ballsThisOver = ballsBowled % 6;

        const target_score = parseInt(match.score1?.split("/")[0]) + 1;
        const current_score = parseInt(match.score2?.split("/")[0]) || 0;
        const wickets_fallen = parseInt(match.score2?.split("/")[1]) || 0;

        const batter_runs = parseInt(inning2.batting?.[0]?.runs || 0);
        const batter_balls = parseInt(inning2.batting?.[0]?.balls || 1);
        const non_striker_runs = parseInt(inning2.batting?.[1]?.runs || 0);
        const non_striker_balls = parseInt(inning2.batting?.[1]?.balls || 1);

        const balls_remaining = 120 - (oversCompleted * 6 + ballsThisOver);
        const runs_to_get = target_score - current_score;
        const wickets_remaining = 10 - wickets_fallen;
        const current_run_rate =
          current_score / ((oversCompleted * 6 + ballsThisOver) / 6);
        const required_run_rate = runs_to_get / (balls_remaining / 6);

        const features = {
          "Target Score": target_score,
          "Innings Runs": current_score,
          "Innings Wickets": wickets_fallen,
          "Balls Remaining": balls_remaining,
          wickets_remaining: wickets_remaining,
          "Runs to Get": runs_to_get,
          current_run_rate: current_run_rate,
          required_run_rate: required_run_rate,
          "Total Batter Runs": batter_runs,
          "Total Non Striker Runs": non_striker_runs,
          "Batter Balls Faced": batter_balls,
          "Non Striker Balls Faced": non_striker_balls,
        };

        const res = await fetch("http://localhost:5000/predict", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(features),
        });

        const data = await res.json();
        if (res.ok) {
          setProbability(data.victoryProbability);
          setMessage(data.message);
        } else {
          setMessage(data.error || "Prediction error");
        }
      } catch (err) {
        console.error("Prediction failed:", err);
        setMessage("Failed to get prediction");
      } finally {
        setLoading(false);
      }
    };

    if (match && match.status !== "RESULT") {
      makePrediction();
    }
  }, [match]);

  if (loading)
    return <p style={{ color: "#aaa" }}>🔄 Calculating prediction...</p>;
  if (message === "Match Already Won")
    return <p style={{ color: "#00FF00" }}>✅ Match Already Won</p>;
  if (message === "Match Lost")
    return <p style={{ color: "#FF4C4C" }}>❌ Match Already Lost</p>;
  if (probability !== null)
    return <VictoryProgress probability={probability} />;
  return <p style={{ color: "#f44336" }}>⚠️ {message}</p>;
};

export default Prediction;
