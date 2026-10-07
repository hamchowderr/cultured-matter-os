import { describe, expect, it } from 'vitest';
import { onPageText } from '../../src/mastra/lib/wordpress-pages';

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
