import type { ScriptTag } from "./types";

/**
 * Built-in rehearsal scripts for when there is no AI key. "Generate scenario"
 * falls back to searching these by keyword.
 */

export interface BuiltInScenario {
  title: string;
  tag: Exclude<ScriptTag, "drill">;
  keywords: string[];
  script: string;
}

export const SCENARIOS: BuiltInScenario[] = [
  {
    title: "Pushing back on a deadline with a VP",
    tag: "difficult conversation",
    keywords: ["push", "back", "deadline", "vp", "executive", "timeline", "date", "delay", "late", "scope", "boss"],
    script: "Thank you for making time. I want to be direct about the timeline. With the current scope, hitting the fifteenth means skipping the final round of testing, and I do not think that is a risk we should take with this client. I see two options. We move the date by two weeks and ship everything, or we keep the date and ship a smaller version first. I recommend the second option. Which matters more to you, the date or the full scope?",
  },
  {
    title: "Asking for a raise",
    tag: "difficult conversation",
    keywords: ["raise", "salary", "pay", "compensation", "promotion", "money", "negotiate", "review"],
    script: "I would like to talk about my compensation. Over the past year I have taken on the vendor program, delivered three launches on time, and reduced our review cycle by a third. My responsibilities have grown well beyond my current level. Based on that, and on what the market pays for this role, I am asking for an adjustment of twelve percent. I value working here and I want to keep growing with this team. What would you need from me to make this happen?",
  },
  {
    title: "Giving difficult feedback to a colleague",
    tag: "difficult conversation",
    keywords: ["feedback", "colleague", "report", "performance", "criticism", "difficult", "team", "member", "behavior"],
    script: "I want to share something with you because I value working together. In the last three reviews, the reports arrived after the deadline, and the team had to move their own work to cover it. I know your workload is heavy. Even so, the delays affect everyone. I would like to understand what is getting in the way, and agree on a plan that works for both of us. What would help you deliver on time?",
  },
  {
    title: "Saying no to extra work",
    tag: "difficult conversation",
    keywords: ["no", "decline", "refuse", "extra", "workload", "capacity", "busy", "request", "priorities", "overloaded"],
    script: "Thank you for thinking of me for this. I want to give you an honest answer. My plate is full with the audit and the launch, and both are due this month. If I take this on, one of them will slip. I can start in three weeks, or I can hand one of my current projects to someone else. Which would you prefer? I would rather tell you now than disappoint you later.",
  },
  {
    title: "Delivering bad news to a client",
    tag: "difficult conversation",
    keywords: ["bad", "news", "client", "customer", "problem", "issue", "mistake", "apologize", "outage", "delay", "error"],
    script: "I am calling with an update you will not like, and I wanted you to hear it from me first. We found an error in the data we delivered on Tuesday. It affects the third section of the report. This was our mistake. We have already corrected the figures, and you will have the revised version by Thursday morning. I am sorry for the trouble. I will also send you a short note on what went wrong and how we are preventing it.",
  },
  {
    title: "Weekly project status update",
    tag: "meeting",
    keywords: ["status", "update", "weekly", "standup", "project", "progress", "report", "team", "meeting"],
    script: "Here is a quick update from my side. This week we finished the vendor evaluation and shortlisted three providers. The best option is thirty percent cheaper, but it needs a longer setup. Next week we begin the security review. The main risk is the legal sign off, which is still open. I need a decision on the provider by Thursday so we can keep the launch date. That is everything from me. Any questions?",
  },
  {
    title: "Disagreeing in a meeting",
    tag: "meeting",
    keywords: ["disagree", "meeting", "opinion", "challenge", "idea", "concern", "objection", "different", "view"],
    script: "I see this differently, and I would like to explain why. The proposal assumes that our users will change their habits within a month. Our own data shows that it usually takes three. If we plan for one month, we will miss the target and lose the trust of the leadership team. I suggest we run a small test first, with one region, and decide based on the results. Would that work for everyone?",
  },
  {
    title: "Introducing yourself to a new team",
    tag: "meeting",
    keywords: ["introduce", "introduction", "myself", "new", "team", "first", "day", "hello", "background", "onboarding"],
    script: "Good morning, everyone. I am very happy to join this team. I have spent the last eight years working on energy and efficiency projects, mostly with public agencies and small businesses. I enjoy turning complicated programs into simple steps that people can actually follow. In my first weeks I would like to listen, learn how you work, and find where I can be useful. Please reach out any time. I look forward to working with each of you.",
  },
  {
    title: "Opening a presentation",
    tag: "presentation",
    keywords: ["presentation", "opening", "open", "start", "intro", "talk", "pitch", "slides", "audience", "agenda"],
    script: "Thank you all for being here. Over the next ten minutes, I will walk you through three things. First, what we learned this quarter. Second, where the numbers surprised us. And third, what we think we should do next. Please hold your questions until the end. I have left time for them. Let us start with the results.",
  },
  {
    title: "Presenting results and a recommendation",
    tag: "presentation",
    keywords: ["results", "recommendation", "findings", "numbers", "data", "quarter", "proposal", "budget", "present", "recommend"],
    script: "Let me summarize what the data shows. Revenue grew eleven percent, which is above our target. However, the cost of serving each customer also went up, mostly because of support. If nothing changes, our margin will shrink next year. My recommendation is to invest in the self service tools now. It costs less than hiring, and it pays for itself in about seven months. I would like your approval to start this quarter.",
  },
  {
    title: "Answering a tough question",
    tag: "presentation",
    keywords: ["question", "answer", "tough", "hard", "qa", "challenge", "know", "unsure", "handle"],
    script: "That is a fair question, and I want to answer it properly. The short answer is that we do not have enough data yet. What we know is that the first three clients saw results within six weeks. What we do not know is whether that holds for larger companies. I would rather tell you that than guess. I will have the full numbers by the end of the month, and I will share them with this group.",
  },
  {
    title: "Replying to an urgent request",
    tag: "Slack reply",
    keywords: ["slack", "reply", "message", "urgent", "request", "quick", "chat", "respond", "ping", "email"],
    script: "Thanks for flagging this. I looked into it and the issue is on our side. The export job failed last night, so the dashboard is showing yesterday's figures. I have restarted it and the numbers should be correct within the hour. I will confirm here as soon as it is done. If you need the figures before then, I can send them to you directly.",
  },
];

function tokens(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);
}

/** Built-in scenarios ranked by keyword overlap with the prompt. Best first. Empty if nothing matches. */
export function matchScenarios(prompt: string, max = 3): BuiltInScenario[] {
  const words = new Set(tokens(prompt));
  return SCENARIOS.map((scenario) => {
    const titleWords = new Set(tokens(scenario.title));
    let score = 0;
    for (const w of words) {
      if (scenario.keywords.includes(w)) score += 2;
      else if (titleWords.has(w) || tokens(scenario.tag).includes(w)) score += 1;
    }
    return { scenario, score };
  })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((m) => m.scenario);
}
