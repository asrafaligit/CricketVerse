from flask import Flask, request, jsonify
import joblib
import pandas as pd
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

model = joblib.load("random_forest_model.pkl")

@app.route("/predict", methods=["POST"])
def predict():
    try:
        data = request.get_json()

        # Use keys exactly as expected by the model
        target_score = int(data["Target Score"])
        current_score = int(data["Innings Runs"])
        wickets_fallen = int(data["Innings Wickets"])
        balls_remaining = int(data["Balls Remaining"])
        runs_to_get = int(data["Runs to Get"])
        current_run_rate = float(data["current_run_rate"])
        required_run_rate = float(data["required_run_rate"])
        wickets_remaining = int(data["wickets_remaining"])
        batter_runs = int(data["Total Batter Runs"])
        non_striker_runs = int(data["Total Non Striker Runs"])
        batter_balls = int(data["Batter Balls Faced"])
        non_striker_balls = int(data["Non Striker Balls Faced"])

        features = pd.DataFrame([{
            "required_run_rate": required_run_rate,
            "Target Score": target_score,
            "Runs to Get": runs_to_get,
            "current_run_rate": current_run_rate,
            "Innings Wickets": wickets_fallen,
            "wickets_remaining": wickets_remaining,
            "Innings Runs": current_score,
            "Total Non Striker Runs": non_striker_runs,
            "Total Batter Runs": batter_runs,
            "Non Striker Balls Faced": non_striker_balls,
            "Balls Remaining": balls_remaining,
            "Batter Balls Faced": batter_balls
        }])

        prob = model.predict_proba(features)[0]
        return jsonify({
            "victoryProbability": round(prob[1] * 100, 2),
            "message": "Prediction Success"
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 400

if __name__ == "__main__":
    app.run(port=5000)
