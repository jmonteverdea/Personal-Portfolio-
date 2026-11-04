# Coaching playbook: 78 kg by March 14, 2027

Coach: Claude. Athlete: Jorge. Data: Garmin, every day.

## The goal
- **78 kg by Sunday, March 14, 2027.** Last weigh-in on record: 86.6 kg (Nov 2025). The real start is your first weigh-in this week.
- Pace needed: about 0.5 kg a week, which is a deficit of about 550 kcal a day.
- Garmin says you burn about 2,380 kcal a day. Starting target: **1,900 kcal, 160 g protein.** Recalibrated in week 3 from your real data.

## Why this plan (from your last 90 days)
1. Steps fell from 9,900 a day (Aug) to about 4,600 (now). Movement is the biggest lever and it is sliding.
2. 74 workouts, zero hard ones. Every session was "recovery" or "aerobic base". Fitness age is stuck at 33.9 because of it.
3. Workout days average 8,700 steps. Rest days, 6,200. Rest days are the problem.
4. Thursday is your weakest day (5,900). 6 PM is when you actually train.
5. Sleep is already strong (8 h). It is not the bottleneck. Protect it.

## Phases
| Phase | Dates | Steps/day | Hard sessions | Vigorous min/wk | Weigh-ins/wk | Food log |
|---|---|---|---|---|---|---|
| Setup | Nov 4 to 8 | 6,000 | 0 | 0 | 3 | 3 days |
| Rebuild | Nov 9 to 29 (wk 1 to 3) | 6,500 | 1 | 30 | 5 | Every day |
| Build | Nov 30 to Jan 10 (wk 4 to 9) | 7,500 | 2 | 60 | 3 | 5 days |
| Push | Jan 11 to Mar 14 (wk 10 to 18) | 8,500 | 2 | 75 | 3 | 5 days |

## Your week
| Day | Session | Weigh in |
|---|---|---|
| Mon | Strength, 40 min | Yes |
| Tue | **HARD:** treadmill intervals, 6 PM | Rebuild only |
| Wed | Walk 30 to 45 min | Yes |
| Thu | Lunch walk 30 min + strength (fixes your low day) | Rebuild only |
| Fri | Easy run or walk | Yes |
| Sat | **HARD:** bike intervals (from Build) | Rebuild only |
| Sun | Long walk or hike outside, 60 min+ | Rebuild only |

Intervals grow by phase:
- Rebuild Tue: 10 min easy, 6 x 1 min hard (8/10) with 2 min easy, 5 min cool-down.
- Build Tue: 6 x 2 min hard, 2 min easy. Build Sat: bike 4 x 4 min hard, 3 min easy.
- Push Tue: 8 x 2 min hard, 90 s easy. Push Sat: bike 5 x 4 min hard, 3 min easy, 10 min steady.

## Rules
1. Weigh in after the bathroom, before food or water.
2. During Rebuild, log every bite in MyFitnessPal, linked to Garmin Connect.
3. Protein first: 160 g a day.
4. Behind step pace at 3 PM: walk after dinner. No debate.
5. Readiness red (HRV low, sleep under 6 h, or body battery peak under 50): swap the hard session for easy, move it to tomorrow.
6. Never miss twice.

## Accountability loop
| When | What you get | Script |
|---|---|---|
| Daily 6:13 AM | Readiness (green, yellow, red) and today's assignment | `coach.py morning` |
| Daily 3:37 PM | Step pace: on pace, or exactly how many minutes to walk | `coach.py pace` |
| Monday 5:43 AM | Score, weight trend against the deadline, calories, next week's schedule | `checkin.py` |
| Week 3 | Calorie target recalibrated from intake and weight change | automatic in `checkin.py` |

All times Mountain (Garmin's timezone for your account). Targets live in `coach_plan.json`.
