# Coaching playbook: 78 kg by March 14, 2027

Coach: Claude. Athlete: Jorge. Data: Garmin, every day.

## The goal
- **78 kg by Sunday, March 14, 2027.** Latest Wyze reading: 87.3 kg (Nov 1, taken after food). Waist 99 cm, target under 89.
- Pace needed: about 0.5 kg a week, matching the Diet Coach Log's 0.6% a week.
- **Food is run by the Diet Coach Log:** 2,350 kcal, 160 g protein, 32 g fiber, with its plateau rule. This playbook runs movement, training and recovery.
- Garmin says you burn about 2,360 kcal a day. That puts 2,350 close to maintenance, which fits 0.3 kg lost in 2 weeks. The extra deficit comes from movement first.

## Why this plan (from your last 90 days)
1. Steps fell from 9,900 a day (Aug) to about 4,600 (now). Movement is the biggest lever and it is sliding.
2. 74 workouts, zero hard ones. Every session was "recovery" or "aerobic base". Fitness age is stuck at 33.9 because of it.
3. Workout days average 8,700 steps. Rest days, 6,200. Rest days are the problem.
4. Thursday is your weakest day (5,900). 6 PM is when you actually train.
5. Sleep is already strong (8 h). It is not the bottleneck. Protect it.

## Phases
Step targets include bike credit: each bike minute counts as 100 steps.

| Phase | Dates | Steps/day | Hard sessions | Vigorous min/wk |
|---|---|---|---|---|
| Setup | Nov 4 to 8 | 6,000 | 0 | 0 |
| Rebuild | Nov 9 to 29 (wk 1 to 3) | 6,500 | 1 | 30 |
| Build | Nov 30 to Jan 10 (wk 4 to 9) | 7,500 | 2 | 60 |
| Push | Jan 11 to Mar 14 (wk 10 to 18) | 8,500 | 2 | 75 |

## Your week (winter: stationary bike first)
| Day | Session | Weigh in |
|---|---|---|
| Mon | Strength, 40 min | Yes, 6:48 AM |
| Tue | **HARD:** bike intervals, 6 PM | |
| Wed | Easy bike 30 min, or walk if dry | Yes, 6:48 AM |
| Thu | Easy bike 30 min at lunch + strength (fixes your low day) | |
| Fri | Easy bike 30 min, or walk if dry | Yes, 6:48 AM |
| Sat | **HARD:** bike intervals (from Build) | |
| Sun | Long walk if dry, else easy bike 45 min | Yes, 7:48 AM + waist |

Bike intervals grow by phase. Hard means 8/10 effort, high resistance, breathing too hard to talk:
- Rebuild Tue: 10 min easy, 6 x 1 min hard with 2 min easy, 5 min cool-down.
- Build Tue: 6 x 2 min hard, 2 min easy. Build Sat: 4 x 4 min hard, 3 min easy.
- Push Tue: 8 x 2 min hard, 90 s easy. Push Sat: 5 x 4 min hard, 3 min easy, 10 min steady.

Record every bike session on the watch as Indoor Cycling so it counts.

## Rules
1. Weigh in on the Wyze scale after the bathroom, before food, water or coffee. Afternoon readings do not count.
2. Calories, protein and the plateau call follow the Diet Coach Log.
3. Bike counts: 100 steps per minute toward the daily target.
4. Behind pace at 3 PM: 20 to 30 min easy bike after dinner. No debate.
5. Readiness red (HRV low, sleep under 6 h, or body battery peak under 50): swap the hard session for easy, move it to tomorrow.
6. Never miss twice.

## Accountability loop
| When | What you get | Script |
|---|---|---|
| Daily 6:13 AM | Readiness (green, yellow, red) and today's assignment | `coach.py morning` |
| Daily 3:37 PM | Step pace: on pace, or exactly how many minutes to walk | `coach.py pace` |
| Monday 5:43 AM | Score, weight trend against the deadline, calories, next week's schedule | `checkin.py` |

All times Mountain (Garmin's timezone for your account). Targets live in `coach_plan.json`.
