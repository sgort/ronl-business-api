// packages/public-site/src/lib/search.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { highlight, truncate } from './search';

describe('highlight', () => {
  it('wraps matching terms (3+ chars) in <mark>, case-insensitively', () => {
    const { container } = render(<>{highlight('Zorgtoeslag aanvragen', 'zorg')}</>);
    const mark = container.querySelector('mark');
    expect(mark?.textContent).toBe('Zorg');
  });

  it('ignores terms shorter than 3 characters (matches the prototype)', () => {
    const { container } = render(<>{highlight('De aanvraag', 'de')}</>);
    expect(container.querySelector('mark')).toBeNull();
  });

  it('returns the plain text unchanged when the query is empty', () => {
    const { container } = render(<>{highlight('Plain text', '')}</>);
    expect(container.querySelector('mark')).toBeNull();
    expect(container.textContent).toBe('Plain text');
  });

  it('never throws on regex metacharacters and never renders them as regex', () => {
    expect(() => render(<>{highlight('Cost: $100 (approx.)', '$100 (approx.)')}</>)).not.toThrow();
  });

  it('handles an empty/null text gracefully', () => {
    const { container } = render(<>{highlight('', 'zorg')}</>);
    expect(container.textContent).toBe('');
  });
});

describe('truncate', () => {
  it('leaves short text untouched', () => {
    expect(truncate('short', 210)).toBe('short');
  });

  it('cuts long text and appends an ellipsis', () => {
    const long = 'a'.repeat(300);
    const result = truncate(long, 210);
    expect(result).toHaveLength(211); // 210 chars + …
    expect(result.endsWith('…')).toBe(true);
  });
});
