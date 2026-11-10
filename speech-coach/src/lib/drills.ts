/**
 * Built-in drill scripts for the sounds Spanish speakers most often miss.
 * Used when no Anthropic key is set, so "Drill this sound" still works.
 */

export interface BuiltInDrill {
  title: string;
  script: string;
}

const DRILLS: Record<string, BuiltInDrill> = {
  v: {
    title: "Drill /v/: very, vendor, review",
    script:
      "Berry, very. Ban, van. Best, vest. Boat, vote. We have a very valuable vendor review to deliver. I value every view, and I have given the vice president seven versions. Please verify the invoice and move the event to Vancouver. Five of us will arrive at seven.",
  },
  b: {
    title: "Drill /b/ against /v/",
    script:
      "Vest, best. Vote, boat. Van, ban. The best vendor built a better budget. Both boards believe the beta is stable, but verify the backup before the vote. Bob will be available by November.",
  },
  θ: {
    title: "Drill /θ/: think, three, month",
    script:
      "Tree, three. Tank, thank. Tin, thin. Boat, both. I think three things are worth our thought this month. Thank you both for the thorough math. The third theme needs thirty thousand, and I think the growth is healthy.",
  },
  ð: {
    title: "Drill /ð/: this, the, other",
    script:
      "Day, they. Dough, though. Den, then. This is the other option, and that is the one they prefer. Rather than gather them together, let the others breathe. These are their numbers, and those are from the other team.",
  },
  ɪ: {
    title: "Drill short /ɪ/: ship, this, finish",
    script:
      "Sheep, ship. Leave, live. Feel, fill. Seat, sit. We shipped it this week. The list is still with him, and I think it is finished. Will Kim fix the bill in the system? It is a big win if this sticks.",
  },
  i: {
    title: "Drill long /i/: week, team, need",
    script:
      "Ship, sheep. Live, leave. Fill, feel. Sit, seat. We need the team to meet each week. Please keep me in the email and leave three seats free. He agreed to read each key piece before we speak.",
  },
  z: {
    title: "Drill /z/: is, positive, reasons",
    script:
      "Sue, zoo. Price, prize. Ice, eyes. Bus, buzz. The results are positive, and these numbers raise zero concerns. His reasons are easy to organize. The design is his, the visuals are ours, and it was a busy season.",
  },
  ʃ: {
    title: "Drill /ʃ/: ship, share, launch",
    script:
      "Chip, ship. Chair, share. Watch, wash. Catch, cash. She will share the schedule and ship the solution. I wish to push the launch, so we should show the shareholders a short action list. The cash position is sure.",
  },
  tʃ: {
    title: "Drill /tʃ/: check, each, launch",
    script:
      "Ship, chip. Share, chair. Wash, watch. Cash, catch. Check each chart before the launch. Which change did the teacher choose? We reached the target in March, and each branch will catch up by lunch.",
  },
  dʒ: {
    title: "Drill /dʒ/: project, budget, manage",
    script:
      "Yet, jet. Year, jeer. Yes, Jess. Use, juice. The project budget is just large enough. Jane will manage the major changes in June. I suggest we judge each stage, adjust the schedule, and join the general meeting.",
  },
  j: {
    title: "Drill /j/: yes, year, you",
    script:
      "Jet, yet. Jess, yes. Jeer, year. Juice, use. Yes, you can use it this year. Yesterday your unit used a unique yellow label. Have you reviewed the yearly figures yet? The usual young users value it.",
  },
  ŋ: {
    title: "Drill /ŋ/: meeting, testing, long",
    script:
      "Thin, thing. Win, wing. Ran, rang. Sun, sung. The meeting is running long. We are testing, tracking and reporting everything this spring. Bring the pricing along, and keep working on the wrong thing no longer.",
  },
  ʊ: {
    title: "Drill /ʊ/: would, good, look",
    script:
      "Luke, look. Pool, pull. Fool, full. Suit, soot. I would look at the full book. It is good that we could push the wood supplier. Should we put it in? I took a good look and it stood up well.",
  },
  æ: {
    title: "Drill /æ/: plan, back, feedback",
    script:
      "Men, man. Pen, pan. Bed, bad. Said, sad. The plan is back on track. Thanks for the feedback on the app. That gap in the data had an actual impact, and Sam can add the last batch on Saturday.",
  },
  ʌ: {
    title: "Drill /ʌ/: update, budget, month",
    script:
      "Cop, cup. Boss, bus. Lock, luck. Not, nut. One update on the budget this month: the number is up. Some of us must come on Monday. It was tough, but the result is enough, and nothing is stuck.",
  },
  h: {
    title: "Drill /h/: have, help, hire",
    script:
      "Air, hair. Eat, heat. Old, hold. Ear, hear. I am happy to help him hire here. We have to hold the whole meeting at headquarters. He hopes the handoff happens in half an hour. How hard is it?",
  },
  t: {
    title: "Drill final /t/: date, shipped, fact",
    script:
      "Day, date. Ship, shipped. Fax, fact. Play, plate. We shipped it last night. The start date is set, and the client asked about the cost. I checked the list, fixed the fault, and sent the draft at eight.",
  },
  d: {
    title: "Drill final /d/: would, need, signed",
    script:
      "Knee, need. Why, wide. Sign, signed. Row, road. We would need a signed bid by the end of the period. I called and confirmed. The board agreed that the old code should be removed, and the team delivered.",
  },
  k: {
    title: "Drill final /k/: feedback, week, risk",
    script:
      "Bay, bake. We, week. See, seek. Bag, back. The feedback this week was quick. Take a look at the risk and check the link. I think the task took a week of work. Mark will speak after the break.",
  },
  r: {
    title: "Drill English /r/: review, report, right",
    script:
      "Light, right. Lead, read. Load, road. Glass, grass. The review report is ready. Our three priorities are revenue, retention and reach. Rarely rush the release. Read the right version, and reply before Friday morning.",
  },
};

/** Azure reports r-colored vowels under their own symbols. */
const ALIASES: Record<string, string> = { ɹ: "r", ɚ: "r", ɝ: "r" };

export function builtInDrill(phoneme: string): BuiltInDrill | null {
  const key = phoneme.replace(/[/\s]/g, "");
  return DRILLS[key] ?? DRILLS[ALIASES[key] ?? ""] ?? null;
}
