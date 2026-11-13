import { Suspense } from "react";
import { Loading } from "@/components/ds/ui";
import { TalkReport } from "@/components/modes/TalkReport";

export default function Page() {
  return (
    <Suspense fallback={<Loading label="Reading the talk" />}>
      <TalkReport />
    </Suspense>
  );
}
