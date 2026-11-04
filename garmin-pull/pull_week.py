"""Pull daily Garmin data for a weekly fat-loss check-in.

Writes one CSV (one row per day) and one raw JSON file to output/.
The API key is found by the package itself (env var or key file). It is never printed.
"""

import argparse
import csv
import json
import sys
from datetime import date, timedelta
from pathlib import Path

from garmin_personal_api import (
    GarminPersonalApiClient,
    HttpError,
    PersonalApiAuthenticator,
    resolve_api_key,
)

OUTPUT_DIR = Path(__file__).parent / "output"

COLUMNS = [
    "date",
    "sleep_hours",
    "deep_sleep_hours",
    "rem_sleep_hours",
    "sleep_score",
    "steps",
    "total_calories",
    "active_calories",
    "bmr_calories",
    "resting_hr",
    "avg_stress",
    "max_stress",
    "activity_count",
    "activity_minutes",
    "activity_calories",
    "activity_distance_km",
    "activities",
]


class Puller:
    def __init__(self, auth, client, api_key):
        self.auth = auth
        self.client = client
        self.api_key = api_key
        self.refreshed = False

    def call(self, label, fn, *args, **kwargs):
        """Run one API call. Refresh the token once on 401. Return None on empty or failed days."""
        try:
            return fn(*args, **kwargs)
        except HttpError as e:
            if e.status_code == 401 and not self.refreshed:
                print("401 received, refreshing token and retrying once", file=sys.stderr)
                self.refreshed = True
                token = self.auth.obtain_token(self.api_key, force_refresh=True)
                self.client.update_bearer_token(token.access_token)
                return self.call(label, fn, *args, **kwargs)
            if e.status_code == 401:
                raise
            print(f"warning: {label} returned HTTP {e.status_code}, leaving it empty", file=sys.stderr)
            return None

    def activities(self, day):
        found, start, limit = [], 0, 50
        while True:
            page = self.call(
                f"activities {day}",
                self.client.search_activities,
                start=start,
                limit=limit,
                start_date=day,
                end_date=day,
            )
            if not isinstance(page, list) or not page:
                break
            found.extend(page)
            if len(page) < limit:
                break
            start += limit
        return found


def find(obj, key):
    """Return the first value for key anywhere in a nested JSON object, or None."""
    if isinstance(obj, dict):
        if key in obj:
            return obj[key]
        obj = list(obj.values())
    if isinstance(obj, list):
        for item in obj:
            value = find(item, key)
            if value is not None:
                return value
    return None


def num(value):
    return value if isinstance(value, (int, float)) else 0


def hours(seconds):
    return round(seconds / 3600, 2) if isinstance(seconds, (int, float)) else ""


def blank(value):
    return "" if value is None else value


def build_row(day, raw):
    sleep, steps, summary, acts = raw["sleep"], raw["steps"], raw["daily_summary"], raw["activities"]
    score = find(sleep, "overall")
    return {
        "date": day,
        "sleep_hours": hours(find(sleep, "sleepTimeSeconds")),
        "deep_sleep_hours": hours(find(sleep, "deepSleepSeconds")),
        "rem_sleep_hours": hours(find(sleep, "remSleepSeconds")),
        "sleep_score": blank(score.get("value")) if isinstance(score, dict) else "",
        "steps": blank(find(steps, "totalSteps")),
        "total_calories": blank(find(summary, "totalKilocalories")),
        "active_calories": blank(find(summary, "activeKilocalories")),
        "bmr_calories": blank(find(summary, "bmrKilocalories")),
        "resting_hr": blank(find(summary, "restingHeartRate")),
        "avg_stress": blank(find(summary, "averageStressLevel")),
        "max_stress": blank(find(summary, "maxStressLevel")),
        "activity_count": len(acts),
        "activity_minutes": round(sum(num(a.get("duration")) for a in acts) / 60, 1),
        "activity_calories": round(sum(num(a.get("calories")) for a in acts)),
        "activity_distance_km": round(sum(num(a.get("distance")) for a in acts) / 1000, 2),
        "activities": "; ".join(str(a.get("activityName", "")) for a in acts),
    }


def main():
    parser = argparse.ArgumentParser(description="Pull daily Garmin data to CSV and JSON.")
    parser.add_argument("--days", type=int, default=7, help="number of days ending today (default: 7)")
    args = parser.parse_args()
    if args.days < 1:
        parser.error("--days must be 1 or more")

    end = date.today()
    start = end - timedelta(days=args.days - 1)
    days = [(start + timedelta(days=i)).isoformat() for i in range(args.days)]

    api_key = resolve_api_key()
    raw_all, rows = {}, []
    with PersonalApiAuthenticator() as auth:
        token = auth.obtain_token(api_key)
        with GarminPersonalApiClient(token.access_token) as client:
            p = Puller(auth, client, api_key)
            for day in days:
                print(f"pulling {day}", file=sys.stderr)
                raw = {
                    "sleep": p.call(f"sleep {day}", client.get_daily_sleep, day),
                    "steps": p.call(f"steps {day}", client.get_daily_steps, day, day),
                    "daily_summary": p.call(f"daily summary {day}", client.get_daily_summaries, day, day),
                    "activities": p.activities(day),
                }
                raw_all[day] = raw
                rows.append(build_row(day, raw))

    OUTPUT_DIR.mkdir(exist_ok=True)
    stem = f"garmin_{days[0]}_to_{days[-1]}"
    csv_path = OUTPUT_DIR / f"{stem}.csv"
    json_path = OUTPUT_DIR / f"{stem}.json"
    with csv_path.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    json_path.write_text(json.dumps(raw_all, indent=2))
    print(f"wrote {csv_path}\nwrote {json_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
