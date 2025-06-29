import pandas as pd
from flask import Flask, request, jsonify
from flask_cors import CORS  

app = Flask(__name__)
CORS(app)
# === Load and Preprocess Dataset ===
try:
    df = pd.read_csv("filtered_t20i_Matches_Data.csv")
except FileNotFoundError:
    raise SystemExit("❌ CSV file 'filtered_t20i_Matches_Data.csv' not found!")

# === Compute Stats Once ===
team_stats, venue_stats = {}, {}

for _, row in df.iterrows():
    toss_winner = row["Toss Winner"]
    toss_choice = row["Toss Winner Choice"]
    match_winner = row["Match Winner"]
    team1 = row["Team1 Name"]
    team2 = row["Team2 Name"]
    venue = row["Match Venue (Stadium)"]
    team1_runs = row["Team1 Runs Scored"]
    team2_runs = row["Team2 Runs Scored"]

    batted_first = toss_winner if toss_choice.lower() == "bat" else (team2 if toss_winner == team1 else team1)
    bat_win = 1 if match_winner == batted_first else 0

    venue_stats.setdefault(venue, {"bat_first_wins": 0, "bat_first_matches": 0, "scores": []})
    venue_stats[venue]["bat_first_wins"] += bat_win
    venue_stats[venue]["bat_first_matches"] += 1
    venue_stats[venue]["scores"].append(team1_runs if batted_first == team1 else team2_runs)

    for team in [team1, team2]:
        team_stats.setdefault(team, {"bat_first_wins": 0, "bat_first_matches": 0})
    team_stats[batted_first]["bat_first_wins"] += bat_win
    team_stats[batted_first]["bat_first_matches"] += 1

# === Helpers ===
def get_team_bat_win_rate(team):
    stats = team_stats.get(team)
    if stats and stats["bat_first_matches"] > 0:
        return stats["bat_first_wins"] / stats["bat_first_matches"]
    return None

def get_venue_bat_win_rate(venue):
    stats = venue_stats.get(venue)
    if stats and stats["bat_first_matches"] > 0:
        return stats["bat_first_wins"] / stats["bat_first_matches"]
    return None

def get_venue_avg_score(venue):
    stats = venue_stats.get(venue)
    if stats and stats["scores"]:
        return sum(stats["scores"]) / len(stats["scores"])
    return None

def decide_bat_or_bowl(team1, team2, venue, weather):
    t1_rate = get_team_bat_win_rate(team1)
    t2_rate = get_team_bat_win_rate(team2)
    venue_rate = get_venue_bat_win_rate(venue)
    venue_score = get_venue_avg_score(venue)

    score = 0
    if t1_rate and t1_rate > 0.5:
        score += 1
    if t2_rate and t2_rate < 0.5:
        score += 1
    if venue_rate and venue_rate > 0.5:
        score += 1
    if venue_score and venue_score > 160:
        score += 1
    if weather["humidity"] > 70 or "rain" in weather["conditions"].lower():
        score -= 1
    if weather["windSpeed"] > 20:
        score += 0.5
    if weather["cloudCover"] > 60:
        score -= 0.5

    return "BAT" if score >= 2 else "BOWL"

# === API Route ===
@app.route("/toss-decision", methods=["POST"])
def toss_decision():
    try:
        data = request.get_json()

        team1 = data.get("team1")
        team2 = data.get("team2")
        venue = data.get("venue")
        weather = data.get("weather")

        if not all([team1, team2, venue, weather]):
            return jsonify({"error": "Missing fields in request"}), 400
        if team1 == team2:
            return jsonify({"error": "Team 1 and Team 2 must be different"}), 400

        decision = decide_bat_or_bowl(team1, team2, venue, weather)
        return jsonify({"decision": decision})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# === Start Server ===
if __name__ == "__main__":
    app.run(debug=True, port=5001)

