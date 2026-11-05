"""Shared coaching math: weekly stats, weight trend, calorie calibration."""

import statistics
from datetime import date, timedelta

KCAL_PER_KG = 7700


def nums(rows, key):
    return [r[key] for r in rows if isinstance(r.get(key), (int, float))]


def mean(rows, key):
    v = nums(rows, key)
    return statistics.mean(v) if v else None


STRENGTH_TYPES = ("strength_training", "hiit")


def galpin_floor(rows, acts):
    """Galpin's 5-4-3-2-1 minimum week: active 5, structured 4, sweat 3, strength 2, high heart rate 1."""
    days = {r["date"] for r in rows}
    act_days = {a["date"] for a in acts if a["date"] in days}
    strength_days = {a["date"] for a in acts if a["date"] in days and a["type"] in STRENGTH_TYPES}
    sweat = sum(1 for r in rows if (r.get("intensity_moderate") or 0) + (r.get("intensity_vigorous") or 0) >= 20)
    high = sum(1 for r in rows if (r.get("intensity_vigorous") or 0) >= 5)
    active = sum(1 for r in rows if (r.get("move_steps") or 0) >= 6000 or r["date"] in act_days)
    checks = [("active", active, 5), ("structured", len(act_days), 4), ("sweat", sweat, 3),
              ("strength", len(strength_days), 2), ("high HR", high, 1)]
    return checks, sum(1 for _, got, need in checks if got >= need)


def week_stats(rows, t):
    full = [r for r in rows if r.get("move_steps") is not None]
    hard = sum(1 for r in rows if (r.get("intensity_vigorous") or 0) >= 10)
    return {
        "days": len(full),
        "steps": mean(full, "move_steps"),
        "raw_steps": mean(full, "steps"),
        "bike_min": sum(nums(rows, "bike_minutes")),
        "floor_days": sum(1 for r in full if r["move_steps"] >= t["steps"]),
        "active_cal": mean(full, "active_calories"),
        "total_cal": mean(full, "total_calories"),
        "vigorous": sum(nums(rows, "intensity_vigorous")),
        "aerobic": sum(nums(rows, "intensity_moderate")) + sum(nums(rows, "intensity_vigorous")),
        "hard_sessions": hard,
        "workouts": sum(nums(rows, "activity_count")),
        "workout_min": sum(nums(rows, "activity_minutes")),
        "sleep": mean(rows, "sleep_hours"),
        "sleep_nights": len(nums(rows, "sleep_hours")),
        "sleep_ok": sum(1 for v in nums(rows, "sleep_hours") if v >= t["sleep"]),
        "hrv": mean(rows, "hrv"),
        "rhr": mean(full, "resting_hr"),
        "weigh_ins": len(nums(rows, "weight_kg")),
        "food_days": len(nums(rows, "calories_in")),
        "intake": mean(rows, "calories_in"),
    }


def slope(points):
    """Least-squares kg per day from [(date, kg)], or None."""
    if len(points) < 4 or (points[-1][0] - points[0][0]).days < 7:
        return None
    xs = [(p[0] - points[0][0]).days for p in points]
    ys = [p[1] for p in points]
    mx, my = statistics.mean(xs), statistics.mean(ys)
    den = sum((x - mx) ** 2 for x in xs)
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / den if den else None


def weight_trend(weights, end, goal_kg, plan_end):
    """Latest weight, 21-day slope, projected goal date and the rate the deadline needs."""
    pts = [(date.fromisoformat(w["date"]), w["weight_kg"]) for w in weights if w.get("weight_kg")]
    if not pts:
        return None
    latest_day, latest = pts[-1]
    recent = [p for p in pts if p[0] >= end - timedelta(days=20)]
    recent_avg = statistics.mean(p[1] for p in recent[-7:]) if recent else latest
    s = slope(recent)
    weeks_left = max(1, (plan_end - end).days / 7)
    out = {
        "latest": latest,
        "latest_day": latest_day,
        "days_old": (end - latest_day).days,
        "trend_kg": recent_avg,
        "kg_per_week": s * 7 if s is not None else None,
        "to_goal": recent_avg - goal_kg,
        "needed_per_week": (recent_avg - goal_kg) / weeks_left,
        "projected": None,
    }
    if s is not None and s < 0:
        out["projected"] = end + timedelta(days=int((recent_avg - goal_kg) / -s))
    return out


def calibrate(days, trend):
    """Real daily burn from intake and weight change, once there is enough of both."""
    recent = days[-21:]
    intake_days = nums(recent, "calories_in")
    if len(intake_days) < 10 or not trend or trend["kg_per_week"] is None:
        return None
    intake = statistics.mean(intake_days)
    burn = intake - (trend["kg_per_week"] / 7) * KCAL_PER_KG
    return {"intake": intake, "burn": burn, "target": max(1600, round((burn - 550) / 50) * 50), "days": len(intake_days)}
