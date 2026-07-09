/**
 * sanitize — HTML-to-plain-text and word-capped summary tests.
 */

import { htmlToText, summarize } from './sanitize';

describe('htmlToText', () => {
  it('strips tags, decodes named entities, and removes script content', () => {
    expect(htmlToText('<p>Kabinet &amp; stikstof<script>x()</script></p>')).toBe(
      'Kabinet & stikstof'
    );
  });

  it('converts block-level tag closes to spaces rather than collapsing text', () => {
    expect(htmlToText('<p>Eerste</p><p>Tweede</p>')).toBe('Eerste Tweede');
  });

  it('decodes numeric HTML entities', () => {
    expect(htmlToText('&#169; 2026')).toBe('© 2026');
  });

  it('returns empty string for null input', () => {
    expect(htmlToText(null)).toBe('');
  });

  it('returns empty string for undefined input', () => {
    expect(htmlToText(undefined)).toBe('');
  });
});

describe('summarize', () => {
  it('returns text unchanged when word count is within maxWords', () => {
    expect(summarize('kort stuk tekst', 50)).toBe('kort stuk tekst');
  });

  it('caps a 200-word input to maxWords words and appends " …"', () => {
    const words = Array.from({ length: 200 }, (_, i) => `word${i}`);
    const result = summarize(words.join(' '), 50);
    expect(result.endsWith(' …')).toBe(true);
    expect(result.split(' ')).toHaveLength(51); // 50 words + '…'
  });

  it('never cuts mid-word', () => {
    const words = Array.from({ length: 200 }, (_, i) => `word${i}`);
    const result = summarize(words.join(' '), 50);
    expect(result).toContain('word49 …');
    expect(result).not.toContain('word50');
  });

  it('returns empty string for null input', () => {
    expect(summarize(null)).toBe('');
  });
});
