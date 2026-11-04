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
         f"{fmt(this['steps'])} a day with bike credit ({fmt(this['raw_steps'])} walked + {this['bike_min']:.0f} bike min), "
         f"target {t['steps']:,}{delta(this['steps'], prev['steps'])}. {this['floor_days']} of {this['days']} days on target."),

        ("Weigh-ins", None, "Tracked on the Wyze scale and in the Diet Coach Log."),
        ("Hard sessions", this["hard_sessions"] >= t["hard_sessions"],
         f"{this['hard_sessions']} of {t['hard_sessions']}. {this['vigorous']:.0f} vigorous min (target {t['vigorous']})."),
        ("Sleep", (this["sleep"] or 0) >= t["sleep"], f"{fmt(this['sleep'], 1, ' h')} a night{delta(this['sleep'], prev['sleep'], 1, ' h')}."),
    ]
    if t["hard_sessions"] == 0:
        checks = [c for c in checks if c[0] != "Hard sessions"]
    checks = [c for c in checks if c[1] is not None]
    hit = sum(1 for c in checks if c[1])

    wk = week_number(end)
    head = f"Week {wk} of {total_weeks()}" if wk else "Setup week"
    lines = [
        f"Coach: {head} scored {hit}/{len(checks)}. {fmt(this['steps'])} steps a day, {this['hard_sessions']} hard sessions",
        "",
        f"{head} · {phase['name']} phase · {start:%a %b %-d} to {end:%a %b %-d}",
        "",
        f"SCORE {hit}/{len(checks)}",
    ]
    lines += [f"{'OK  ' if ok else 'MISS'}  {name}: {text}" for name, ok, text in checks]

    lines += ["", "WEIGHT"]
    if not trend or trend["days_old"] > 14:
        lines.append("Weight lives on your Wyze scale and in the Diet Coach Log, not in Garmin. "
                     "Reply with this week's Mon, Wed, Fri, Sun morning readings and waist.")
    else:
        lines.append(f"Trend {trend['trend_kg']:.1f} kg, {trend['to_goal']:.1f} kg to {goal:.0f} kg by {plan_end:%b %-d}.")
        lines.append(f"Needed: {trend['needed_per_week']:.2f} kg a week.")
        if trend["kg_per_week"] is not None:
            on_track = trend["projected"] and trend["projected"] <= plan_end
            proj = f"projected {trend['projected']:%b %-d, %Y}" if trend["projected"] else "not losing yet"
            lines.append(f"Actual: {trend['kg_per_week']:+.2f} kg a week, {proj}. {'On track.' if on_track else 'Behind the deadline.'}")

    lines += ["", "CALORIES"]
    lines.append(f"Diet Coach Log targets: {PLAN['calories_start']:,} kcal, {PLAN['protein_g']} g protein, {PLAN.get('fiber_g', 32)} g fiber.")
    lines.append(f"Garmin says you burned {fmt(this['total_cal'])} a day this week, "
                 f"so the plan's gap is about {fmt((this['total_cal'] or 0) - PLAN['calories_start'])} kcal a day.")
    if cal:
        lines.append(f"Calibrated from {cal['days']} logged days: you burn about {cal['burn']:,.0f} kcal a day.")

    lines += ["", "COACH'S CALL", coach_call(this, t, trend, checks)]

    nxt = end + timedelta(days=1)
    nt = targets_for(nxt)
    lines += ["", f"NEXT WEEK: {phase_for(nxt)['name']} · {nt['steps']:,} steps a day (bike counts) · "
              f"{nt['hard_sessions']} hard sessions · weigh in Mon, Wed, Fri, Sun"]
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
    if "Steps" in missed:
        gap = t["steps"] - (w["steps"] or 0)
        return f"You were {gap:,.0f} steps a day short. That is {max(10, round(gap / 100 / 5) * 5)} min of easy bike a day. After dinner, every weekday."
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
    parser.add_argument("--manual", type=Path, help="JSON list of {date, weight_kg} readings from the Wyze scale")
    args = parser.parse_args()

    data = fetch(args.end - timedelta(days=max(args.history, 42) - 1), args.end, with_profile=True)
    if args.manual and args.manual.exists():
        extra = [w for w in json.loads(args.manual.read_text()) if w.get("weight_kg")]
        merged = {w["date"]: w for w in data["weights"]}
        merged.update({w["date"]: {"date": w["date"], "weight_kg": float(w["weight_kg"])} for w in extra})
        data["weights"] = [merged[d] for d in sorted(merged)]
    OUTPUT_DIR.mkdir(exist_ok=True)
    email = build_email(data, args.end)
    (OUTPUT_DIR / "checkin.txt").write_text(email)
    print(email)
    if args.dashboard:
        write_dashboard(args.dashboard, data)
        print(f"wrote dashboard files to {args.dashboard}")


if __name__ == "__main__":
    main()
