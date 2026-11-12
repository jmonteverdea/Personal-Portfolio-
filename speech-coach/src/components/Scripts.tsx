"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { toAppError } from "@/lib/errors";
import { matchScenarios, SCENARIOS } from "@/lib/scenarios";
import { actions, useStore } from "@/lib/store";
import { hasDigits, normalizeWords } from "@/lib/text";
import { SCRIPT_TAGS, type Script, type ScriptTag } from "@/lib/types";
import { useConfig } from "./ConfigContext";
import { Button, Label, LinkButton, Loading, Note, PageHeader, Plate, StateBlock } from "./ds/ui";

interface Draft {
  id?: string;
  title: string;
  text: string;
  tags: ScriptTag[];
  generated?: boolean;
}

const EMPTY_DRAFT: Draft = { title: "", text: "", tags: [] };
const SPEAKING_WPM = 140;
const seconds = (words: number) => Math.max(1, Math.round((words / SPEAKING_WPM) * 60));
const FIELD = "w-full border-0 border-b border-rule-strong bg-transparent px-0 py-2 text-fg placeholder:text-fg-3 focus:border-fg focus:outline-none focus-visible:outline-none";

function Editor({ initial, onDone }: { initial: Draft; onDone: () => void }) {
  const [draft, setDraft] = useState<Draft>(initial);
  const wordCount = normalizeWords(draft.text).length;
  const toggle = (tag: ScriptTag) => setDraft((d) => ({ ...d, tags: d.tags.includes(tag) ? d.tags.filter((t) => t !== tag) : [...d.tags, tag] }));
  return (
    <Plate caption={draft.id ? "Edit script" : draft.generated ? "Review the generated script" : "New script"}>
      <div className="space-y-7">
        {draft.generated && <Note>Claude wrote this. Change anything that does not sound like you, then save.</Note>}
        <label className="block">
          <Label as="span">Title</Label>
          <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Monday status update" className={`${FIELD} display mt-1 text-3xl`} />
        </label>
        <label className="block">
          <Label as="span">What you will say</Label>
          <textarea value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} rows={7} placeholder="Paste or type exactly what you plan to say." className={`${FIELD} mt-2 resize-y text-lg leading-relaxed`} />
          <span className="label mt-2 block text-fg-3">
            {wordCount} {wordCount === 1 ? "word" : "words"}
            {wordCount > 0 && ` · about ${seconds(wordCount)} seconds spoken`}
          </span>
        </label>
        {hasDigits(draft.text) && (
          <Note tone="signal">This script has digits. Azure hears &ldquo;15&rdquo; as &ldquo;fifteen&rdquo;, which shows up as one skipped word and one added word. Write numbers as words for a clean comparison.</Note>
        )}
        <fieldset>
          <Label as="span">Tags</Label>
          <div className="mt-3 flex flex-wrap gap-2">
            {SCRIPT_TAGS.map((tag) => {
              const on = draft.tags.includes(tag);
              return (
                <button key={tag} type="button" aria-pressed={on} onClick={() => toggle(tag)} className={`label press border px-3 py-2 ${on ? "border-fg bg-fg !text-bg" : "border-rule-strong text-fg-2 hover:border-fg"}`}>
                  {tag}
                </button>
              );
            })}
          </div>
        </fieldset>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="solid"
            disabled={wordCount === 0}
            onClick={() => {
              actions.saveScript(draft);
              onDone();
            }}
          >
            Save script
          </Button>
          <Button variant="quiet" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </div>
    </Plate>
  );
}

function BuiltInScenarios({ onDraft, onClose }: { onDraft: (draft: Draft) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const matches = query.trim().length >= 2 ? matchScenarios(query, 4) : SCENARIOS;
  return (
    <div className="space-y-6">
      <p className="max-w-xl text-[0.9375rem] leading-relaxed text-fg-2">Built-in scenarios, free and with no AI. Pick one and edit it to fit your situation.</p>
      <label className="block">
        <Label as="span">What is the situation?</Label>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Push back on a deadline with a VP" className={`${FIELD} mt-1 text-xl`} />
      </label>
      {matches.length === 0 ? (
        <Note>Nothing built in matches that. Try deadline, feedback, raise, client or presentation, or clear the box to see all {SCENARIOS.length}.</Note>
      ) : (
        <ul className="max-h-96 divide-y divide-rule overflow-y-auto border-y border-rule" data-lenis-prevent>
          {matches.map((s) => (
            <li key={s.title} className="flex flex-wrap items-center justify-between gap-4 py-4">
              <div className="min-w-0 flex-1">
                <p className="text-lg">{s.title}</p>
                <p className="label mt-1 text-fg-3">{s.tag}</p>
              </div>
              <Button size="sm" onClick={() => onDraft({ title: s.title, text: s.script, tags: [s.tag] })}>
                Use this
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button variant="quiet" onClick={onClose}>
        Close
      </Button>
    </div>
  );
}

function Generator({ onDraft, onClose }: { onDraft: (draft: Draft) => void; onClose: () => void }) {
  const { anthropic } = useConfig();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const scenario = await api.scenario(prompt.trim());
      onDraft({ title: scenario.title, text: scenario.script, tags: [scenario.tag], generated: true });
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Plate caption={anthropic ? "Generate a scenario" : "Scenario library"}>
      {!anthropic ? (
        <BuiltInScenarios onDraft={onDraft} onClose={onClose} />
      ) : (
        <div className="space-y-6">
          <label className="block">
            <Label as="span">What is the situation?</Label>
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && prompt.trim().length >= 3 && !busy) void generate();
              }}
              placeholder="Push back on a deadline with a VP"
              className={`${FIELD} mt-1 text-xl`}
            />
          </label>
          {error && (
            <StateBlock kind="error" title="The scenario did not come back." compact>
              {error}
            </StateBlock>
          )}
          <div className="flex flex-wrap items-center gap-4">
            <Button variant="solid" busy={busy} disabled={prompt.trim().length < 3} onClick={() => void generate()}>
              {busy ? "Writing" : "Generate"}
            </Button>
            <Button variant="quiet" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <span className="label text-fg-3">your prompt is sent to Anthropic</span>
          </div>
        </div>
      )}
    </Plate>
  );
}

function Row({ script, index, onEdit }: { script: Script; index: number; onEdit: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const words = normalizeWords(script.text).length;
  return (
    <li className="rise group grid gap-x-8 gap-y-3 border-b border-rule py-7 md:grid-cols-[3rem_minmax(0,1fr)_auto]" style={{ "--i": Math.min(index, 8) } as React.CSSProperties}>
      <span className="label pt-2 text-fg-3">{String(index + 1).padStart(2, "0")}</span>
      <div className="min-w-0">
        <Link href={`/practice?script=${encodeURIComponent(script.id)}`} className="display block text-(length:--text-display-s) transition-colors hover:text-signal">
          {script.title}
        </Link>
        <p className="label mt-3 text-fg-3">
          {script.tags.join(" · ") || "untagged"} · {words} words · {seconds(words)}s
        </p>
        <p className="mt-3 line-clamp-2 max-w-3xl text-[0.9375rem] leading-relaxed text-fg-2">{script.text}</p>
      </div>
      <div className="flex flex-wrap items-start gap-x-5 gap-y-2 md:flex-col md:items-end">
        <LinkButton href={`/practice?script=${encodeURIComponent(script.id)}`} variant="solid">
          Practise
        </LinkButton>
        <div className="flex items-center gap-4 pt-1">
          <button type="button" onClick={onEdit} className="label text-fg-3 hover:!text-fg">
            Edit
          </button>
          {confirming ? (
            <>
              <button type="button" onClick={() => actions.deleteScript(script.id)} className="label !text-signal">
                Delete for good
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="label text-fg-3 hover:!text-fg">
                Keep
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className="label text-fg-3 hover:!text-signal">
              Delete
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

export function Scripts() {
  const config = useConfig();
  const { hydrated, scripts } = useStore();
  const [panel, setPanel] = useState<{ kind: "editor"; draft: Draft; key: string } | { kind: "scenario" } | null>(null);
  const [filter, setFilter] = useState<ScriptTag | null>(null);
  const openEditor = (draft: Draft) => setPanel({ kind: "editor", draft, key: `${draft.id ?? "new"}-${Date.now()}` });
  const usedTags = SCRIPT_TAGS.filter((tag) => scripts.some((s) => s.tags.includes(tag)));
  const visible = filter ? scripts.filter((s) => s.tags.includes(filter)) : scripts;

  return (
    <div>
      <PageHeader
        eyebrow="Scripts"
        title={
          <>
            What you need to <span className="display-italic">say</span>.
          </>
        }
        aside={
          <>
            <Button onClick={() => setPanel({ kind: "scenario" })}>{config.anthropic ? "Generate scenario" : "Scenario library"}</Button>
            <Button variant="solid" onClick={() => openEditor(EMPTY_DRAFT)}>
              New script
            </Button>
          </>
        }
      >
        Meeting updates, presentation openings, hard conversations. Write them as you will say them, then rehearse out loud.
      </PageHeader>

      {panel && (
        <div className="mb-12">
          {panel.kind === "editor" ? <Editor key={panel.key} initial={panel.draft} onDone={() => setPanel(null)} /> : <Generator onDraft={openEditor} onClose={() => setPanel(null)} />}
        </div>
      )}

      {!hydrated ? (
        <Loading label="Loading your scripts" />
      ) : scripts.length === 0 ? (
        <StateBlock kind="empty" title="No scripts yet." action={<Button variant="solid" onClick={() => openEditor(EMPTY_DRAFT)}>Write the first one</Button>}>
          Paste a meeting update, a presentation opening or a hard conversation you need to have.
        </StateBlock>
      ) : (
        <>
          {usedTags.length > 1 && (
            <div className="mb-2 flex flex-wrap gap-x-6 gap-y-2" role="group" aria-label="Filter by tag">
              {[null, ...usedTags].map((tag) => (
                <button key={tag ?? "all"} type="button" aria-pressed={filter === tag} onClick={() => setFilter(tag)} className={`label press py-1 ${filter === tag ? "!text-fg underline decoration-signal decoration-2 underline-offset-4" : "text-fg-3 hover:!text-fg"}`}>
                  {tag ?? "All"}
                </button>
              ))}
            </div>
          )}
          <ol className="border-t border-rule">
            {visible.map((script, i) => (
              <Row key={script.id} script={script} index={i} onEdit={() => openEditor({ ...script })} />
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
