"""Fetch Garmin data for a date range and shape it into one row per day.

Uses range endpoints in small chunks, so 90 days takes a few dozen calls, not hundreds.
The API key is found by the package itself (env var or key file). It is never printed.
"""

import sys
import time
from datetime import date, timedelta

from garmin_personal_api import (
    GarminPersonalApiClient,
    HttpError,
    PersonalApiAuthenticator,
    resolve_api_key,
)

# Garmin refuses some range calls longer than about a month.
CHUNK_DAYS = 28

DAILY_COLUMNS = [
    "date",
    "steps",
    "total_calories",
    "active_calories",
    "bmr_calories",
    "resting_hr",
    "avg_stress",
    "max_stress",
    "intensity_moderate",
    "intensity_vigorous",
    "body_battery_max",
    "body_battery_min",
    "floors",
    "calories_in",
    "sleep_hours",
    "deep_sleep_hours",
    "rem_sleep_hours",
    "sleep_score",
    "hrv",
    "hrv_status",
    "weight_kg",
    "activity_count",
    "activity_minutes",
    "activity_calories",
    "activity_distance_km",
    "activities",
]

ACTIVITY_COLUMNS = ["date", "start", "name", "type", "minutes", "calories", "distance_km", "avg_hr", "max_hr", "effect"]


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


def dig(obj, *path):
    """Follow a key path inside the first object that has the first key, or return None."""
    value = find(obj, path[0])
    for key in path[1:]:
        value = value.get(key) if isinstance(value, dict) else None
    return value


def num(value):
    return value if isinstance(value, (int, float)) else 0


def hours(seconds):
    return round(seconds / 3600, 2) if isinstance(seconds, (int, float)) else None


def as_list(answer):
    """Unwrap a range answer into its list of items."""
    if isinstance(answer, list):
        return answer
    if isinstance(answer, dict):
        for key in ("data", "hrvSummaries", "dailyWeightSummaries"):
            if isinstance(answer.get(key), list):
                return answer[key]
    return []


def chunks(start, end, size=CHUNK_DAYS):
    cur = start
    while cur <= end:
        stop = min(cur + timedelta(days=size - 1), end)
        yield cur, stop
        cur = stop + timedelta(days=1)


class Session:
    """One authenticated client that refreshes its token once on a 401."""

    def __init__(self, auth, client, api_key):
        self.auth, self.client, self.api_key = auth, client, api_key
        self.refreshed = False

    def call(self, label, fn, *args, _tries=0, **kwargs):
        try:
            return fn(*args, **kwargs)
        except HttpError as e:
            if e.status_code == 429 and _tries < 5:
                wait = 2 ** (_tries + 1)
                print(f"rate limited on {label}, waiting {wait}s", file=sys.stderr)
                time.sleep(wait)
                return self.call(label, fn, *args, _tries=_tries + 1, **kwargs)
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

    def ranged(self, label, fn, start, end, size=CHUNK_DAYS):
        items = []
        for a, b in chunks(start, end, size):
            items.extend(as_list(self.call(f"{label} {a}..{b}", fn, a.isoformat(), b.isoformat())))
        return items

    def activities(self, start, end):
        found, offset, limit = [], 0, 100
        while True:
            page = self.call(
                "activities",
                self.client.search_activities,
                start=offset,
                limit=limit,
                start_date=start.isoformat(),
                end_date=end.isoformat(),
            )
            if not isinstance(page, list) or not page:
                break
            found.extend(page)
            if len(page) < limit:
                break
            offset += limit
        return found


def by_date(items, *keys):
    out = {}
    for item in items:
        for key in keys:
            day = item.get(key) if isinstance(item, dict) else None
            if day:
                out[str(day)[:10]] = item
                break
    return out


def activity_row(a):
    start = str(a.get("startTimeLocal") or "")
    return {
        "date": start[:10],
        "start": start[11:16],
        "name": a.get("activityName") or "",
        "type": dig(a, "activityType", "typeKey") or "",
        "minutes": round(num(a.get("duration")) / 60, 1),
        "calories": round(num(a.get("calories"))),
        "distance_km": round(num(a.get("distance")) / 1000, 2),
        "avg_hr": a.get("averageHR"),
        "max_hr": a.get("maxHR"),
        "effect": a.get("trainingEffectLabel") or "",
    }


def consumed(summary):
    """Calories eaten, when a food log (Garmin or a synced app like MyFitnessPal) reports them."""
    cal = find(summary, "calories")
    if isinstance(cal, dict):
        for key, value in cal.items():
            if "consum" in key.lower() and isinstance(value, (int, float)) and value > 0:
                return value
    return None


def weight_kg(item):
    grams = dig(item, "latestWeight", "weight") if item else None
    return round(grams / 1000, 1) if isinstance(grams, (int, float)) else None


def build_day(day, summary, sleep, hrv, weight, acts):
    score = find(sleep, "overall") if sleep else None
    return {
        "date": day,
        "steps": dig(summary, "movement", "steps", "value"),
        "total_calories": dig(summary, "calories", "burnedTotal"),
        "active_calories": dig(summary, "calories", "burnedActive"),
        "bmr_calories": dig(summary, "calories", "burnedResting"),
        "resting_hr": dig(summary, "heartRate", "restingValue"),
        "avg_stress": dig(summary, "stress", "avgLevel"),
        "max_stress": dig(summary, "stress", "maxLevel"),
        "intensity_moderate": dig(summary, "intensityMinutes", "moderate"),
        "intensity_vigorous": dig(summary, "intensityMinutes", "vigorous"),
        "body_battery_max": dig(summary, "bodyBattery", "maxValue"),
        "body_battery_min": dig(summary, "bodyBattery", "minValue"),
        "floors": dig(summary, "movement", "floorsAscended", "value"),
        "calories_in": consumed(summary),
        "sleep_hours": hours(find(sleep, "sleepTimeSeconds")) if sleep else None,
        "deep_sleep_hours": hours(find(sleep, "deepSleepSeconds")) if sleep else None,
        "rem_sleep_hours": hours(find(sleep, "remSleepSeconds")) if sleep else None,
        "sleep_score": score.get("value") if isinstance(score, dict) else None,
        "hrv": hrv.get("lastNightAvg") if hrv else None,
        "hrv_status": hrv.get("status") if hrv else None,
        "weight_kg": weight_kg(weight),
        "activity_count": len(acts),
        "activity_minutes": round(sum(a["minutes"] for a in acts), 1),
        "activity_calories": round(sum(a["calories"] for a in acts)),
        "activity_distance_km": round(sum(a["distance_km"] for a in acts), 2),
        "activities": "; ".join(a["name"] for a in acts),
    }


def fetch(start, end, with_profile=False):
    """Return {"days": [...], "activities": [...], "weights": [...], "fitness": {...}, "goal_kg": float|None, "raw": {...}}."""
    api_key = resolve_api_key()
    with PersonalApiAuthenticator() as auth:
        token = auth.obtain_token(api_key)
        with GarminPersonalApiClient(token.access_token) as client:
            s = Session(auth, client, api_key)
            c = client
            print(f"pulling {start} to {end}", file=sys.stderr)
            summaries = by_date(s.ranged("daily summaries", c.get_daily_summaries, start, end), "calendarDate")
            hrv = by_date(s.ranged("hrv", c.get_daily_hrv_summaries, start, end, 90), "calendarDate")
            weights_raw = s.ranged("weight", c.get_weight_measurements, start - timedelta(days=730), end, 3650)
            weights = by_date(weights_raw, "summaryDate", "calendarDate")
            acts_raw = s.activities(start, end)
            # Sleep has no working range call for this account, so it is one call per night.
            sleep = {}
            day = start
            while day <= end:
                sleep[day.isoformat()] = s.call(f"sleep {day}", c.get_daily_sleep, day.isoformat())
                day += timedelta(days=1)
            fitness = s.call("fitness age", c.get_fitness_age, end.isoformat()) if with_profile else None
            goals = s.call("weight goals", c.get_effective_weight_goals, end.isoformat(), end.isoformat()) if with_profile else None

    acts = sorted((activity_row(a) for a in acts_raw), key=lambda a: (a["date"], a["start"]))
    acts_by_day = {}
    for a in acts:
        acts_by_day.setdefault(a["date"], []).append(a)

    days = []
    day = start
    while day <= end:
        d = day.isoformat()
        summary = summaries.get(d)
        sl = sleep.get(d)
        has_sleep = isinstance(find(sl, "sleepTimeSeconds"), (int, float))
        days.append(build_day(d, summary, sl if has_sleep else None, hrv.get(d), weights.get(d), acts_by_day.get(d, [])))
        day += timedelta(days=1)

    weight_log = [
        {"date": d, "weight_kg": weight_kg(w)} for d, w in sorted(weights.items()) if weight_kg(w) is not None
    ]
    goal_kg = None
    for g in (goals or {}).get("userGoals") or []:
        if g.get("userGoalType") == "WEIGHT_GRAMS" and isinstance(g.get("goalValue"), (int, float)):
            goal_kg = round(g["goalValue"] / 1000, 1)

    return {
        "days": days,
        "activities": acts,
        "weights": weight_log,
        "fitness": fitness,
        "goal_kg": goal_kg,
        "raw": {"summaries": summaries, "sleep": sleep, "hrv": hrv, "weights": weights_raw, "activities": acts_raw},
    }


def yesterday():
    return date.today() - timedelta(days=1)
