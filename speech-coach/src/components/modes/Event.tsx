"use client";

import Link from "next/link";
import { useState } from "react";
import { useAtlas } from "@/hooks/useAtlas";
import { dayKey, daysBetween } from "@/lib/learning/types";
import { describeCountdown, MAX_PLAN_DAYS, PACE_TARGET, type EventDay, type EventTask } from "@/lib/modes/event";
import { modes } from "@/lib/modes/store";
import type { SpeakingEvent } from "@/lib/modes/types";
import { useEventPlan } from "@/lib/modes/useEventPlan";
import { newId, useStore } from "@/lib/store";
import { Button, formatDay, Label, Loading, Note, PageHeader, Plate } from "../ds/ui";

function taskHref(task: EventTask, event: SpeakingEvent): string {
  if (task.kind === "words") return `/words/review?event=${encodeURIComponent(event.id)}`;
  if (task.kind === "shadow") return `/shadow?script=${encodeURIComponent(event.scriptId)}`;
  return `/practice?script=${encodeURIComponent(event.scriptId)}`;
}

const KIND_LABEL: Record<EventTask["kind"], string> = { read: "Read", words: "Words", shadow: "Shadow", run: "Run-through" };

function Tasks({ day, event }: { day: EventDay; event: SpeakingEvent }) {
  return (
    <ul className="divide-y divide-rule border-y border-rule">
      {day.tasks.map((task) => {
        const done = event.done.includes(task.id);
        return (
          <li key={task.id} className="flex items-start gap-4 py-4">
            <button
              type="button"
              role="checkbox"
              aria-checked={done}
              aria-label={`${task.title}: ${done ? "done" : "not done"}`}
              onClick={() => modes.toggleEventTask(event.id, task.id)}
              className={`press mt-1 flex h-6 w-6 shrink-0 items-center justify-center border text-sm ${done ? "border-fg bg-fg text-bg" : "border-rule-strong hover:border-fg"}`}
            >
              {done ? "✓" : ""}
            </button>
            <div className="min-w-0 flex-1">
              <p className="label text-fg-3">{KIND_LABEL[task.kind]}</p>
              <Link href={taskHref(task, event)} className={`display mt-1 block text-2xl leading-tight hover:text-signal ${done ? "text-fg-3 line-through decoration-rule-strong" : ""}`}>
                {task.title}
              </Link>
              <p className="mt-2 text-sm leading-relaxed text-fg-2">{task.detail}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** At the top of Today until the event has passed: the countdown and today's short list. */
export function EventCard({ event }: { event: SpeakingEvent }) {
  const atlas = useAtlas();
  const { plan, scriptTitle } = useEventPlan(event);
  if (!plan) return null;
  const left = daysBetween(atlas.now, event.day);
  const today = plan.days.find((d) => d.day === dayKey(atlas.now)) ?? null;
  const first = plan.days[0];
  return (
    <section aria-label={`Event: ${event.name}`} className="mb-14">
      <Plate
        caption={`Event · ${describeCountdown(left)}`}
        aside={
          <Link href="/event" className="label text-fg-3 hover:text-fg">
            Full plan →
          </Link>
        }
      >
        <div className="grid gap-x-12 gap-y-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
          <div>
            <p className="display text-(length:--text-display-s) leading-tight">{event.name}</p>
            <p className="mt-2 text-sm text-fg-3">
              {formatDay(`${event.day}T12:00:00`)} · {scriptTitle}
            </p>
            {today && <p className="label mt-5 !text-signal">Today · {today.focus}</p>}
          </div>
          {today ? (
            <Tasks day={today} event={event} />
          ) : (
            <p className="self-center text-[0.9375rem] leading-relaxed text-fg-2">
              The rehearsal plan covers the last {MAX_PLAN_DAYS} days{first ? ` and starts on ${formatDay(`${first.day}T12:00:00`)}` : ""}. Until then, your normal session is enough.
            </p>
          )}
        </div>
      </Plate>
    </section>
  );
}

/** Event mode: name it, date it, pick the script. The plan writes itself from there. */
export function EventPage() {
  const atlas = useAtlas();
  const store = useStore();
  const event = atlas.event;
  const { plan, scriptTitle } = useEventPlan(event);
  const scripts = store.scripts.filter((s) => !s.tags.includes("drill"));
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [day, setDay] = useState("");
  const [scriptId, setScriptId] = useState("");
  const todayKey = dayKey(atlas.now);
  const valid = name.trim().length > 1 && day >= todayKey && scripts.some((s) => s.id === scriptId);

  const startEdit = () => {
    setName(event?.name ?? "");
    setDay(event?.day ?? "");
    setScriptId(event?.scriptId ?? scripts[0]?.id ?? "");
    setEditing(true);
  };
  const save = () => {
    if (!valid) return;
    modes.saveEvent({ id: event?.id ?? newId("event"), name: name.trim(), day, scriptId, createdAt: event?.createdAt ?? new Date().toISOString(), done: event && event.scriptId === scriptId ? event.done : [] });
    setEditing(false);
  };

  if (!atlas.hydrated) return <Loading label="Reading your plan" />;

  const form = (
    <form
      className="max-w-xl space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div>
        <label htmlFor="event-name" className="label text-fg-3">
          What is it
        </label>
        <input id="event-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Quarterly review with the leadership team" className="mt-2 w-full border border-rule-strong bg-surface px-4 py-3 text-lg outline-none placeholder:text-fg-3 focus:border-fg" />
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="event-day" className="label text-fg-3">
            When
          </label>
          <input id="event-day" type="date" min={todayKey} value={day} onChange={(e) => setDay(e.target.value)} className="mt-2 w-full border border-rule-strong bg-surface px-4 py-3 text-lg outline-none focus:border-fg" />
        </div>
        <div>
          <label htmlFor="event-script" className="label text-fg-3">
            Script
          </label>
          <select id="event-script" value={scriptId} onChange={(e) => setScriptId(e.target.value)} className="mt-2 w-full border border-rule-strong bg-surface px-4 py-3 text-lg outline-none focus:border-fg">
            {scripts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </div>
      </div>
      {scripts.length === 0 && (
        <p className="text-sm text-fg-2">
          There is no script yet.{" "}
          <Link href="/scripts" className="underline decoration-signal underline-offset-4 hover:text-signal">
            Write what you will say
          </Link>{" "}
          first.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button variant="solid" size="lg" type="submit" disabled={!valid}>
          {event ? "Save changes" : "Build the plan"}
        </Button>
        {(editing || event) && (
          <Button size="lg" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );

  if (!event || !plan || editing) {
    return (
      <div>
        <PageHeader
          eyebrow="Event mode"
          title={
            <>
              Something to <span className="display-italic">get ready</span> for.
            </>
          }
        >
          Name the event, give the date, pick the script. You get a short list for each day until then: the risky words, the hard sentences, then full run-throughs at a steady pace.
        </PageHeader>
        {editing || event ? (
          form
        ) : (
          <Button variant="solid" size="lg" onClick={startEdit}>
            Set up an event
          </Button>
        )}
      </div>
    );
  }

  const left = daysBetween(atlas.now, event.day);
  const total = plan.days.reduce((n, d) => n + d.tasks.length, 0);
  const ticked = plan.days.reduce((n, d) => n + d.tasks.filter((t) => event.done.includes(t.id)).length, 0);
  const minutes = Math.floor(plan.targetSeconds / 60);
  const seconds = plan.targetSeconds % 60;

  return (
    <div>
      <PageHeader
        eyebrow={`Event · ${describeCountdown(left)}`}
        title={event.name}
        aside={
          <div className="flex flex-wrap gap-3">
            <Button onClick={startEdit}>Edit</Button>
            <Button
              variant="quiet"
              onClick={() => {
                if (window.confirm(`Delete the event “${event.name}” and its plan?`)) modes.deleteEvent(event.id);
              }}
            >
              Delete
            </Button>
          </div>
        }
      >
        {formatDay(`${event.day}T12:00:00`)} · {scriptTitle} · {ticked} of {total} tasks done
      </PageHeader>

      <div className="grid gap-x-16 gap-y-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <ol className="space-y-10">
          {plan.days.map((d) => {
            const isToday = d.day === todayKey;
            return (
              <li key={d.day} data-today={isToday || undefined}>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
                  <p className={`label ${isToday ? "!text-signal" : "text-fg-3"}`}>
                    {isToday ? "Today" : formatDay(`${d.day}T12:00:00`)} · {d.daysLeft === 0 ? "the day" : `${d.daysLeft} ${d.daysLeft === 1 ? "day" : "days"} left`}
                  </p>
                  <p className="text-sm text-fg-2">{d.focus}</p>
                </div>
                <Tasks day={d} event={event} />
              </li>
            );
          })}
        </ol>

        <aside className="space-y-10">
          <section>
            <Label as="h2">Pace target</Label>
            <p className="numeral mt-3 text-6xl">
              {minutes}:{String(seconds).padStart(2, "0")}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-fg-2">
              {plan.wordCount} words at about {PACE_TARGET.aim} words a minute. Anywhere from {PACE_TARGET.min} to {PACE_TARGET.max} is easy to follow.
            </p>
          </section>
          <section>
            <Label as="h2">Risky words in this script</Label>
            {plan.riskyWords.length > 0 ? (
              <>
                <p className="display mt-3 text-2xl leading-snug">{plan.riskyWords.join(" · ")}</p>
                <p className="mt-3 text-sm text-fg-3">Words in this script that hold your weakest sounds, or that you saved yourself.</p>
              </>
            ) : (
              <p className="mt-3 text-sm leading-relaxed text-fg-2">None found yet. The app only knows a word is risky after a scored take has heard it. Read the script once.</p>
            )}
          </section>
          {plan.hardSentences.length > 0 && (
            <section>
              <Label as="h2">Sentences to shadow</Label>
              <ul className="mt-3 space-y-3">
                {plan.hardSentences.map((s) => (
                  <li key={s} className="display display-italic text-xl leading-snug text-fg-2">
                    &ldquo;{s}&rdquo;
                  </li>
                ))}
              </ul>
            </section>
          )}
          <Note>The plan is rebuilt from your latest scores each time you open it, so the risky words change as you fix them.</Note>
        </aside>
      </div>
    </div>
  );
}
