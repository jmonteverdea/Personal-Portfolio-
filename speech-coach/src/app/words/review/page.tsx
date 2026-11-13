import { Suspense } from "react";
import { WordsReview } from "@/components/modes/Words";

export default function Page() {
  return (
    <Suspense>
      <WordsReview />
    </Suspense>
  );
}
