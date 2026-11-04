"""Daily coaching touchpoints.

  python coach.py morning   readiness call and today's assignment
  python coach.py pace      afternoon step-pace check

Each writes output/coach_<mode>.txt (subject on the first line) and prints it.
"""

import argparse
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from garmin_data import fetch
from plan import PLAN, phase_for, session_for, targets_for, total_weeks, week_number

OUTPUT_DIR = Path(__file__).parent / "output"
TZ = ZoneInfo("America/Denver")  # Garmin's day boundary for this account
WAKE, BED = 7, 21  # hours that count for step pace


def readiness(row):
    """Green, yellow or red from last night's HRV status, sleep and body battery."""
    status = (row.get("hrv_status") or "").upper()
    sleep = row.get("sleep_hours")
    bb = row.get("body_battery_max")
    reasons = []
    if status in ("LOW", "POOR"):
        reasons.append(f"HRV {status.lower()}")
    if sleep is not None and sleep < 6:
        reasons.append(f"only {sleep:.1f} h sleep")
    if bb is not None and bb < 50:
        reasons.append(f"body battery peaked at {bb}")
    if reasons:
        return "RED", reasons
    if status == "UNBALANCED":
        reasons.append("HRV unbalanced")
    if sleep is not None and sleep < 7:
        reasons.append(f"{sleep:.1f} h sleep")
    if bb is not None and bb < 65:
        reasons.append(f"body battery {bb}")
    return ("YELLOW", reasons) if reasons else ("GREEN", [])


def morning(today):
    data = fetch(today - timedelta(days=1), today)
    yday, now = data["days"][0], data["days"][1]
    t, phase, s = targets_for(today), phase_for(today), session_for(today)
    level, why = readiness(now)
    wk = week_number(today)
    head = f"Week {wk} of {total_weeks()}" if wk else "Setup week"

    session = s["session"]
    if s.get("hard") and level == "RED":
        session = f"SWAP: easy 30 min instead of intervals ({', '.join(why)}). Intervals move to tomorrow."
    elif s.get("hard") and level == "YELLOW":
        session = f"{session}. Readiness is yellow: do it, but cut one interval if it feels wrong."

    hrv = f"HRV {now['hrv']} ({(now.get('hrv_status') or 'n/a').lower()})" if now.get("hrv") else "HRV n/a"
    sleep = f"slept {now['sleep_hours']:.1f} h" if now.get("sleep_hours") else "no sleep data"
    bb = f"body battery {now['body_battery_max']}" if now.get("body_battery_max") else "body battery n/a"
    y_steps = yday.get("move_steps")
    y_ok = y_steps is not None and y_steps >= targets_for(today - timedelta(days=1))["steps"]

    lines = [
        f"{level} · {today:%a %b %-d}: {s['session']}" + (" · weigh in" if s["weigh_in"] else ""),
        "",
        f"{head} · {phase['name']}",
        f"Readiness {level}: {hrv}, {sleep}, {bb}.",
        "",
        f"TODAY: {session}",
    ]
    if s.get("hard") and level != "RED" and s.get("detail"):
        lines.append(s["detail"])
    if s["weigh_in"]:
        lines.append("Weigh in now on the Wyze scale: after the bathroom, before food, water or coffee." + (" Measure your waist." if today.weekday() == 6 else ""))
    lines.append(f"Steps target {t['steps']:,} (bike minutes count x100). Food: {PLAN['calories_start']:,} kcal, {PLAN['protein_g']} g protein, per the Diet Coach Log.")
    lines += [
        "",
        f"Yesterday: {y_steps:,} steps with bike credit ({'hit' if y_ok else 'missed'})" if y_steps is not None else "Yesterday: no step data",
    ]
    if yday.get("activities"):
        lines[-1] += f", {yday['activities']}"
    if yday.get("calories_in"):
        lines[-1] += f", {yday['calories_in']:,.0f} kcal logged"
    lines[-1] += "."
    return "\n".join(lines) + "\n"


def pace(now):
    today = now.date()
    row = fetch(today, today)["days"][0]
    t = targets_for(today)["steps"]
    steps = row.get("move_steps") or 0
    bike = row.get("bike_minutes") or 0
    frac = min(1, max(0, (now.hour + now.minute / 60 - WAKE) / (BED - WAKE)))
    expected = int(t * frac)
    gap = t - steps
    if steps >= expected * 0.9:
        subject = f"On pace: {steps:,} of {t:,} steps"
        body = f"{steps:,} steps by {now:%-I:%M %p} ({bike:.0f} bike min counted). Pace needs {expected:,}. Keep moving and you land it."
    else:
        mins = max(10, round(gap / 100 / 5) * 5)  # a bike minute counts as 100 steps
        subject = f"Behind: {steps:,} of {t:,} steps. Bike {mins} min tonight"
        body = (f"{steps:,} steps by {now:%-I:%M %p} ({bike:.0f} bike min counted). Pace needs {expected:,}. You are {gap:,} short of {t:,}.\n"
                f"Fix: {mins} min easy on the bike before {BED - 12} PM, or split it with a walk if it is dry. Never miss twice.")
    return f"{subject}\n\n{body}\n"


def main():
    parser = argparse.ArgumentParser(description="Daily coaching touchpoints.")
    parser.add_argument("mode", choices=["morning", "pace"])
    args = parser.parse_args()
    now = datetime.now(TZ)
    text = morning(now.date()) if args.mode == "morning" else pace(now)
    OUTPUT_DIR.mkdir(exist_ok=True)
    (OUTPUT_DIR / f"coach_{args.mode}.txt").write_text(text)
    print(text)


if __name__ == "__main__":
    main()
