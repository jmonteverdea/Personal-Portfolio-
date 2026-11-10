"use client";

import { FileText, Mic, Pencil, Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { toAppError } from "@/lib/errors";
import { modeDescription } from "@/lib/mode";
import { actions, useStore } from "@/lib/store";
import { hasDigits, normalizeWords } from "@/lib/text";
import { SCRIPT_TAGS, type Script, type ScriptTag } from "@/lib/types";
import { useConfig } from "./ConfigContext";
import { Button, Card, CardTitle, EmptyState, Loading, Notice, Pill } from "./ui";

interface Draft {
  id?: string;
  title: string;
  text: string;
  tags: ScriptTag[];
  /** Shown above the form when the draft came from Claude. */
  generated?: boolean;
}

const EMPTY_DRAFT: Draft = { title: "", text: "", tags: [] };
const SPEAKING_WPM = 140;

function ScriptEditor({ initial, onDone }: { initial: Draft; onDone: () => void }) {
  const [draft, setDraft] = useState<Draft>(initial);
  const wordCount = normalizeWords(draft.text).length;
  const canSave = wordCount > 0;

  const toggleTag = (tag: ScriptTag) =>
    setDraft((d) => ({ ...d, tags: d.tags.includes(tag) ? d.tags.filter((t) => t !== tag) : [...d.tags, tag] }));

  return (
    <Card>
      <CardTitle>{draft.id ? "Edit script" : draft.generated ? "Review generated script" : "New script"}</CardTitle>
      <div className="space-y-4">
        {draft.generated && (
          <Notice>Claude wrote this. Edit anything that does not sound like you, then save.</Notice>
        )}
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Title</span>
          <input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder="Monday status update"
            className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Script</span>
          <textarea
            value={draft.text}
            onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            rows={8}
            placeholder="Paste or type exactly what you plan to say."
            className="w-full rounded-lg border border-line bg-white px-3 py-2 text-base leading-relaxed"
          />
          <span className="mt-1 block text-xs text-muted">
            {wordCount} {wordCount === 1 ? "word" : "words"}
            {wordCount > 0 && `, about ${Math.max(1, Math.round((wordCount / SPEAKING_WPM) * 60))} seconds spoken`}
          </span>
        </label>
        {hasDigits(draft.text) && (
          <Notice tone="warn">
            This script has digits. Azure hears &quot;15&quot; as &quot;fifteen&quot;, so digits show up as a skipped word plus an
            extra word. Write numbers as words for a clean comparison.
          </Notice>
        )}
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Tags</legend>
          <div className="flex flex-wrap gap-2">
            {SCRIPT_TAGS.map((tag) => {
              const on = draft.tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleTag(tag)}
                  className={`rounded-full border px-3 py-1 text-sm ${on ? "border-accent bg-accent-soft text-accent" : "border-line bg-white text-muted hover:text-ink"}`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </fieldset>
        <div className="flex gap-2">
          <Button
            variant="primary"
            disabled={!canSave}
            onClick={() => {
              actions.saveScript(draft);
              onDone();
            }}
          >
            Save script
          </Button>
          <Button onClick={onDone}>Cancel</Button>
        </div>
      </div>
    </Card>
  );
}

function ScenarioGenerator({ onDraft, onClose }: { onDraft: (draft: Draft) => void; onClose: () => void }) {
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
    <Card>
      <CardTitle>Generate a scenario</CardTitle>
      {!anthropic ? (
        <div className="space-y-3">
          <Notice tone="warn" title="Needs an Anthropic key">
            Scenario generation uses Claude. Add ANTHROPIC_API_KEY to .env.local and restart the dev server.
          </Notice>
          <Button onClick={onClose}>Close</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">What is the situation?</span>
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && prompt.trim().length >= 3 && !busy) void generate();
              }}
              placeholder="Push back on a deadline with a VP"
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
            />
          </label>
          {error && <Notice tone="error" title="Could not generate">{error}</Notice>}
          <div className="flex gap-2">
            <Button variant="primary" loading={busy} disabled={prompt.trim().length < 3} onClick={() => void generate()}>
              <Wand2 className="h-4 w-4" aria-hidden />
              {busy ? "Writing" : "Generate"}
            </Button>
            <Button onClick={onClose} disabled={busy}>Cancel</Button>
          </div>
          <p className="text-xs text-muted">Your prompt is sent to Anthropic.</p>
        </div>
      )}
    </Card>
  );
}

function ScriptCard({ script, onEdit }: { script: Script; onEdit: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const words = normalizeWords(script.text).length;
  return (
    <li className="rounded-2xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">{script.title}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {script.tags.map((t) => (
              <Pill key={t} tone={t === "drill" ? "violet" : "accent"}>{t}</Pill>
            ))}
            <span className="text-xs text-muted">
              {words} words, about {Math.max(1, Math.round((words / SPEAKING_WPM) * 60))}s
            </span>
          </div>
        </div>
        <Link
          href={`/practice?script=${encodeURIComponent(script.id)}`}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-[#0c5a4d]"
        >
          <Mic className="h-4 w-4" aria-hidden />
          Practice
        </Link>
      </div>
      <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted">{script.text}</p>
      <div className="mt-3 flex items-center gap-1">
        <Button size="sm" variant="ghost" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" aria-hidden />
          Edit
        </Button>
        {confirming ? (
          <>
            <Button size="sm" variant="danger" onClick={() => actions.deleteScript(script.id)}>Delete for good</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Keep</Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Delete
          </Button>
        )}
      </div>
    </li>
  );
}

export function Library() {
  const router = useRouter();
  const config = useConfig();
  const { hydrated, scripts } = useStore();
  const [panel, setPanel] = useState<{ kind: "editor"; draft: Draft; key: string } | { kind: "scenario" } | null>(null);
  const [filter, setFilter] = useState<ScriptTag | null>(null);

  const openEditor = (draft: Draft) => setPanel({ kind: "editor", draft, key: `${draft.id ?? "new"}-${Date.now()}` });
  const loadSample = () => router.push(`/results?session=${actions.loadDemo()}`);

  const usedTags = SCRIPT_TAGS.filter((tag) => scripts.some((s) => s.tags.includes(tag)));
  const visible = filter ? scripts.filter((s) => s.tags.includes(filter)) : scripts;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Scripts</h1>
          <p className="mt-1 text-sm text-muted">Write what you need to say at work, then rehearse it out loud.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={loadSample} title="Loads a sample result, coaching and history. No keys needed.">
            <Sparkles className="h-4 w-4" aria-hidden />
            Load sample result
          </Button>
          <Button onClick={() => setPanel({ kind: "scenario" })}>
            <Wand2 className="h-4 w-4" aria-hidden />
            Generate scenario
          </Button>
          <Button variant="primary" onClick={() => openEditor(EMPTY_DRAFT)}>
            <Plus className="h-4 w-4" aria-hidden />
            New script
          </Button>
        </div>
      </div>

      {!(config.azure && config.anthropic) && <Notice tone={config.azure ? "info" : "warn"}>{modeDescription(config)}</Notice>}

      {panel?.kind === "editor" && <ScriptEditor key={panel.key} initial={panel.draft} onDone={() => setPanel(null)} />}
      {panel?.kind === "scenario" && <ScenarioGenerator onDraft={openEditor} onClose={() => setPanel(null)} />}

      {!hydrated ? (
        <Loading label="Loading your scripts" />
      ) : scripts.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-8 w-8" aria-hidden />}
          title="No scripts yet"
          action={
            <>
              <Button variant="primary" onClick={() => openEditor(EMPTY_DRAFT)}>New script</Button>
              <Button onClick={loadSample}>Load sample result</Button>
            </>
          }
        >
          Paste a meeting update, a presentation opening or a hard conversation you need to have. Or load the sample to
          see what results look like.
        </EmptyState>
      ) : (
        <>
          {usedTags.length > 1 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by tag">
              {[null, ...usedTags].map((tag) => (
                <button
                  key={tag ?? "all"}
                  type="button"
                  aria-pressed={filter === tag}
                  onClick={() => setFilter(tag)}
                  className={`rounded-full border px-3 py-1 text-sm ${filter === tag ? "border-ink bg-ink text-white" : "border-line bg-white text-muted hover:text-ink"}`}
                >
                  {tag ?? "All"}
                </button>
              ))}
            </div>
          )}
          <ul className="grid gap-4 md:grid-cols-2">
            {visible.map((script) => (
              <ScriptCard key={script.id} script={script} onEdit={() => openEditor({ ...script })} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
