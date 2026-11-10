import { Suspense } from "react";
import { Practice } from "@/components/Practice";
import { Loading } from "@/components/ui";

export default function PracticePage() {
  return (
    <Suspense fallback={<Loading label="Loading script" />}>
      <Practice />
    </Suspense>
  );
}
