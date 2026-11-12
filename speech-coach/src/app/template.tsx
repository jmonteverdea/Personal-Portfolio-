import type { ReactNode } from "react";

/**
 * One quiet page transition: the new page rises into place. Done in CSS so the
 * server and the browser render the same markup, and so prefers-reduced-motion
 * switches it off with everything else.
 */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="page-in">{children}</div>;
}
