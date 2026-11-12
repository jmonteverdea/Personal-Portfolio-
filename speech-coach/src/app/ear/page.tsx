import { Suspense } from "react";
import { Loading } from "@/components/ds/ui";
import { Standalone } from "@/components/Standalone";

export default function EarPage() {
  return (
    <Suspense fallback={<Loading label="One moment" />}>
      <Standalone kind="ear" />
    </Suspense>
  );
}
