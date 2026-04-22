import json
import re

from playwright.sync_api import sync_playwright


URLS = [
    "https://www.espncricinfo.com/live-cricket-score",
    "https://www.espncricinfo.com/live-cricket-match-results",
]

FIRST_LIVE_MATCH = {}


def extract_next_data(html: str):
    match = re.search(
        r'<script id="__NEXT_DATA__" type="application/json">\s*(.*?)\s*</script>',
        html,
        re.DOTALL,
    )
    if not match:
        return None
    return json.loads(match.group(1))


def print_match_summaries(matches):
    if not isinstance(matches, list):
        return

    print("matches_count:", len(matches))
    for item in matches[:4]:
        series = item.get("series") or {}
        teams = item.get("teams") or []
        team_names = []
        for team in teams[:2]:
            team_obj = team.get("team") or {}
            team_names.append(team_obj.get("name") or team_obj.get("abbreviation"))
        print(
            {
                "match_id": item.get("objectId"),
                "series_id": series.get("objectId"),
                "title": item.get("title"),
                "status": item.get("status"),
                "statusText": item.get("statusText"),
                "teams": team_names,
            }
        )


def summarize_next_data(url: str, data: dict):
    print(f"\n=== {url} ===")
    print("top_keys:", list(data.keys()))
    props = data.get("props", {})
    app_page_props = props.get("appPageProps", {})
    app_data = app_page_props.get("data", {})
    print(
        "appPageProps.data keys:",
        list(app_data.keys()) if isinstance(app_data, dict) else type(app_data).__name__,
    )

    if isinstance(app_data, dict):
        content = app_data.get("content")
        if isinstance(content, dict):
            print("appPageProps.data.content keys:", list(content.keys())[:50])
            for key, value in content.items():
                if isinstance(value, list):
                    print(f"content[{key}] -> list[{len(value)}]")
                elif isinstance(value, dict):
                    print(f"content[{key}] -> dict keys:", list(value.keys())[:20])

            if isinstance(content.get("matches"), list):
                print_match_summaries(content.get("matches"))

            if isinstance(content.get("matchCards"), list):
                print("matchCards_count:", len(content["matchCards"]))
                for card in content["matchCards"][:4]:
                    if isinstance(card, dict):
                        print("matchCard keys:", list(card.keys())[:20])

        nested_data = app_data.get("data")
        if isinstance(nested_data, dict):
            print("appPageProps.data.data keys:", list(nested_data.keys()))
            content = nested_data.get("content")
            if isinstance(content, dict):
                print("content keys:", list(content.keys()))
                print_match_summaries(content.get("matches"))


def inspect_match_scorecard(context, series_id, match_id):
    url = f"https://www.espncricinfo.com/series/x-{series_id}/x-{match_id}/full-scorecard"
    page = context.new_page()
    response = page.goto(url, wait_until="domcontentloaded", timeout=60000)
    print("\nscorecard_url:", url)
    print("scorecard_status:", response.status if response else "no-response")
    html = page.content()
    data = extract_next_data(html)
    print("scorecard_has_next_data:", bool(data))

    if isinstance(data, dict):
        app_data = data.get("props", {}).get("appPageProps", {}).get("data", {})
        print(
            "scorecard_app_data_keys:",
            list(app_data.keys()) if isinstance(app_data, dict) else type(app_data).__name__,
        )
        match_data = app_data.get("match")
        content = app_data.get("content")
        if isinstance(match_data, dict):
            print("scorecard_match_keys:", list(match_data.keys())[:40])
            print("scorecard_status_text:", match_data.get("statusText"))
            print("scorecard_title:", match_data.get("title"))
        if isinstance(content, dict):
            print("scorecard_content_keys:", list(content.keys())[:50])
            innings = content.get("innings")
            if isinstance(innings, list):
                print("innings_count:", len(innings))
                for inning in innings[:2]:
                    print(
                        {
                            "inning_number": inning.get("inningNumber"),
                            "event": inning.get("event"),
                            "team": (inning.get("team") or {}).get("name"),
                            "runs": inning.get("runs"),
                            "wickets": inning.get("wickets"),
                            "overs": inning.get("overs"),
                            "batsmen_count": len(inning.get("inningBatsmen") or []),
                            "bowlers_count": len(inning.get("inningBowlers") or []),
                        }
                    )
                    first_batter = (inning.get("inningBatsmen") or [None])[0]
                    first_bowler = (inning.get("inningBowlers") or [None])[0]
                    if isinstance(first_batter, dict):
                        print("sample_batter_keys:", list(first_batter.keys())[:30])
                    if isinstance(first_bowler, dict):
                        print("sample_bowler_keys:", list(first_bowler.keys())[:30])

    page.close()


def main():
    with sync_playwright() as pw:
        browser = pw.webkit.launch(headless=True)
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/605.1.15 (KHTML, like Gecko) "
                "Version/16.0 Safari/605.1.15"
            ),
        )

        for url in URLS:
            page = context.new_page()
            response = page.goto(url, wait_until="domcontentloaded", timeout=60000)
            print("url:", url)
            print("status:", response.status if response else "no-response")
            html = page.content()
            print("html_length:", len(html))
            data = extract_next_data(html)
            print("has_next_data:", bool(data))
            if data:
                summarize_next_data(url, data)

                if url.endswith("/live-cricket-score"):
                    app_data = data.get("props", {}).get("appPageProps", {}).get("data", {})
                    content = app_data.get("content", {})
                    matches = content.get("matches") or []
                    if matches:
                        first_match = matches[0]
                        FIRST_LIVE_MATCH["series_id"] = (first_match.get("series") or {}).get("objectId")
                        FIRST_LIVE_MATCH["match_id"] = first_match.get("objectId")
            page.close()

        if FIRST_LIVE_MATCH.get("series_id") and FIRST_LIVE_MATCH.get("match_id"):
            inspect_match_scorecard(
                context,
                FIRST_LIVE_MATCH["series_id"],
                FIRST_LIVE_MATCH["match_id"],
            )

        browser.close()


if __name__ == "__main__":
    main()
