"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/** One quiet page transition: the new page rises into place. Nothing loops, nothing lingers. */
export default function Template({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  if (reduce) return <>{children}</>;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}>
      {children}
    </motion.div>
  );
}
