import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

// A Today block in the kit dashboard's card style: title, optional line under it, and a link
// to the screen where the whole list lives.
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
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
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
