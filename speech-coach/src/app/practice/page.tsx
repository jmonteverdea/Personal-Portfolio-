import { Suspense } from "react";
import { Loading } from "@/components/ds/ui";
import { Practice } from "@/components/Practice";

export default function PracticePage() {
  return (
    <Suspense fallback={<Loading label="Loading script" />}>
      <Practice />
    </Suspense>
  );
}
