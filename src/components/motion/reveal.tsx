"use client";

import { motion, useReducedMotion } from "motion/react";

// FREE — Motion (ex-Framer Motion) : apparition au scroll.
// `onMount` : anime au chargement (contenu au-dessus de la ligne de flottaison) plutôt qu'à l'entrée dans le viewport.
export function Reveal({
  children,
  delay = 0,
  onMount = false,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  onMount?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const visible = { opacity: 1, y: 0, filter: "blur(0px)" };
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 36, filter: "blur(8px)" }}
      animate={onMount ? visible : undefined}
      whileInView={onMount ? undefined : visible}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{ duration: 0.9, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
