import { Suspense } from "react";
import { Loading } from "@/components/ds/ui";
import { Results } from "@/components/Results";

export default function ResultsPage() {
  return (
    <Suspense fallback={<Loading label="Loading the take" />}>
      <Results />
    </Suspense>
  );
}
