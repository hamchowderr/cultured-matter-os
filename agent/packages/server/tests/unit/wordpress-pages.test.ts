import { describe, expect, it } from 'vitest';
import { onPageText, resolveAgainstPage } from '../../src/mastra/lib/wordpress-pages';

/**
 * lib/wordpress-pages.ts's typography allowance: a card whose `before` differs from the page
 * only in quotes and dashes the model typed plainly. (The update-page flow itself is tested
 * against the mock in fluent.test.ts.)
 */
describe('onPageText', () => {
  const page = 'We’re a <em>creative sustainability agency</em> designed to shift culture.';

  it('takes the card as is when its before is exactly the page', () => {
    expect(onPageText(page, `${page} (test)`, page)).toBe(`${page} (test)`);
  });

  it('applies the edit to the page text when the model typed a curly apostrophe plainly', () => {
    const typed = "We're a <em>creative sustainability agency</em> designed to shift culture.";
    expect(onPageText(typed, `${typed} (test)`, page)).toBe(`${page} (test)`);
  });

  it('keeps curly quotes and dashes outside the edited words', () => {
    expect(onPageText('It\'s "now" - here', 'It\'s "later" - here', 'It’s “now” – here')).toBe(
      'It’s “later” – here',
    );
  });

  it('refuses when the page says something else', () => {
    expect(onPageText('Work with us.', 'Work with us today.', 'Join us.')).toBeNull();
  });
});

describe('resolveAgainstPage: the card names the right page and says whether it goes live', () => {
  const change = { path: '10.0.0', before: { text: 'Old' }, after: { text: 'New' } };
  const dry = (over: Record<string, unknown>) => ({
    id: 60,
    status: 'draft',
    path: '/agent-path-test',
    changes: [{ path: '10.0.0', before: { text: 'Old' }, after: { text: 'New' } }],
    ...over,
  });

  it('matches a draft at its future address, not live', () => {
    const { problems, resolved } = resolveAgainstPage(
      { id: 60, page: '/agent-path-test', live: false, changes: [change] },
      dry({}),
    );
    expect(problems).toEqual([]);
    expect(resolved.changes).toEqual([{ path: '10.0.0', after: { text: 'New' } }]);
  });

  it('refuses a card that says "not live" for a published page, and the reverse', () => {
    const card = { id: 60, page: '/agent-path-test', changes: [change] };
    expect(
      resolveAgainstPage({ ...card, live: false }, dry({ status: 'publish' })).problems,
    ).toEqual(['Page 60 is published: the change would show on the site straight away.']);
    expect(resolveAgainstPage({ ...card, live: true }, dry({})).problems).toEqual([
      'Page 60 is not published (status draft): the change would not show on the site.',
    ]);
  });

  it('a page with no address yet (path null) is named "none"', () => {
    const card = { id: 60, live: false, changes: [change] };
    expect(resolveAgainstPage({ ...card, page: 'none' }, dry({ path: null })).problems).toEqual([]);
    expect(resolveAgainstPage({ ...card, page: '/' }, dry({ path: null })).problems).toEqual([
      'Page 60 has no address yet.',
    ]);
  });
});
