import { getFluentTools, type PreviewableTool, WORDPRESS_WRITE_TOOLS } from './fluent';

/**
 * # What an approval card previews (Cultured Matter)
 *
 * The chat server's `approvalPreview` (routes/types.ts): before a write's approval card is
 * sent, it asks what the call would change, so the card can show before and after instead
 * of the model's arguments alone. It never changes anything:
 *
 * - Fluent Forms and Fluent Booking writes run the plugin's own dry run (the same one the
 *   tool runs again after approval; lib/fluent.ts): old and new recipient, fields added and
 *   removed, styling from → to, the booking it would make.
 * - A page update runs the page tool's dry run (lib/wordpress-pages.ts): the page's address,
 *   whether it is published, and each block's text before and after.
 * - upsert-contact reads the contact as it is now (get-contact), or says there is none yet.
 *
 * Other tools get no preview (undefined): their card shows the arguments. The app's card
 * renderers (components/chat/approval-views.tsx) turn these into plain words.
 */
export async function approvalPreview({
  toolName,
  args,
}: {
  toolName: string;
  args: unknown;
}): Promise<unknown> {
  if (!WORDPRESS_WRITE_TOOLS.includes(toolName)) return undefined;
  const tool = (await getFluentTools())[toolName] as PreviewableTool | undefined;
  return tool?.preview ? tool.preview(args) : undefined;
}
