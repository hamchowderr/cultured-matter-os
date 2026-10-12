import { describe, expect, it } from 'vitest';
import { approvalPreview } from '../../src/mastra/lib/approval-preview';

/**
 * lib/approval-preview.ts: only WordPress writes are previewed (the tools' own preview
 * methods are tested against the mock in fluent.test.ts); everything else gets none, and
 * with WordPress not configured there is nothing to preview.
 */
describe('approvalPreview', () => {
  it('previews nothing for app actions or reads', async () => {
    expect(await approvalPreview({ toolName: 'createTask', args: { title: 'x' } })).toBeUndefined();
    expect(
      await approvalPreview({ toolName: 'fluent-crm-list-contacts', args: {} }),
    ).toBeUndefined();
  });

  it('previews nothing when WordPress is not configured', async () => {
    expect(
      await approvalPreview({ toolName: 'fluent-crm-upsert-contact', args: { email: 'a@b.c' } }),
    ).toBeUndefined();
  });
});
