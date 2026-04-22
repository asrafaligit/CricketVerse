import json
import os
import re
import time
from datetime import UTC, date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import requests
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(PROJECT_ROOT / ".env")
load_dotenv(PROJECT_ROOT / "backend" / ".env")


TEAM_NAME_MAP = {
    "IND": "India",
    "AUS": "Australia",
    "ENG": "England",
    "PAK": "Pakistan",
    "WI": "West Indies",
    "SA": "South Africa",
    "SL": "Sri Lanka",
    "BAN": "Bangladesh",
    "IRE": "Ireland",
    "SCOT": "Scotland",
    "NZ": "New Zealand",
    "ZIM": "Zimbabwe",
    "AFG": "Afghanistan",
    "NED": "Netherlands",
    "NEP": "Nepal",
    "HKG": "Hong Kong",
}

API_BASE_URL = "https://api.cricapi.com/v1"
DEFAULT_ENDPOINT = "matches"
REQUEST_TIMEOUT = 20
DEFAULT_FIXTURE_PATH = Path("Scraping/fixtures/sample_matches.json")
DEFAULT_MATCH_LIMIT = 3
DEFAULT_TIMEZONE = "Asia/Kolkata"
PRIORITY_DAY_OFFSETS = (0, -1, 1)
STATUS_PRIORITY = {
    "LIVE": 0,
    "FIXTURE": 1,
    "RESULT": 2,
}


def get_backend_url():
    explicit_url = os.environ.get("BACKEND_API_URL") or os.environ.get(
        "REACT_APP_API_URL"
    )
    if explicit_url:
        return explicit_url.rstrip("/")

    backend_port = os.environ.get("BACKEND_PORT") or os.environ.get("PORT") or "3001"
    return f"http://localhost:{backend_port}"


def is_truthy(value):
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def get_fixture_path():
    fixture_path = Path(
        os.environ.get("CRICKET_DATA_FIXTURE_PATH", str(DEFAULT_FIXTURE_PATH))
    )
    if not fixture_path.is_absolute():
        fixture_path = PROJECT_ROOT / fixture_path
    return fixture_path


def get_match_limit():
    raw_limit = os.environ.get("CRICKET_DATA_MATCH_LIMIT", str(DEFAULT_MATCH_LIMIT))
    try:
        return max(1, int(raw_limit))
    except ValueError:
        return DEFAULT_MATCH_LIMIT


def get_app_timezone():
    timezone_name = os.environ.get("CRICKET_DATA_TIMEZONE", DEFAULT_TIMEZONE).strip()
    try:
        return ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        print(
            f"Unknown timezone '{timezone_name}'. Falling back to UTC for date selection."
        )
        return UTC


def get_reference_now(reference_now=None):
    app_timezone = get_app_timezone()
    if reference_now is None:
        return datetime.now(app_timezone)

    if reference_now.tzinfo is None:
        return reference_now.replace(tzinfo=app_timezone)

    return reference_now.astimezone(app_timezone)


def load_fixture_response(fixture_path):
    try:
        with fixture_path.open("r", encoding="utf-8") as fixture_file:
            return json.load(fixture_file)
    except FileNotFoundError:
        print(f"Fixture file not found: {fixture_path}")
    except json.JSONDecodeError as exc:
        print(f"Fixture file is not valid JSON: {exc}")
    except OSError as exc:
        print(f"Could not read fixture file: {exc}")
    return None


def save_fixture_response(fixture_path, payload):
    try:
        fixture_path.parent.mkdir(parents=True, exist_ok=True)
        with fixture_path.open("w", encoding="utf-8") as fixture_file:
            json.dump(payload, fixture_file, indent=2)
        print(f"Saved live API response to fixture: {fixture_path}")
    except OSError as exc:
        print(f"Could not write fixture file: {exc}")


def fetch_with_retry(url, params=None, retries=3):
    for attempt in range(retries):
        try:
            response = requests.get(url, params=params, timeout=REQUEST_TIMEOUT)
            response.raise_for_status()
            return response.json()
        except requests.RequestException as exc:
            print(f"Retry {attempt + 1} failed: {exc}")
            time.sleep(2**attempt)
    return None


def send_data_to_server(data):
    backend_url = get_backend_url()
    try:
        response = requests.post(
            f"{backend_url}/save-data",
            json=data,
            timeout=REQUEST_TIMEOUT,
        )
        response.raise_for_status()
        print(f"Data sent successfully to {backend_url}.")
    except requests.RequestException as exc:
        print(f"Error sending data to {backend_url}: {exc}")
        print(
            "Make sure the backend is running, or set BACKEND_API_URL/REACT_APP_API_URL "
            "to your deployed backend URL."
        )


def clean_team_name(team_name):
    if not team_name:
        return "TBD"

    team_name = re.sub(r"\s*\[[^\]]+\]\s*$", "", str(team_name)).strip()
    return TEAM_NAME_MAP.get(team_name.upper(), team_name)


def parse_match_datetime(match, timezone=None):
    timezone = timezone or get_app_timezone()
    raw_datetime = match.get("dateTimeGMT")

    if raw_datetime:
        try:
            parsed = datetime.fromisoformat(str(raw_datetime).replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=UTC)
            return parsed.astimezone(timezone)
        except ValueError:
            pass

    raw_date = match.get("date")
    if raw_date:
        try:
            parsed_date = date.fromisoformat(str(raw_date).split("T")[0])
            return datetime(
                parsed_date.year,
                parsed_date.month,
                parsed_date.day,
                12,
                0,
                tzinfo=timezone,
            )
        except ValueError:
            return None

    return None


def get_match_day_offset(match, reference_date, timezone=None):
    match_datetime = parse_match_datetime(match, timezone=timezone)
    if not match_datetime:
        return None
    return (match_datetime.date() - reference_date).days


def normalize_date(match):
    match_datetime = parse_match_datetime(match)
    if match_datetime:
        return match_datetime.date().isoformat()
    return "N/A"


def normalize_status(match):
    ms = str(match.get("ms") or "").strip().lower()
    if ms == "result":
        return "RESULT"
    if ms == "fixture":
        return "FIXTURE"
    if ms:
        return "LIVE"

    if match.get("matchEnded"):
        return "RESULT"
    if match.get("matchStarted"):
        return "LIVE"

    status_text = str(match.get("status") or "").lower()
    result_markers = ("won by", "match tied", "draw", "no result", "abandoned")
    if any(marker in status_text for marker in result_markers):
        return "RESULT"

    return "FIXTURE"


def get_team_names(match):
    team_info = [team for team in match.get("teamInfo", []) if team.get("name")]
    if len(team_info) >= 2:
        return (
            clean_team_name(team_info[0]["name"]),
            clean_team_name(team_info[1]["name"]),
        )

    teams = [clean_team_name(team) for team in match.get("teams", []) if team]
    if len(teams) >= 2:
        return teams[0], teams[1]

    return clean_team_name(match.get("t1")), clean_team_name(match.get("t2"))


def get_team_images(match):
    team_info = match.get("teamInfo", [])
    if len(team_info) >= 2:
        return team_info[0].get("img", ""), team_info[1].get("img", "")

    return match.get("t1img", ""), match.get("t2img", "")


def format_score_summary(score):
    runs = score.get("r")
    wickets = score.get("w")
    overs = score.get("o")

    if runs in (None, ""):
        return ""

    summary = str(runs)
    if wickets not in (None, ""):
        summary = f"{summary}/{wickets}"
    if overs not in (None, ""):
        summary = f"{summary} ({overs})"
    return summary


def build_score_breakdown(match, team1, team2):
    structured_scores = match.get("score") or []
    if structured_scores:
        breakdown = []
        for score in structured_scores:
            breakdown.append(
                {
                    "inning": str(score.get("inning") or "").strip(),
                    "runs": score.get("r"),
                    "wickets": score.get("w"),
                    "overs": score.get("o"),
                    "summary": format_score_summary(score),
                }
            )
        return breakdown

    fallback_breakdown = []
    if match.get("t1s"):
        fallback_breakdown.append(
            {
                "inning": f"{team1} Inning 1",
                "runs": None,
                "wickets": None,
                "overs": None,
                "summary": str(match.get("t1s")).strip(),
            }
        )
    if match.get("t2s"):
        fallback_breakdown.append(
            {
                "inning": f"{team2} Inning 1",
                "runs": None,
                "wickets": None,
                "overs": None,
                "summary": str(match.get("t2s")).strip(),
            }
        )
    return fallback_breakdown


def extract_team_scores(match, team1, team2):
    t1_score = str(match.get("t1s") or "").strip()
    t2_score = str(match.get("t2s") or "").strip()
    if t1_score or t2_score:
        return t1_score or "Yet to bat", t2_score or "Yet to bat"

    breakdown = build_score_breakdown(match, team1, team2)
    if not breakdown:
        return "Yet to bat", "Yet to bat"

    grouped_scores = {team1: [], team2: []}
    for inning in breakdown:
        inning_name = str(inning.get("inning") or "").lower()
        for team_name in grouped_scores:
            if team_name and team_name.lower() in inning_name:
                grouped_scores[team_name].append(inning.get("summary") or "")
                break

    score1 = grouped_scores[team1][-1] if grouped_scores[team1] else ""
    score2 = grouped_scores[team2][-1] if grouped_scores[team2] else ""

    if not score1 and breakdown:
        score1 = breakdown[0].get("summary") or ""
    if not score2 and len(breakdown) > 1:
        score2 = breakdown[1].get("summary") or ""

    return score1 or "Yet to bat", score2 or "Yet to bat"


def get_match_sort_key(match, reference_now):
    match_datetime = parse_match_datetime(match, timezone=reference_now.tzinfo)
    if match_datetime:
        seconds_from_now = abs((match_datetime - reference_now).total_seconds())
    else:
        seconds_from_now = float("inf")

    return (
        STATUS_PRIORITY.get(normalize_status(match), 99),
        seconds_from_now,
        str(match.get("id") or ""),
    )


def pop_next_match(match_buckets, day_offset):
    if day_offset not in match_buckets or not match_buckets[day_offset]:
        return None

    next_match = match_buckets[day_offset].pop(0)
    if not match_buckets[day_offset]:
        del match_buckets[day_offset]
    return next_match


def choose_balanced_offset(available_offsets, selected_offsets):
    past_offsets = sorted((offset for offset in available_offsets if offset < 0), key=abs)
    future_offsets = sorted(
        (offset for offset in available_offsets if offset > 0), key=abs
    )

    if not past_offsets and not future_offsets:
        return None
    if not past_offsets:
        return future_offsets[0]
    if not future_offsets:
        return past_offsets[0]

    selected_past = sum(1 for offset in selected_offsets if offset < 0)
    selected_future = sum(1 for offset in selected_offsets if offset > 0)

    if selected_past == 0 and selected_future > 0:
        return past_offsets[0]
    if selected_future == 0 and selected_past > 0:
        return future_offsets[0]

    if selected_past < selected_future:
        return past_offsets[0]
    if selected_future < selected_past:
        return future_offsets[0]

    if abs(past_offsets[0]) <= abs(future_offsets[0]):
        return past_offsets[0]
    return future_offsets[0]


def select_priority_matches(matches, limit=DEFAULT_MATCH_LIMIT, reference_now=None):
    reference_now = get_reference_now(reference_now)
    reference_date = reference_now.date()
    match_buckets = {}

    for match in matches:
        day_offset = get_match_day_offset(
            match,
            reference_date=reference_date,
            timezone=reference_now.tzinfo,
        )
        if day_offset is None:
            continue
        match_buckets.setdefault(day_offset, []).append(match)

    for day_offset, grouped_matches in match_buckets.items():
        match_buckets[day_offset] = sorted(
            grouped_matches,
            key=lambda item: get_match_sort_key(item, reference_now),
        )

    selected_matches = []
    selected_offsets = []

    for day_offset in PRIORITY_DAY_OFFSETS:
        if len(selected_matches) >= limit:
            break

        priority_match = pop_next_match(match_buckets, day_offset)
        if priority_match:
            selected_matches.append(priority_match)
            selected_offsets.append(day_offset)

    while len(selected_matches) < limit:
        extra_today_match = pop_next_match(match_buckets, 0)
        if extra_today_match:
            selected_matches.append(extra_today_match)
            selected_offsets.append(0)
            continue

        next_offset = choose_balanced_offset(match_buckets.keys(), selected_offsets)
        if next_offset is None:
            break

        selected_match = pop_next_match(match_buckets, next_offset)
        if not selected_match:
            continue

        selected_matches.append(selected_match)
        selected_offsets.append(next_offset)

    return selected_matches


def normalize_match(match, endpoint):
    team1, team2 = get_team_names(match)
    team1_img, team2_img = get_team_images(match)
    score_breakdown = build_score_breakdown(match, team1, team2)
    score1, score2 = extract_team_scores(match, team1, team2)
    raw_status_text = str(match.get("status") or "").strip()

    return {
        "match_id": str(match.get("id") or "").strip(),
        "status": normalize_status(match),
        "team1": team1,
        "team2": team2,
        "team1_img": team1_img,
        "team2_img": team2_img,
        "score1": score1,
        "score2": score2,
        "match_result": raw_status_text or "Status unavailable",
        "match_url": "",
        "match_format": str(match.get("matchType") or "").strip().lower(),
        "venue": str(match.get("venue") or "N/A").strip(),
        "date": normalize_date(match),
        "series": str(match.get("series") or match.get("name") or "").strip(),
        "toss": "N/A",
        "player_of_the_match": "N/A",
        "current_run_rate": "N/A",
        "score_breakdown": score_breakdown,
        "inning_1": {"batting": [], "bowling": []},
        "inning_2": {"batting": [], "bowling": []},
        "source_endpoint": endpoint,
        "last_synced_at": datetime.now(UTC).isoformat(),
    }


def fetch_matches(api_key, endpoint):
    url = f"{API_BASE_URL}/{endpoint}"
    params = {"apikey": api_key}

    if endpoint in {"matches", "currentMatches"}:
        params["offset"] = 0

    return fetch_with_retry(url, params=params)


def main():
    api_key = (
        os.environ.get("CRICKET_DATA_API_KEY")
        or os.environ.get("CRICKET_API_KEY")
        or os.environ.get("CRIC_API_KEY")
    )
    endpoint = os.environ.get("CRICKET_DATA_ENDPOINT", DEFAULT_ENDPOINT).strip()
    source_mode = os.environ.get("CRICKET_DATA_SOURCE", "live").strip().lower()
    fixture_path = get_fixture_path()
    match_limit = get_match_limit()

    if source_mode not in {"live", "fixture"}:
        print("CRICKET_DATA_SOURCE must be either 'live' or 'fixture'.")
        return

    if source_mode == "live" and not api_key:
        print("CRICKET_DATA_API_KEY is missing. Add it to your environment first.")
        return

    if source_mode == "fixture":
        response_data = load_fixture_response(fixture_path)
        if not response_data:
            print("Fixture load failed.")
            return
        print(f"Loaded fixture data from {fixture_path}")
        source_label = f"fixture:{fixture_path.name}"
    else:
        response_data = fetch_matches(api_key, endpoint)
        if not response_data:
            print("Main API fetch failed.")
            return

        if is_truthy(os.environ.get("SCRAPER_SAVE_FIXTURE", "false")):
            save_fixture_response(fixture_path, response_data)

        source_label = endpoint

    all_matches = response_data.get("data") or []
    selected_matches = select_priority_matches(all_matches, limit=match_limit)
    normalized_matches = [
        normalize_match(match, source_label)
        for match in selected_matches
        if match.get("id")
    ]

    if not normalized_matches:
        print("No matches were returned by the API after filtering.")
        return

    print(
        "Selected matches:",
        ", ".join(
            f"{match['team1']} vs {match['team2']} ({match['date']})"
            for match in normalized_matches
        ),
    )
    send_data_to_server(normalized_matches)

    if source_mode == "live":
        credits_left = response_data.get("creditsLeft")
        if credits_left is not None:
            print(f"Credits left: {credits_left}")


if __name__ == "__main__":
    main()
