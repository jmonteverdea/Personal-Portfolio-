import { Suspense } from "react";
import { Loading } from "@/components/ds/ui";
import { Shadow } from "@/components/modes/Shadow";

export default function Page() {
  return (
    <Suspense fallback={<Loading label="One moment" />}>
      <Shadow />
    </Suspense>
  );
}
