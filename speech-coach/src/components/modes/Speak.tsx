"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAtlas } from "@/hooks/useAtlas";
import { FREE_PROMPTS, SCENARIOS } from "@/lib/modes/talk";
import { useModes } from "@/lib/modes/store";
import { useStore } from "@/lib/store";
import { useConfig } from "../ConfigContext";
import { Button, formatDate, Label, Loading, PageHeader, Plate } from "../ds/ui";

const FIELD = "w-full border-0 border-b border-rule-strong bg-transparent px-0 py-2 text-fg placeholder:text-fg-3 focus:border-fg focus:outline-none";

function Row({ href, index, title, detail }: { href: string; index: number; title: string; detail: string }) {
  return (
    <li>
      <Link href={href} className="press group flex items-baseline gap-5 border-b border-rule py-4 hover:text-signal">
        <span className="label w-6 text-fg-3">{String(index + 1).padStart(2, "0")}</span>
        <span className="display flex-1 text-2xl">{title}</span>
        <span className="hidden max-w-xs truncate text-sm text-fg-3 sm:block">{detail}</span>
        <span className="label text-fg-3 group-hover:!text-signal">→</span>
      </Link>
    </li>
  );
}

/** Speak: the three ways to practise without a fixed script in front of you. */
export function Speak() {
  const router = useRouter();
  const { anthropic, azure } = useConfig();
  const atlas = useAtlas();
  const { scripts } = useStore();
  const { talks } = useModes();
  const [custom, setCustom] = useState("");
  const work = scripts.filter((s) => !s.tags.includes("drill"));
  const recent = [...talks].filter((t) => (atlas.usingDemo ? true : t.source !== "demo")).reverse().slice(0, 4);
  const startCustom = () => {
    if (custom.trim().length >= 4) router.push(`/talk/conversation?custom=${encodeURIComponent(custom.trim())}`);
  };

  if (!atlas.hydrated) return <Loading label="One moment" />;

  return (
    <div>
      <PageHeader
        eyebrow="Speak"
        title={
          <>
            Without a <span className="display-italic">script</span>.
          </>
        }
      >
        Meetings are not read aloud. Hold a short conversation, talk for a minute on a prompt, or shadow a model voice to work on intonation.
      </PageHeader>

      <div className="grid gap-x-16 gap-y-14 lg:grid-cols-2">
        <section>
          <div className="flex items-baseline justify-between gap-4 border-b border-fg pb-3">
            <Label as="h2" className="!text-fg">
              Conversation
            </Label>
            <Label as="span">{anthropic ? "Claude plays the other person" : atlas.demoMode ? "demo · scripted partner" : "scripted partner · no AI key"}</Label>
          </div>
          <ol>
            {SCENARIOS.map((s, i) => (
              <Row key={s.id} href={`/talk/conversation?s=${s.id}`} index={i} title={s.title} detail={s.opening} />
            ))}
          </ol>
          <div className="mt-6">
            <label className="block">
              <Label as="span">Or your own, in one line</Label>
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") startCustom();
                }}
                placeholder="Tell my manager I need another person on the team"
                className={`${FIELD} mt-1 text-lg`}
              />
            </label>
            <div className="mt-4">
              <Button onClick={startCustom} disabled={custom.trim().length < 4}>
                Start this conversation
              </Button>
            </div>
            {!anthropic && <p className="mt-3 text-xs leading-relaxed text-fg-3">Without an Anthropic key the partner follows a fixed set of questions, so it will not react to a custom situation in detail.</p>}
          </div>
        </section>

        <div className="space-y-14">
          <section>
            <div className="flex items-baseline justify-between gap-4 border-b border-fg pb-3">
              <Label as="h2" className="!text-fg">
                Free talk
              </Label>
              <Label as="span">one to two minutes</Label>
            </div>
            <ol>
              {FREE_PROMPTS.map((p, i) => (
                <Row key={p.id} href={`/talk/free?p=${p.id}`} index={i} title={p.title} detail={p.prompt} />
              ))}
            </ol>
          </section>

          <section>
            <div className="flex items-baseline justify-between gap-4 border-b border-fg pb-3">
              <Label as="h2" className="!text-fg">
                Shadowing
              </Label>
              <Label as="span">pitch against a model{azure ? "" : atlas.demoMode ? " · demo" : " · model contour needs Azure"}</Label>
            </div>
            {work.length === 0 ? (
              <p className="py-5 text-sm text-fg-3">
                Shadowing uses sentences from your own scripts. <Link href="/scripts" className="underline underline-offset-4">Add a script</Link> first.
              </p>
            ) : (
              <ol>
                {work.slice(0, 5).map((s, i) => (
                  <Row key={s.id} href={`/shadow?script=${encodeURIComponent(s.id)}`} index={i} title={s.title} detail={s.text} />
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>

      {recent.length > 0 && (
        <div className="mt-16">
          <Plate caption="Recent talks" flush>
            <ul className="divide-y divide-rule">
              {recent.map((t) => (
                <li key={t.id}>
                  <Link href={`/talk/report?id=${encodeURIComponent(t.id)}`} className="press flex flex-wrap items-baseline gap-x-6 gap-y-1 px-5 py-3.5 hover:bg-surface sm:px-7">
                    <span className="font-mono text-xs text-fg-3">{formatDate(t.date)}</span>
                    <span className="flex-1">{t.title}</span>
                    <span className="label text-fg-3">{t.kind === "free" ? "free talk" : "conversation"}{t.source === "demo" ? " · sample" : ""}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Plate>
        </div>
      )}
    </div>
  );
}
