"use client"

import { useEffect } from "react"
import { motion, MotionValue, useReducedMotion, useSpring, useTransform } from "motion/react"

interface RollingNumberProps {
  value: number
  mass?: number
  stiffness?: number
  damping?: number
  precision?: number
  format?: (value: number) => string
  onAnimationStart?: () => void
  onAnimationComplete?: () => void
}

export function RollingNumber({
  value,
  mass = 0.8,
  stiffness = 75,
  damping = 15,
  precision = 0,
  format = (num) => num.toLocaleString(),
  onAnimationStart,
  onAnimationComplete,
}: RollingNumberProps) {
  const reduceMotion = useReducedMotion()
  const spring = useSpring(value, { mass, stiffness, damping })
  const display: MotionValue<string> = useTransform(spring, (current) =>
    // Animation frame of an already-formatted number, not money arithmetic.
    // eslint-disable-next-line no-restricted-globals
    format(parseFloat(current.toFixed(precision)))
  )

  useEffect(() => {
    if (reduceMotion) return
    spring.set(value)
    if (onAnimationStart) onAnimationStart()
    const unsubscribe = spring.on("change", () => {
      if (spring.get() === value && onAnimationComplete) onAnimationComplete()
    })
    return () => unsubscribe()
  }, [spring, value, onAnimationStart, onAnimationComplete, reduceMotion])

  if (reduceMotion) return <span>{format(Number(value.toFixed(precision)))}</span>

  return <motion.span>{display}</motion.span>
}
