import { Suspense } from "react";
import { Loading } from "@/components/ds/ui";
import { Conversation } from "@/components/modes/Conversation";

export default function Page() {
  return (
    <Suspense fallback={<Loading label="One moment" />}>
      <Conversation />
    </Suspense>
  );
}
