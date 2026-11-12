import { redirect } from "next/navigation";

/** The history screen is now Progress. Old links keep working. */
export default function HistoryPage() {
  redirect("/progress");
}
