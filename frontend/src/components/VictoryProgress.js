import React from "react";

const VictoryProgress = ({ probability }) => {
  const safeProbability = Math.max(0, Math.min(Number(probability) || 0, 100));

  return (
    <div className="prediction-card">
      <div className="prediction-card__head">
        <h2>Victory Probability</h2>
        <strong>{safeProbability.toFixed(1)}%</strong>
      </div>
      <div className="prediction-track">
        <div
          className="prediction-fill"
          style={{ width: `${safeProbability}%` }}
        />
      </div>
      <p className="cv-subtext">
        Live model estimate based on target, wickets, run rate, and current chase pressure.
      </p>
    </div>
  );
};

export default VictoryProgress;
