"use client";

import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type HTMLMotionProps,
  type TargetAndTransition,
  type Transition,
} from "motion/react";
import { cn } from "@/lib/utils";

type ExpandDirection = "vertical" | "horizontal" | "both";
type ExpandBehavior = "replace" | "push";
type EaseType = "easeInOut" | "easeIn" | "easeOut" | "linear" | [number, number, number, number];

interface ExpandableContextType {
  isExpanded: boolean;
  toggleExpand: () => void;
  expandDirection: ExpandDirection;
  expandBehavior: ExpandBehavior;
  transitionDuration: number;
  easeType: EaseType;
}

const ExpandableContext = createContext<ExpandableContextType | null>(null);

function useExpandable() {
  const context = useContext(ExpandableContext);
  if (!context) throw new Error("Expandable parts must be used inside <Expandable>.");
  return context;
}

interface ExpandableProps extends Omit<HTMLMotionProps<"div">, "children"> {
  children: ReactNode | ((props: { isExpanded: boolean }) => ReactNode);
  expanded?: boolean;
  onToggle?: () => void;
  transitionDuration?: number;
  easeType?: EaseType;
  expandDirection?: ExpandDirection;
  expandBehavior?: ExpandBehavior;
  initialDelay?: number;
  onExpandStart?: () => void;
  onExpandEnd?: () => void;
  onCollapseStart?: () => void;
  onCollapseEnd?: () => void;
}

const Expandable = forwardRef<HTMLDivElement, ExpandableProps>(function Expandable(
  {
    children,
    expanded,
    onToggle,
    transitionDuration = 0.2,
    easeType = "easeInOut",
    expandDirection = "vertical",
    expandBehavior = "replace",
    initialDelay = 0,
    onExpandStart,
    onExpandEnd,
    onCollapseStart,
    onCollapseEnd,
    ...props
  },
  ref,
) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = expanded ?? internalExpanded;
  const reducedMotion = useReducedMotion();
  const previousExpanded = useRef(isExpanded);
  const toggleExpand = useCallback(() => {
    if (onToggle) onToggle();
    else setInternalExpanded((current) => !current);
  }, [onToggle]);

  useEffect(() => {
    if (previousExpanded.current !== isExpanded) {
      if (isExpanded) onExpandStart?.();
      else onCollapseStart?.();
      previousExpanded.current = isExpanded;
    }
  }, [isExpanded, onExpandStart, onCollapseStart]);

  const context: ExpandableContextType = {
    isExpanded,
    toggleExpand,
    expandDirection,
    expandBehavior,
    transitionDuration: reducedMotion ? 0 : transitionDuration,
    easeType,
  };

  return (
    <ExpandableContext.Provider value={context}>
      <motion.div
        ref={ref}
        initial={false}
        transition={{ duration: reducedMotion ? 0 : transitionDuration, ease: easeType, delay: reducedMotion ? 0 : initialDelay }}
        onAnimationComplete={() => {
          if (isExpanded) onExpandEnd?.();
          else onCollapseEnd?.();
        }}
        {...props}
      >
        {typeof children === "function" ? children({ isExpanded }) : children}
      </motion.div>
    </ExpandableContext.Provider>
  );
});

type AnimationPreset = "fade" | "slide-up" | "slide-down" | "slide-left" | "slide-right" | "scale";
interface AnimationProps {
  initial?: TargetAndTransition;
  animate?: TargetAndTransition;
  exit?: TargetAndTransition;
  transition?: Transition;
}

const animationPresets: Record<AnimationPreset, Pick<AnimationProps, "initial" | "animate" | "exit">> = {
  fade: { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } },
  "slide-up": { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 8 } },
  "slide-down": { initial: { opacity: 0, y: -8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 } },
  "slide-left": { initial: { opacity: 0, x: 8 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: 8 } },
  "slide-right": { initial: { opacity: 0, x: -8 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -8 } },
  scale: { initial: { opacity: 0, scale: 0.98 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.98 } },
};

interface ExpandableContentProps extends Omit<HTMLMotionProps<"div">, "ref"> {
  preset?: AnimationPreset;
  animateIn?: AnimationProps;
  animateOut?: AnimationProps;
  stagger?: boolean;
  staggerChildren?: number;
  keepMounted?: boolean;
}

const ExpandableContent = forwardRef<HTMLDivElement, ExpandableContentProps>(function ExpandableContent(
  {
    children,
    preset,
    animateIn,
    animateOut,
    stagger = false,
    staggerChildren = 0.04,
    keepMounted = false,
    className,
    ...props
  },
  ref,
) {
  const { isExpanded, transitionDuration, easeType } = useExpandable();
  const reducedMotion = useReducedMotion();
  const selected = preset ? animationPresets[preset] : {};
  const initial = reducedMotion ? {} : animateIn?.initial ?? selected.initial ?? {};
  const animate = reducedMotion ? {} : animateIn?.animate ?? { opacity: 1, y: 0, x: 0, scale: 1 };
  const exit = reducedMotion ? {} : animateOut?.exit ?? selected.exit ?? { opacity: 0 };
  const transition = { duration: reducedMotion ? 0 : transitionDuration, ease: easeType, ...animateIn?.transition };

  return (
    <motion.div
      ref={ref}
      initial={false}
      animate={{ height: isExpanded ? "auto" : 0 }}
      transition={{ duration: reducedMotion ? 0 : transitionDuration, ease: easeType }}
      aria-hidden={!isExpanded}
      inert={!isExpanded}
      className={cn("overflow-hidden", className)}
      {...props}
    >
      <AnimatePresence initial={false}>
        {(isExpanded || keepMounted) && (
          <motion.div initial={initial} animate={animate} exit={exit} transition={transition}>
            {stagger && !reducedMotion ? (
              <motion.div variants={{ visible: { transition: { staggerChildren } } }} initial="hidden" animate="visible">
                {Array.isArray(children)
                  ? children.map((child, index) => (
                      <motion.div key={index} variants={{ hidden: { opacity: 0, y: 4 }, visible: { opacity: 1, y: 0 } }}>
                        {child}
                      </motion.div>
                    ))
                  : children}
              </motion.div>
            ) : children}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

interface ExpandableCardProps extends Omit<HTMLMotionProps<"div">, "ref" | "children"> {
  children: ReactNode;
  collapsedSize?: { width?: number; height?: number };
  expandedSize?: { width?: number; height?: number };
  hoverToExpand?: boolean;
  expandDelay?: number;
  collapseDelay?: number;
}

const ExpandableCard = forwardRef<HTMLDivElement, ExpandableCardProps>(function ExpandableCard(
  {
    children,
    className,
    collapsedSize = { width: 320, height: 211 },
    expandedSize = { width: 480 },
    hoverToExpand = false,
    expandDelay = 0,
    collapseDelay = 0,
    ...props
  },
  ref,
) {
  const { isExpanded, toggleExpand, expandDirection, transitionDuration } = useExpandable();
  const reducedMotion = useReducedMotion();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = undefined;
  };
  useEffect(() => clearTimer, []);

  const width = expandDirection === "vertical"
    ? collapsedSize.width ?? "auto"
    : isExpanded ? expandedSize.width ?? "auto" : collapsedSize.width ?? "auto";
  const height = expandDirection === "horizontal"
    ? collapsedSize.height ?? "auto"
    : isExpanded ? expandedSize.height ?? "auto" : collapsedSize.height ?? "auto";

  return (
    <motion.div
      ref={ref}
      className={cn("w-full max-w-full overflow-hidden rounded-sheet border border-border bg-card text-card-foreground shadow-sm", className)}
      style={{ width, height, maxWidth: "100%" }}
      animate={{ width, height }}
      transition={{ duration: reducedMotion ? 0 : transitionDuration, ease: "easeInOut" }}
      onPointerEnter={() => {
        if (hoverToExpand && !isExpanded) {
          clearTimer();
          timer.current = setTimeout(() => { if (!reducedMotion) toggleExpand(); }, reducedMotion ? 0 : expandDelay);
        }
      }}
      onPointerLeave={() => {
        if (hoverToExpand && isExpanded) {
          clearTimer();
          timer.current = setTimeout(() => { if (!reducedMotion) toggleExpand(); }, reducedMotion ? 0 : collapseDelay);
        }
      }}
      {...props}
    >
      <div className="h-full w-full overflow-hidden rounded-[inherit] p-4">{children}</div>
    </motion.div>
  );
});

const ExpandableTrigger = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function ExpandableTrigger(
  { children, className, onClick, onKeyDown, ...props },
  ref,
) {
  const { toggleExpand, isExpanded } = useExpandable();
  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
      className={cn("cursor-pointer rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
      onClick={(event) => { onClick?.(event); if (!event.defaultPrevented) toggleExpand(); }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (!event.defaultPrevented && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          toggleExpand();
        }
      }}
      {...props}
    >
      {children}
    </div>
  );
});

const ExpandableCardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function ExpandableCardHeader(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cn("flex flex-col gap-2 p-4", className)} {...props} />;
});

const ExpandableCardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function ExpandableCardContent(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cn("flex-grow overflow-hidden px-4 pb-4", className)} {...props} />;
});

const ExpandableCardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function ExpandableCardFooter(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cn("flex items-center gap-2 p-4 pt-0", className)} {...props} />;
});

export {
  Expandable,
  useExpandable,
  ExpandableCard,
  ExpandableContent,
  ExpandableContext,
  ExpandableTrigger,
  ExpandableCardHeader,
  ExpandableCardContent,
  ExpandableCardFooter,
};
