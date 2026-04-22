import json
import re
from datetime import UTC, datetime

from playwright.sync_api import sync_playwright

from Scraping.api_source import clean_team_name, get_match_limit, send_data_to_server


CRICINFO_LIVE_URL = "https://www.espncricinfo.com/live-cricket-score"
CRICINFO_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) "
    "Version/16.0 Safari/605.1.15"
)


def extract_next_data(html):
    match = re.search(
        r'<script id="__NEXT_DATA__" type="application/json">\s*(.*?)\s*</script>',
        html,
        re.DOTALL,
    )
    if not match:
        return None
    return json.loads(match.group(1))


def fetch_next_data(context, url):
    page = context.new_page()
    try:
        response = page.goto(url, wait_until="domcontentloaded", timeout=60000)
        if response and response.status >= 400:
            print(f"Cricinfo request failed for {url}: HTTP {response.status}")
            return None

        html = page.content()
        next_data = extract_next_data(html)
        if not next_data:
            print(f"Could not extract __NEXT_DATA__ from {url}")
        return next_data
    finally:
        page.close()


def get_live_matches(context):
    next_data = fetch_next_data(context, CRICINFO_LIVE_URL)
    if not next_data:
        return []

    app_data = next_data.get("props", {}).get("appPageProps", {}).get("data", {})
    content = app_data.get("content", {})
    matches = content.get("matches") or []

    if not isinstance(matches, list):
        return []

    return matches


def build_match_url(series_id, match_id):
    return f"https://www.espncricinfo.com/series/x-{series_id}/x-{match_id}/full-scorecard"


def safe_int(value):
    if value in (None, ""):
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def safe_float(value):
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def stringify_stat(value, default="0"):
    if value in (None, ""):
        return default
    return str(value)


def extract_team_entries(live_match, scorecard_match, innings):
    teams = []
    seen = set()

    for source in (scorecard_match or {}, live_match or {}):
        for entry in source.get("teams", []) or []:
            team = entry.get("team") or entry
            if not isinstance(team, dict):
                continue

            name = clean_team_name(
                team.get("name") or team.get("longName") or team.get("abbreviation")
            )
            if not name:
                continue

            item = {
                "name": name,
                "abbreviation": team.get("abbreviation") or name,
                "image": team.get("imageUrl") or team.get("image") or "",
                "internal_id": str(team.get("id") or ""),
                "object_id": str(team.get("objectId") or ""),
            }
            key = item["object_id"] or item["internal_id"] or item["name"]
            if key in seen:
                continue
            seen.add(key)
            teams.append(item)

    if len(teams) < 2:
        for inning in innings:
            team = inning.get("team") or {}
            name = clean_team_name(team.get("name") or team.get("longName"))
            if not name:
                continue
            if any(existing["name"] == name for existing in teams):
                continue
            teams.append(
                {
                    "name": name,
                    "abbreviation": team.get("abbreviation") or name,
                    "image": team.get("imageUrl") or team.get("image") or "",
                    "internal_id": str(team.get("id") or ""),
                    "object_id": str(team.get("objectId") or ""),
                }
            )

    return teams[:2]


def normalize_status(live_match, scorecard_match):
    status = str(
        (scorecard_match or {}).get("status") or live_match.get("status") or ""
    ).strip()
    status_text = str(
        (scorecard_match or {}).get("statusText")
        or live_match.get("statusText")
        or live_match.get("status")
        or ""
    ).strip().lower()

    result_markers = (
        "won by",
        "match tied",
        "draw",
        "no result",
        "abandoned",
        "match drawn",
    )

    if status.lower() == "result" or any(marker in status_text for marker in result_markers):
        return "RESULT"

    if "live" in status.lower():
        return "LIVE"

    live_text_markers = (
        "trail by",
        "lead by",
        "need",
        "stumps",
        "day ",
        "session",
        "lunch",
        "tea",
    )
    if any(marker in status_text for marker in live_text_markers):
        return "LIVE"

    return "FIXTURE"


def format_toss(scorecard_match, teams):
    winner_id = str(scorecard_match.get("tossWinnerTeamId") or "")
    choice = scorecard_match.get("tossWinnerChoice")

    if not winner_id:
        return "N/A"

    winner_name = None
    for team in teams:
        if team["internal_id"] == winner_id or team["object_id"] == winner_id:
            winner_name = team["name"]
            break

    if not winner_name:
        winner_name = "Unknown Team"

    choice_text = "bat" if choice == 1 else "bowl" if choice == 2 else "choose"
    return f"{winner_name} won the toss and chose to {choice_text}"


def extract_player_of_match(content):
    awards = content.get("matchPlayerAwards") or []
    for award in awards:
        players = award.get("players")
        if isinstance(players, list) and players:
            player = players[0]
            if isinstance(player, dict):
                player_obj = player.get("player") or player
                name = player_obj.get("name") or player_obj.get("longName")
                if name:
                    return name

        player = award.get("player")
        if isinstance(player, dict):
            player_obj = player.get("player") or player
            name = player_obj.get("name") or player_obj.get("longName")
            if name:
                return name

    return "N/A"


def build_score_summary(inning):
    runs = inning.get("runs")
    wickets = inning.get("wickets")
    overs = inning.get("overs")

    if runs in (None, ""):
        return "Score unavailable"

    summary = str(runs)
    if wickets not in (None, ""):
        summary = f"{summary}/{wickets}"
    if overs not in (None, ""):
        summary = f"{summary} ({overs})"
    return summary


def normalize_batter_row(raw_row, team_name, innings_label):
    player = raw_row.get("player") or {}
    batted = raw_row.get("battedType") == "yes" or raw_row.get("runs") is not None
    is_out = bool(raw_row.get("isOut"))
    dismissal = (
        "did not bat"
        if not batted
        else (
            ((raw_row.get("dismissalText") or {}).get("long") or "out")
            if is_out
            else "not out"
        )
    )

    return {
        "name": player.get("name") or player.get("longName") or "Unknown Player",
        "team": team_name,
        "innings": innings_label,
        "diss_summary": dismissal,
        "runs": stringify_stat(raw_row.get("runs"), "0" if batted else "0"),
        "balls": stringify_stat(raw_row.get("balls"), "0" if batted else "0"),
        "fours": stringify_stat(raw_row.get("fours"), "0"),
        "sixes": stringify_stat(raw_row.get("sixes"), "0"),
        "strike_rate": stringify_stat(raw_row.get("strikerate"), "0"),
    }


def normalize_bowler_row(raw_row, team_name, innings_label):
    player = raw_row.get("player") or {}
    return {
        "name": player.get("name") or player.get("longName") or "Unknown Bowler",
        "team": team_name,
        "innings": innings_label,
        "overs": stringify_stat(raw_row.get("overs"), "0"),
        "maidens": stringify_stat(raw_row.get("maidens"), "0"),
        "runs_conceded": stringify_stat(raw_row.get("conceded"), "0"),
        "wickets": stringify_stat(raw_row.get("wickets"), "0"),
        "economy": stringify_stat(raw_row.get("economy"), "0"),
    }


def build_batter_performance(row):
    runs = safe_int(row["runs"]) or 0
    balls = safe_int(row["balls"]) or 0
    fours = safe_int(row["fours"]) or 0
    sixes = safe_int(row["sixes"]) or 0
    strike_rate = safe_float(row["strike_rate"])

    return {
        "name": row["name"],
        "team": row["team"],
        "innings": row["innings"],
        "role": "batter",
        "dismissal": row["diss_summary"],
        "runs": runs,
        "balls": balls,
        "fours": fours,
        "sixes": sixes,
        "strikeRate": strike_rate,
        "overs": None,
        "maidens": None,
        "runsConceded": None,
        "wickets": None,
        "economy": None,
        "impactScore": runs + fours + sixes * 2,
    }


def build_bowler_performance(row):
    wickets = safe_int(row["wickets"]) or 0
    maidens = safe_int(row["maidens"]) or 0
    runs_conceded = safe_int(row["runs_conceded"]) or 0
    economy = safe_float(row["economy"])

    return {
        "name": row["name"],
        "team": row["team"],
        "innings": row["innings"],
        "role": "bowler",
        "dismissal": "",
        "runs": None,
        "balls": None,
        "fours": None,
        "sixes": None,
        "strikeRate": None,
        "overs": safe_float(row["overs"]),
        "maidens": maidens,
        "runsConceded": runs_conceded,
        "wickets": wickets,
        "economy": economy,
        "impactScore": wickets * 25 + maidens * 8 - runs_conceded * 0.05,
    }


def build_innings_payload(innings, team_names):
    innings_payload = []

    for index, inning in enumerate(innings[:2]):
        team_name = clean_team_name(
            (inning.get("team") or {}).get("name")
            or (inning.get("team") or {}).get("longName")
            or team_names[min(index, len(team_names) - 1)]
        )
        innings_label = f"{team_name} Innings {index + 1}"
        bowling_team = next((name for name in team_names if name != team_name), "")

        batting_rows = [
            normalize_batter_row(raw_row, team_name, innings_label)
            for raw_row in inning.get("inningBatsmen", []) or []
        ]
        bowling_rows = [
            normalize_bowler_row(raw_row, bowling_team, innings_label)
            for raw_row in inning.get("inningBowlers", []) or []
        ]

        innings_payload.append(
            {
                "team_name": team_name,
                "innings_label": innings_label,
                "summary": build_score_summary(inning),
                "runs": inning.get("runs"),
                "wickets": inning.get("wickets"),
                "overs": inning.get("overs"),
                "raw_batting": inning.get("inningBatsmen", []) or [],
                "raw_bowling": inning.get("inningBowlers", []) or [],
                "batting": batting_rows,
                "bowling": bowling_rows,
            }
        )

    return innings_payload


def extract_team_scores(team1, team2, innings_payload):
    grouped = {team1: [], team2: []}
    for inning in innings_payload:
        team_name = inning["team_name"]
        if team_name in grouped:
            grouped[team_name].append(inning["summary"])

    score1 = grouped[team1][-1] if grouped[team1] else "Yet to bat"
    score2 = grouped[team2][-1] if grouped[team2] else "Yet to bat"
    return score1, score2


def build_current_batters(latest_innings):
    rows = latest_innings["batting"]
    not_out = [row for row in rows if row["diss_summary"].lower() == "not out"]
    source = not_out if not_out else rows[:2]
    return [build_batter_performance(row) for row in source[:2]]


def build_current_bowlers(latest_innings, bowling_team):
    current_rows = []
    for raw_row in latest_innings["raw_bowling"]:
        if raw_row.get("currentType"):
            current_rows.append(
                normalize_bowler_row(
                    raw_row,
                    bowling_team,
                    latest_innings["innings_label"],
                )
            )

    if not current_rows:
        current_rows = latest_innings["bowling"][:2]

    return [build_bowler_performance(row) for row in current_rows[:2]]


def build_match_stats(team1, team2, innings_payload):
    if not innings_payload:
        return {
            "battingTeam": team1,
            "bowlingTeam": team2,
            "target": None,
            "currentRuns": None,
            "currentWickets": None,
            "currentOvers": None,
            "currentBalls": None,
            "currentRunRate": None,
            "requiredRunRate": None,
            "runsRequired": None,
            "ballsRemaining": None,
            "wicketsInHand": None,
        }

    latest = innings_payload[-1]
    current_runs = safe_int(latest["runs"])
    current_wickets = safe_int(latest["wickets"])
    current_overs = safe_float(latest["overs"])
    current_run_rate = None

    if current_runs is not None and current_overs not in (None, 0):
        current_run_rate = round(current_runs / current_overs, 2)

    batting_team = latest["team_name"]
    bowling_team = team2 if batting_team == team1 else team1

    return {
        "battingTeam": batting_team,
        "bowlingTeam": bowling_team,
        "target": None,
        "currentRuns": current_runs,
        "currentWickets": current_wickets,
        "currentOvers": current_overs,
        "currentBalls": None,
        "currentRunRate": current_run_rate,
        "requiredRunRate": None,
        "runsRequired": None,
        "ballsRemaining": None,
        "wicketsInHand": None if current_wickets is None else max(10 - current_wickets, 0),
    }


def normalize_cricinfo_match(live_match, scorecard_match, content):
    innings = content.get("innings") or []
    teams = extract_team_entries(live_match, scorecard_match, innings)
    team_names = [team["name"] for team in teams]

    if len(team_names) < 2:
        print(
            f"Skipping match {live_match.get('objectId')}: could not determine two teams."
        )
        return None

    team1, team2 = team_names[0], team_names[1]
    innings_payload = build_innings_payload(innings, [team1, team2])
    score1, score2 = extract_team_scores(team1, team2, innings_payload)

    all_batters = [
        build_batter_performance(row)
        for innings_item in innings_payload
        for row in innings_item["batting"]
        if row["diss_summary"].lower() != "did not bat"
    ]
    all_bowlers = [
        build_bowler_performance(row)
        for innings_item in innings_payload
        for row in innings_item["bowling"]
    ]

    top_batters = sorted(
        all_batters,
        key=lambda row: (
            row["runs"] or 0,
            row["strikeRate"] or 0,
            -(row["balls"] or 0),
        ),
        reverse=True,
    )[:6]

    top_bowlers = sorted(
        all_bowlers,
        key=lambda row: (
            row["wickets"] or 0,
            -(row["economy"] or 999),
            -(row["runsConceded"] or 0),
        ),
        reverse=True,
    )[:6]

    latest_innings = innings_payload[-1] if innings_payload else None
    current_batters = build_current_batters(latest_innings) if latest_innings else []
    current_bowling_team = team2 if latest_innings and latest_innings["team_name"] == team1 else team1
    current_bowlers = (
        build_current_bowlers(latest_innings, current_bowling_team)
        if latest_innings
        else []
    )

    match_url = build_match_url(
        (live_match.get("series") or {}).get("objectId"),
        live_match.get("objectId"),
    )

    ground = scorecard_match.get("ground") or {}
    series = scorecard_match.get("series") or live_match.get("series") or {}
    status_text = (
        scorecard_match.get("statusText")
        or live_match.get("statusText")
        or live_match.get("status")
        or "Status unavailable"
    )

    return {
        "match_id": str(live_match.get("objectId") or "").strip(),
        "status": normalize_status(live_match, scorecard_match),
        "team1": team1,
        "team2": team2,
        "team1_img": teams[0]["image"] if len(teams) > 0 else "",
        "team2_img": teams[1]["image"] if len(teams) > 1 else "",
        "score1": score1,
        "score2": score2,
        "match_result": status_text,
        "match_url": match_url,
        "match_format": str(scorecard_match.get("format") or "").strip().lower(),
        "venue": str(ground.get("longName") or ground.get("name") or "N/A").strip(),
        "date": str(scorecard_match.get("startDate") or "").split("T")[0] or "N/A",
        "series": str(series.get("longName") or series.get("name") or "").strip(),
        "toss": format_toss(scorecard_match, teams),
        "player_of_the_match": extract_player_of_match(content),
        "current_run_rate": str(build_match_stats(team1, team2, innings_payload)["currentRunRate"] or "N/A"),
        "score_breakdown": [
            {
                "inning": innings_item["innings_label"],
                "runs": innings_item["runs"],
                "wickets": innings_item["wickets"],
                "overs": innings_item["overs"],
                "summary": innings_item["summary"],
            }
            for innings_item in innings_payload
        ],
        "inning_1": (
            {
                "batting": innings_payload[0]["batting"],
                "bowling": innings_payload[0]["bowling"],
            }
            if len(innings_payload) > 0
            else {"batting": [], "bowling": []}
        ),
        "inning_2": (
            {
                "batting": innings_payload[1]["batting"],
                "bowling": innings_payload[1]["bowling"],
            }
            if len(innings_payload) > 1
            else {"batting": [], "bowling": []}
        ),
        "top_batters": top_batters,
        "top_bowlers": top_bowlers,
        "current_batters": current_batters,
        "current_bowlers": current_bowlers,
        "match_stats": build_match_stats(team1, team2, innings_payload),
        "scorecard_available": bool(innings_payload),
        "scorecard_error": "",
        "scorecard_source": "cricinfo",
        "scorecard_refreshed_at": datetime.now(UTC).isoformat(),
        "source_endpoint": "cricinfo:live-cricket-score",
        "last_synced_at": datetime.now(UTC).isoformat(),
    }


def fetch_and_normalize_match(context, live_match):
    series_id = (live_match.get("series") or {}).get("objectId")
    match_id = live_match.get("objectId")

    if not series_id or not match_id:
        return None

    match_url = build_match_url(series_id, match_id)
    next_data = fetch_next_data(context, match_url)
    if not next_data:
        return None

    app_data = next_data.get("props", {}).get("appPageProps", {}).get("data", {})
    scorecard_match = app_data.get("match") or {}
    content = app_data.get("content") or {}

    if not scorecard_match:
        print(f"Scorecard payload missing match data for {match_url}")
        return None

    return normalize_cricinfo_match(live_match, scorecard_match, content)


def fetch_cricinfo_matches(limit):
    normalized_matches = []

    with sync_playwright() as playwright:
        browser = playwright.webkit.launch(headless=True)
        context = browser.new_context(user_agent=CRICINFO_USER_AGENT)

        try:
            live_matches = get_live_matches(context)
            if not live_matches:
                print("No matches found on Cricinfo live scores page.")
                return []

            selected_matches = live_matches[:limit]
            for live_match in selected_matches:
                normalized = fetch_and_normalize_match(context, live_match)
                if normalized:
                    normalized_matches.append(normalized)
        finally:
            browser.close()

    return normalized_matches


def main():
    match_limit = get_match_limit()
    normalized_matches = fetch_cricinfo_matches(match_limit)

    if not normalized_matches:
        print("No Cricinfo matches could be normalized.")
        return

    print(
        "Selected Cricinfo matches:",
        ", ".join(
            f"{match['team1']} vs {match['team2']} ({match['date']})"
            for match in normalized_matches
        ),
    )
    send_data_to_server(normalized_matches)


if __name__ == "__main__":
    main()
