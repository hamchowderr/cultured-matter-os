import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";

export function Section({
  title,
  href,
  linkLabel,
  children
}: {
  title: string;
  href: string;
  linkLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Link
          href={href}
          className="text-muted-foreground inline-flex items-center gap-1 text-sm hover:underline"
        >
          {linkLabel}
          <ArrowRightIcon className="size-3.5" />
        </Link>
      </div>
      {children}
    </section>
  );
}
