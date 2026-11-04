"""Monday coaching review from Garmin data and the plan in coach_plan.json.

Scores the 7 full days ending yesterday against that week's phase targets, tracks the weight
trend against the March deadline, calibrates calories once food logs and weigh-ins allow,
and lays out next week. Writes output/checkin.txt (subject on the first line).
With --dashboard DIR it also writes the dashboard's data files.
"""

import argparse
import json
from datetime import date, timedelta
from pathlib import Path

from coach_logic import calibrate, week_stats, weight_trend
from garmin_data import ACTIVITY_COLUMNS, DAILY_COLUMNS, fetch, yesterday
from plan import PLAN, phase_for, plan_rows, session_for, targets_for, total_weeks, week_number

OUTPUT_DIR = Path(__file__).parent / "output"
DASHBOARD = "https://claude.ai/artifact/RW7mkq3xS4gSQLPp2LERjE"


def fmt(v, digits=0, suffix=""):
    return "no data" if v is None else f"{v:,.{digits}f}{suffix}"


def delta(now, before, digits=0, suffix=""):
    if now is None or before is None:
        return ""
    return f" ({now - before:+,.{digits}f}{suffix} vs last week)"


def build_email(data, end):
    days = data["days"]
    by_day = {r["date"]: r for r in days}

    def window(last, n=7):
        return [by_day[k] for i in range(n) if (k := (last - timedelta(days=i)).isoformat()) in by_day]

    t = targets_for(end)
    phase = phase_for(end)
    this = week_stats(window(end), t)
    prev = week_stats(window(end - timedelta(days=7)), targets_for(end - timedelta(days=7)))
    goal = PLAN["goal_kg"]
    plan_end = date.fromisoformat(PLAN["end"])
    trend = weight_trend(data["weights"], end, goal, plan_end)
    cal = calibrate(days, trend)
    start = end - timedelta(days=6)

    checks = [
        ("Steps", (this["steps"] or 0) >= t["steps"],
         f"{fmt(this['steps'])} a day, target {t['steps']:,}{delta(this['steps'], prev['steps'])}. {this['floor_days']} of {this['days']} days on target."),
        ("Weigh-ins", this["weigh_ins"] >= t["weigh_ins"], f"{this['weigh_ins']} of {t['weigh_ins']}."),
        ("Food log", this["food_days"] >= t["food_log_days"],
         f"{this['food_days']} of {t['food_log_days']} days logged" + (f", {fmt(this['intake'])} kcal a day." if this["intake"] else ".")),
        ("Hard sessions", this["hard_sessions"] >= t["hard_sessions"],
         f"{this['hard_sessions']} of {t['hard_sessions']}. {this['vigorous']:.0f} vigorous min (target {t['vigorous']})."),
        ("Sleep", (this["sleep"] or 0) >= t["sleep"], f"{fmt(this['sleep'], 1, ' h')} a night{delta(this['sleep'], prev['sleep'], 1, ' h')}."),
    ]
    if t["hard_sessions"] == 0:
        checks = [c for c in checks if c[0] != "Hard sessions"]
    hit = sum(1 for c in checks if c[1])

    wk = week_number(end)
    head = f"Week {wk} of {total_weeks()}" if wk else "Setup week"
    lines = [
        f"Coach: {head} scored {hit}/{len(checks)}. {fmt(this['steps'])} steps a day, {this['weigh_ins']} weigh-ins",
        "",
        f"{head} · {phase['name']} phase · {start:%a %b %-d} to {end:%a %b %-d}",
        "",
        f"SCORE {hit}/{len(checks)}",
    ]
    lines += [f"{'OK  ' if ok else 'MISS'}  {name}: {text}" for name, ok, text in checks]

    lines += ["", "WEIGHT"]
    if not trend:
        lines.append("No weigh-ins on record. The deadline math starts with your first one.")
    elif trend["days_old"] > 14:
        lines.append(f"Last weigh-in {trend['latest']:.1f} kg, {trend['days_old']} days ago. I am coaching blind on the number that matters.")
    else:
        lines.append(f"Trend {trend['trend_kg']:.1f} kg, {trend['to_goal']:.1f} kg to {goal:.0f} kg by {plan_end:%b %-d}.")
        lines.append(f"Needed: {trend['needed_per_week']:.2f} kg a week.")
        if trend["kg_per_week"] is not None:
            on_track = trend["projected"] and trend["projected"] <= plan_end
            proj = f"projected {trend['projected']:%b %-d, %Y}" if trend["projected"] else "not losing yet"
            lines.append(f"Actual: {trend['kg_per_week']:+.2f} kg a week, {proj}. {'On track.' if on_track else 'Behind the deadline.'}")

    lines += ["", "CALORIES"]
    if cal:
        lines.append(f"Calibrated from {cal['days']} logged days: you burn about {cal['burn']:,.0f} kcal a day.")
        lines.append(f"New target: {cal['target']:,} kcal and {PLAN['protein_g']} g protein a day.")
    else:
        lines.append(f"Target {PLAN['calories_start']:,} kcal and {PLAN['protein_g']} g protein until calibration "
                     "(needs 10+ logged days and a 2-week weight trend).")
        lines.append(f"Garmin says you burned {fmt(this['total_cal'])} a day this week.")

    lines += ["", "COACH'S CALL", coach_call(this, t, trend, checks)]

    nxt = end + timedelta(days=1)
    nt = targets_for(nxt)
    lines += ["", f"NEXT WEEK: {phase_for(nxt)['name']} · {nt['steps']:,} steps a day · {nt['weigh_ins']} weigh-ins · "
              f"{nt['hard_sessions']} hard sessions · log food {nt['food_log_days']} days"]
    for i in range(7):
        day = nxt + timedelta(days=i)
        s = session_for(day)
        tags = (" · WEIGH IN" if s["weigh_in"] else "")
        lines.append(f"{day:%a}  {s['session']}{tags}")
        if s.get("hard") and s.get("detail"):
            lines.append(f"      {s['detail']}")
    lines += ["", f"Dashboard: {DASHBOARD}"]
    return "\n".join(lines) + "\n"


def coach_call(w, t, trend, checks):
    missed = [c[0] for c in checks if not c[1]]
    if not trend or trend["days_old"] > 14:
        return "Weigh in tomorrow morning. Everything else in this plan steers off that number."
    if "Food log" in missed:
        return f"Food logging slipped ({w['food_days']} of {t['food_log_days']} days). Log before you eat, not after. Breakfast first."
    if "Steps" in missed:
        gap = t["steps"] - (w["steps"] or 0)
        return f"You were {gap:,.0f} steps a day short. That is a 20-minute walk after dinner. Put it in the calendar for every weekday."
    if "Hard sessions" in missed:
        return "You skipped intensity. Tuesday's intervals are the first thing in the week. Pack the gym bag Monday night."
    if "Weigh-ins" in missed:
        return "Weigh-ins are the cheapest habit in this plan. Scale goes next to the toothbrush."
    if not missed:
        return "Clean week. Repeat it exactly. Boring and consistent is how 78 kg happens."
    return f"Fix {missed[0].lower()} this week. Everything else stays."


def write_dashboard(out_dir, data):
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "daily.json").write_text(json.dumps([{k: r.get(k) for k in DAILY_COLUMNS} for r in data["days"]]))
    (out_dir / "activities.json").write_text(json.dumps([{k: a[k] for k in ACTIVITY_COLUMNS} for a in data["activities"]]))
    (out_dir / "weights.json").write_text(json.dumps(data["weights"]))
    (out_dir / "plan.json").write_text(json.dumps(plan_rows()))
    fa = data["fitness"] or {}
    comp = fa.get("components") or {}
    r1 = lambda v: round(v, 1) if isinstance(v, (int, float)) else None
    (out_dir / "profile.json").write_text(json.dumps([{
        "as_of": data["days"][-1]["date"],
        "chronological_age": fa.get("chronologicalAge"),
        "fitness_age": r1(fa.get("fitnessAge")),
        "achievable_fitness_age": r1(fa.get("achievableFitnessAge")),
        "vigorous_minutes_avg": (comp.get("vigorousMinutesAvg") or {}).get("value"),
        "vigorous_days_avg": (comp.get("vigorousDaysAvg") or {}).get("value"),
        "bmi": (comp.get("bmi") or {}).get("value"),
        "bmi_target": (comp.get("bmi") or {}).get("targetValue"),
        "goal_kg": PLAN["goal_kg"],
    }]))


def main():
    parser = argparse.ArgumentParser(description="Weekly Garmin coaching review.")
    parser.add_argument("--end", type=date.fromisoformat, default=yesterday(), help="last day of the week (default: yesterday)")
    parser.add_argument("--history", type=int, default=90, help="days to pull (at least 42; default 90)")
    parser.add_argument("--dashboard", type=Path, help="also write dashboard data files to this folder")
    args = parser.parse_args()

    data = fetch(args.end - timedelta(days=max(args.history, 42) - 1), args.end, with_profile=True)
    OUTPUT_DIR.mkdir(exist_ok=True)
    email = build_email(data, args.end)
    (OUTPUT_DIR / "checkin.txt").write_text(email)
    print(email)
    if args.dashboard:
        write_dashboard(args.dashboard, data)
        print(f"wrote dashboard files to {args.dashboard}")


if __name__ == "__main__":
    main()
