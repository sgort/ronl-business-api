// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import BoardPreview from './BoardPreview';

describe('BoardPreview', () => {
  it.each([
    ['pa', 'pv-pa'],
    ['infra', 'pv-infra'],
    ['woo', 'pv-woo'],
    ['case', 'pv-case'],
  ] as const)('renders the %s preview variant', (kind, className) => {
    const { container } = render(<BoardPreview kind={kind} />);
    expect(container.querySelector(`.${className}`)).not.toBeNull();
  });

  it('falls back to the case preview for an unrecognised kind', () => {
    const { container } = render(<BoardPreview kind={'unknown' as never} />);
    expect(container.querySelector('.pv-case')).not.toBeNull();
  });
});
