import type { ComponentProps, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  Card as ShadcnCard,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader as ShadcnCardHeader,
  CardTitle,
} from "./primitives/card";

export function Card({ className, ...props }: ComponentProps<typeof ShadcnCard>) {
  return (
    <ShadcnCard
      className={cn("gap-0 rounded-sheet border border-border bg-card p-0 text-card-foreground shadow-none ring-0", className)}
      {...props}
    />
  );
}

type LegacyCardHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  as?: "h2" | "h3";
};

export function CardHeader(props: LegacyCardHeaderProps | HTMLAttributes<HTMLDivElement>) {
  if ("title" in props) {
    const { title, description, action, className, as: Heading = "h2" } = props as LegacyCardHeaderProps;
    return (
      <ShadcnCardHeader className={cn("flex flex-wrap items-start justify-between gap-3 px-5 pt-5", className)}>
        <div className="min-w-0">
          <Heading className="font-semiwide text-base font-bold text-foreground">{title}</Heading>
          {description && <CardDescription className="mt-0.5">{description}</CardDescription>}
        </div>
        {action && <CardAction>{action}</CardAction>}
      </ShadcnCardHeader>
    );
  }

  return <ShadcnCardHeader {...props} />;
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <CardContent className={cn("p-5", className)} {...props} />;
}

export { CardAction, CardContent, CardDescription, CardFooter, CardTitle };
