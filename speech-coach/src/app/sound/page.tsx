import { Suspense } from "react";
import { Loading } from "@/components/ds/ui";
import { SoundPage } from "@/components/SoundPage";

export default function Page() {
  return (
    <Suspense fallback={<Loading label="Reading your history" />}>
      <SoundPage />
    </Suspense>
  );
}
