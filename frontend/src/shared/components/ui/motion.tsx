import { motion, type HTMLMotionProps } from "motion/react";
import type { ReactNode } from "react";

const ease = [0.22, 1, 0.36, 1] as const;

/** Fade + rise on mount. Use for page sections; `delay` staggers siblings by hand. */
export function FadeIn({ delay = 0, y = 12, ...props }: HTMLMotionProps<"div"> & { delay?: number; y?: number }) {
  return <motion.div initial={{ opacity: 0, y }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease, delay }} {...props} />;
}

/** Staggers its direct `StaggerItem` children. */
export function Stagger({ children, className, gap = 0.06 }: { children: ReactNode; className?: string; gap?: number }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: gap } } }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem(props: HTMLMotionProps<"div">) {
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease } } }}
      {...props}
    />
  );
}

/** Wraps routed page content; keyed by the shell on pathname so each page eases in. */
export function PageTransition({ children, id }: { children: ReactNode; id: string }) {
  return (
    <motion.div key={id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease }}>
      {children}
    </motion.div>
  );
}
