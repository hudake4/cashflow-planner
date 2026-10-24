import { clsx } from "clsx";
import type { HTMLAttributes, ReactNode } from "react";

/** A sheet of paper on the desk: ruled edge, no shadow. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("rounded-sheet border border-slate-200 bg-sheet", className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  action,
  className,
  as: Heading = "h2",
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  as?: "h2" | "h3";
}) {
  return (
    <div className={clsx("flex flex-wrap items-start justify-between gap-3 px-5 pt-5", className)}>
      <div className="min-w-0">
        <Heading className="font-semiwide text-base font-bold text-slate-900">{title}</Heading>
        {description && <p className="mt-0.5 text-sm text-slate-600">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("p-5", className)} {...props} />;
}
