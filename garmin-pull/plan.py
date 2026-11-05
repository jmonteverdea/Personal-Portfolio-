"""The coaching plan in coach_plan.json: phases, weekly template and targets."""

import json
from datetime import date, timedelta
from pathlib import Path

PLAN = json.loads((Path(__file__).parent / "coach_plan.json").read_text())

# Interval sessions grow with the phase. Garmin counts the hard minutes as vigorous.
INTERVALS = {
    "setup": {"Tue": "Easy 30 min. Hard sessions start next week.", "Sat": "Easy bike 30 min."},
    "rebuild": {
        "Tue": "Bike: 10 min easy, then 6 x 1 min hard (8/10, high resistance) with 2 min easy between, 5 min cool-down.",
        "Sat": "Easy bike 40 min. One hard session a week in Rebuild. The Norwegian 4x4 starts Nov 30.",
    },
    "build": {
        "Tue": "Bike: 10 min easy, then 6 x 2 min hard with 2 min easy between, 5 min cool-down.",
        "Sat": "Norwegian 4x4 on the bike: 10 min easy, 4 x 4 min at 85 to 95% max HR with 3 min easy between, 5 min cool-down.",
    },
    "push": {
        "Tue": "Bike: 10 min easy, then 8 x 2 min hard with 90 s easy between, 5 min cool-down.",
        "Sat": "Norwegian 4x4 on the bike: 10 min easy, 4 x 4 min at 90 to 95% max HR with 3 min easy between, 10 min steady.",
    },
}


def d(s):
    return date.fromisoformat(s)


def phase_for(day):
    for p in PLAN["phases"]:
        if d(p["start"]) <= day <= d(p["end"]):
            return p
    return PLAN["phases"][-1] if day > d(PLAN["end"]) else PLAN["phases"][0]


def week_number(day):
    """1-based plan week (Monday start), 0 before the plan starts."""
    start = d(PLAN["start"])
    return 0 if day < start else (day - start).days // 7 + 1


def total_weeks():
    return (d(PLAN["end"]) - d(PLAN["start"])).days // 7 + 1


def session_for(day):
    dow = day.strftime("%a")
    slot = dict(PLAN["week"][dow])
    phase = phase_for(day)
    if dow in INTERVALS.get(phase["id"], {}):
        slot["detail"] = INTERVALS[phase["id"]][dow]
        if phase["hard_sessions"] < 2 and dow == "Sat":
            slot["hard"] = False
            slot["session"] = "Easy bike"
        if phase["hard_sessions"] == 0:
            slot["hard"] = False
            slot["session"] = "Easy session"
    return slot


def targets_for(day):
    p = phase_for(day)
    return {
        "steps": p["steps"],
        "vigorous": p["vigorous"],
        "weigh_ins": p["weigh_ins"],
        "hard_sessions": p["hard_sessions"],
        "food_log_days": p["food_log_days"],
        "zone2": p.get("zone2_minutes", 150),
        "sleep": 7.0,
    }


def plan_rows():
    """The plan as dashboard rows: one per phase."""
    rows = []
    for p in PLAN["phases"]:
        rows.append({k: p[k] for k in ("id", "name", "start", "end", "steps", "hard_sessions", "vigorous", "weigh_ins", "food_log_days", "focus")})
    return rows


def monday_of(day):
    return day - timedelta(days=day.weekday())
