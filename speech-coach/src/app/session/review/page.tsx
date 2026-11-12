import { Suspense } from "react";
import { Loading } from "@/components/ds/ui";
import { Standalone } from "@/components/Standalone";

export default function ReviewPage() {
  return (
    <Suspense fallback={<Loading label="One moment" />}>
      <Standalone kind="review" />
    </Suspense>
  );
}
