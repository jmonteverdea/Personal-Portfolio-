import { Suspense } from "react";
import { Loading } from "@/components/ds/ui";
import { FreeTalk } from "@/components/modes/FreeTalk";

export default function Page() {
  return (
    <Suspense fallback={<Loading label="One moment" />}>
      <FreeTalk />
    </Suspense>
  );
}
