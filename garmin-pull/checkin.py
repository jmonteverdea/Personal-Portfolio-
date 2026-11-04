"""Weekly fat-loss check-in from Garmin data.

Compares the 7 full days ending yesterday with the week before and the 4 weeks before that,
then writes a short email (output/checkin.txt, subject on the first line).
With --dashboard DIR it also writes the dashboard's data files (90 days by default).
"""

import argparse
import json
import statistics
from datetime import date, timedelta
from pathlib import Path

from garmin_data import ACTIVITY_COLUMNS, DAILY_COLUMNS, fetch, yesterday

OUTPUT_DIR = Path(__file__).parent / "output"

# Targets. Change them here; the email and dashboard read the same numbers.
STEP_FLOOR = 7000          # steps a day
VIGOROUS_TARGET = 75       # vigorous minutes a week (Garmin fitness-age target)
WEIGH_INS_TARGET = 3       # weigh-ins a week
SLEEP_TARGET = 7.0         # hours a night


def vals(rows, key):
    return [r[key] for r in rows if isinstance(r.get(key), (int, float))]


def mean(rows, key):
    v = vals(rows, key)
    return statistics.mean(v) if v else None


def total(rows, key):
    return sum(vals(rows, key))


def complete(rows):
    """Days Garmin has a daily summary for."""
    return [r for r in rows if r.get("steps") is not None]


def week_stats(rows):
    full = complete(rows)
    return {
        "days": len(full),
        "steps": mean(full, "steps"),
        "floor_days": sum(1 for r in full if r["steps"] >= STEP_FLOOR),
        "active_cal": mean(full, "active_calories"),
        "total_cal": mean(full, "total_calories"),
        "vigorous": total(rows, "intensity_vigorous"),
        "moderate": total(rows, "intensity_moderate"),
        "workouts": total(rows, "activity_count"),
        "workout_min": total(rows, "activity_minutes"),
        "sleep": mean(rows, "sleep_hours"),
        "sleep_nights": len(vals(rows, "sleep_hours")),
        "sleep_ok": sum(1 for v in vals(rows, "sleep_hours") if v >= SLEEP_TARGET),
        "hrv": mean(rows, "hrv"),
        "rhr": mean(full, "resting_hr"),
        "stress": mean(full, "avg_stress"),
        "weigh_ins": len(vals(rows, "weight_kg")),
    }


def fmt(v, digits=0, suffix=""):
    if v is None:
        return "no data"
    return f"{v:,.{digits}f}{suffix}"


def delta(now, before, digits=0, suffix=""):
    if now is None or before is None:
        return ""
    d = now - before
    sign = "+" if d > 0 else ""
    return f" ({sign}{d:,.{digits}f}{suffix} vs last week)"


def pick_action(w, latest_weight):
    if w["weigh_ins"] < WEIGH_INS_TARGET:
        return (
            f"Weigh in {WEIGH_INS_TARGET} mornings this week (Mon, Wed, Fri, after the bathroom, before food). "
            "Without weight, this check-in cannot tell you if fat loss is working."
        )
    if (w["steps"] or 0) < STEP_FLOOR:
        gap = STEP_FLOOR - (w["steps"] or 0)
        return f"Close the step gap: about {gap:,.0f} more steps a day. A 15-minute walk after lunch and dinner covers it."
    if w["vigorous"] < VIGOROUS_TARGET:
        return f"Add 2 hard 20-minute sessions (intervals on the treadmill or bike). You logged {w['vigorous']:.0f} of {VIGOROUS_TARGET} vigorous minutes."
    if w["sleep"] is not None and w["sleep"] < SLEEP_TARGET:
        return f"Protect sleep: lights out 30 minutes earlier. You averaged {w['sleep']:.1f} h."
    return "Every lever is on target. Repeat this week exactly."


def build_email(days, end, weights, goal_kg):
    by_day = {r["date"]: r for r in days}

    def window(last, n=7):
        return [by_day[(last - timedelta(days=i)).isoformat()] for i in range(n) if (last - timedelta(days=i)).isoformat() in by_day]

    this = week_stats(window(end))
    prev = week_stats(window(end - timedelta(days=7)))
    base = week_stats(window(end - timedelta(days=14), 28))
    start = end - timedelta(days=6)

    latest = weights[-1] if weights else None
    weight_line = "no weigh-ins on record"
    if latest:
        weight_line = f"{latest['weight_kg']:.1f} kg on {latest['date']}"
        if goal_kg:
            weight_line += f", {latest['weight_kg'] - goal_kg:+.1f} kg from your {goal_kg:.0f} kg goal"

    def mark(ok):
        return "OK  " if ok else "MISS"

    lines = [
        f"Garmin check-in: {start:%b %-d} to {end:%b %-d}. {fmt(this['steps'])} steps a day, {this['weigh_ins']} weigh-ins",
        "",
        f"Week of {start:%a %b %-d} to {end:%a %b %-d} ({this['days']} days with data)",
        "",
        "TARGETS",
        f"{mark((this['steps'] or 0) >= STEP_FLOOR)}  Steps: {fmt(this['steps'])} a day{delta(this['steps'], prev['steps'])}. "
        f"{this['floor_days']} of {this['days']} days at {STEP_FLOOR:,}+.",
        f"{mark(this['weigh_ins'] >= WEIGH_INS_TARGET)}  Weigh-ins: {this['weigh_ins']} of {WEIGH_INS_TARGET}. Latest: {weight_line}.",
        f"{mark(this['vigorous'] >= VIGOROUS_TARGET)}  Vigorous minutes: {this['vigorous']:.0f} of {VIGOROUS_TARGET}. "
        f"{this['workouts']:.0f} workouts, {this['workout_min']:.0f} min.",
        f"{mark((this['sleep'] or 0) >= SLEEP_TARGET)}  Sleep: {fmt(this['sleep'], 1, ' h')} a night{delta(this['sleep'], prev['sleep'], 1, ' h')}. "
        f"{this['sleep_ok']} of {this['sleep_nights']} nights at {SLEEP_TARGET:.0f} h+.",
        "",
        "CONTEXT",
        f"Calories burned: {fmt(this['total_cal'])} a day, {fmt(this['active_cal'])} of it active{delta(this['active_cal'], prev['active_cal'])}.",
        f"4-week baseline: {fmt(base['steps'])} steps, {fmt(base['active_cal'])} active kcal a day.",
        f"Recovery: HRV {fmt(this['hrv'])} ms, resting HR {fmt(this['rhr'])} bpm, stress {fmt(this['stress'])}.",
        "",
        "THIS WEEK'S ONE ACTION",
        pick_action(this, latest),
        "",
        "Dashboard: https://claude.ai/artifact/RW7mkq3xS4gSQLPp2LERjE",
    ]
    return "\n".join(lines) + "\n"


def write_dashboard(out_dir, data):
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "daily.json").write_text(json.dumps([{k: r[k] for k in DAILY_COLUMNS} for r in data["days"]]))
    (out_dir / "activities.json").write_text(json.dumps([{k: a[k] for k in ACTIVITY_COLUMNS} for a in data["activities"]]))
    (out_dir / "weights.json").write_text(json.dumps(data["weights"]))
    fa = data["fitness"] or {}
    comp = fa.get("components") or {}
    profile = [{
        "as_of": data["days"][-1]["date"],
        "chronological_age": fa.get("chronologicalAge"),
        "fitness_age": round(fa["fitnessAge"], 1) if isinstance(fa.get("fitnessAge"), (int, float)) else None,
        "achievable_fitness_age": round(fa["achievableFitnessAge"], 1) if isinstance(fa.get("achievableFitnessAge"), (int, float)) else None,
        "vigorous_minutes_avg": (comp.get("vigorousMinutesAvg") or {}).get("value"),
        "vigorous_days_avg": (comp.get("vigorousDaysAvg") or {}).get("value"),
        "bmi": (comp.get("bmi") or {}).get("value"),
        "bmi_target": (comp.get("bmi") or {}).get("targetValue"),
        "goal_kg": data["goal_kg"],
    }]
    (out_dir / "profile.json").write_text(json.dumps(profile))


def main():
    parser = argparse.ArgumentParser(description="Weekly Garmin fat-loss check-in.")
    parser.add_argument("--end", type=date.fromisoformat, default=yesterday(), help="last day of the week (default: yesterday)")
    parser.add_argument("--history", type=int, default=90, help="days to pull (at least 42; default 90)")
    parser.add_argument("--dashboard", type=Path, help="also write dashboard data files to this folder")
    args = parser.parse_args()

    history = max(args.history, 42)
    data = fetch(args.end - timedelta(days=history - 1), args.end, with_profile=True)

    OUTPUT_DIR.mkdir(exist_ok=True)
    email = build_email(data["days"], args.end, data["weights"], data["goal_kg"])
    (OUTPUT_DIR / "checkin.txt").write_text(email)
    print(email)
    if args.dashboard:
        write_dashboard(args.dashboard, data)
        print(f"wrote dashboard files to {args.dashboard}")


if __name__ == "__main__":
    main()
