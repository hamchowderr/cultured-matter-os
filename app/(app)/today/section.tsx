import { ArrowRightIcon, InfoIcon } from "lucide-react";
import Link from "next/link";

import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// A Today block in the kit dashboard's card style (v2.0.0): title, an optional info tooltip
// beside it, and a link to the screen where the whole list lives.
export function Section({
  title,
  description,
  href,
  linkLabel,
  id,
  className,
  children
}: {
  title: string;
  description?: string;
  href: string;
  linkLabel: string;
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card id={id} className={cn("scroll-mt-20", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          {title}
          {description && (
            <Tooltip>
              <TooltipTrigger asChild>
                <InfoIcon className="text-muted-foreground size-3.5" aria-label={description} />
              </TooltipTrigger>
              <TooltipContent>{description}</TooltipContent>
            </Tooltip>
          )}
        </CardTitle>
        <CardAction>
          <Link
            href={href}
            className="text-muted-foreground inline-flex items-center gap-1 text-sm hover:underline"
          >
            {linkLabel}
            <ArrowRightIcon className="size-3.5" />
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
