import { Suspense } from "react";
import { Results } from "@/components/Results";
import { Loading } from "@/components/ui";

export default function ResultsPage() {
  return (
    <Suspense fallback={<Loading label="Loading result" />}>
      <Results />
    </Suspense>
  );
}
