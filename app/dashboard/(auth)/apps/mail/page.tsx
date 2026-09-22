import { generateMeta } from "@/lib/utils";

import { Mail } from "./components/mail";
import { mails } from "./data";
import { cookies } from "next/headers";

export async function generateMetadata() {
  return generateMeta({
    title: "Mail App",
    description:
      "Easily organize incoming and outgoing mail with the mail management template. Built with shadcn/ui, Next.js and Tailwind CSS.",
    canonical: "/apps/mail"
  });
}

export default async function MailPage() {
  const cookieID = "react-resizable-panels:layout:mail-app"
  const collapsedCookieID = "react-resizable-panels:collapsed"

  const layout = (await cookies()).get(cookieID);
  const defaultLayout = layout ? JSON.parse(layout.value) : undefined;
  const collapsed = (await cookies()).get(collapsedCookieID);
  const defaultCollapsed = collapsed ? JSON.parse(collapsed.value) : undefined;

  return (
    <div className="h-(--content-full-height) rounded-md border">
      <Mail mails={mails} defaultLayout={defaultLayout} cookieID={cookieID} defaultCollapsed={defaultCollapsed} collapsedCookieID={collapsedCookieID} />
    </div>
  );
}
