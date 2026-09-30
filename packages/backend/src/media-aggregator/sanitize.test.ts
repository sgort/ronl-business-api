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

  it('decodes hexadecimal HTML entities', () => {
    expect(htmlToText('&#x20AC; 5')).toBe('€ 5');
  });

  it('replaces an out-of-range numeric entity with U+FFFD', () => {
    expect(htmlToText('a&#x110000;b')).toBe('a�b');
  });

  it('leaves an unknown named entity as written', () => {
    expect(htmlToText('&bogus; tekst')).toBe('&bogus; tekst');
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

  it('returns empty string when the input is markup only', () => {
    expect(summarize('<p><br/></p>')).toBe('');
  });

  it('caps at 50 words when maxWords is not given', () => {
    const words = Array.from({ length: 60 }, (_, i) => `word${i}`);
    expect(summarize(words.join(' ')).split(' ')).toHaveLength(51);
  });
});
