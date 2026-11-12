"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAtlas } from "@/hooks/useAtlas";
import { DrillRunner } from "./DrillRunner";
import { LinkButton, Loading, StateBlock } from "./ds/ui";
import { EarTrainer } from "./EarTrainer";

/** A drill or an ear drill opened directly from a sound, outside the guided session. */
export function Standalone({ kind }: { kind: "review" | "ear" }) {
  const router = useRouter();
  const phoneme = useSearchParams().get("p") ?? "";
  const atlas = useAtlas();
  const back = `/sound?p=${encodeURIComponent(phoneme)}`;
  if (!atlas.hydrated) return <Loading label="One moment" />;
  if (!phoneme) {
    return (
      <StateBlock kind="empty" title="No sound chosen." action={<LinkButton href="/progress" variant="solid">Open the sound map</LinkButton>}>
        Pick a sound from the map to drill it.
      </StateBlock>
    );
  }
  return (
    <div>
      <Link href={atlas.sounds.has(phoneme) ? back : "/progress"} className="label mb-10 inline-block text-fg-3 hover:text-fg">
        ← Back
      </Link>
      {kind === "review" ? (
        <DrillRunner phoneme={phoneme} onDone={() => router.push(atlas.sounds.has(phoneme) ? back : "/progress")} />
      ) : (
        <EarTrainer phoneme={phoneme} onDone={() => router.push(atlas.sounds.has(phoneme) ? back : "/progress")} />
      )}
    </div>
  );
}
