// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import AltchaWidget from './AltchaWidget';

function fireStateChange(el: Element, detail: { payload: string | null; state: string }) {
  el.dispatchEvent(new CustomEvent('statechange', { detail }));
}

describe('AltchaWidget', () => {
  it('renders the altcha-widget custom element with the challenge and hidden footer/logo', () => {
    const { container } = render(
      <AltchaWidget challengeUrl="https://example.com/challenge" onVerify={vi.fn()} />
    );

    const el = container.querySelector('altcha-widget');
    expect(el).not.toBeNull();
    expect(el?.getAttribute('challenge')).toBe('https://example.com/challenge');
    expect(el?.getAttribute('configuration')).toBe(
      JSON.stringify({ hideFooter: true, hideLogo: true })
    );
  });

  it('calls onVerify with the payload when the widget reports "verified"', () => {
    const onVerify = vi.fn();
    const { container } = render(
      <AltchaWidget challengeUrl="https://example.com/challenge" onVerify={onVerify} />
    );

    fireStateChange(container.querySelector('altcha-widget')!, {
      state: 'verified',
      payload: 'signed-payload',
    });

    expect(onVerify).toHaveBeenCalledWith('signed-payload');
  });

  it('does not call onVerify when "verified" fires without a payload', () => {
    const onVerify = vi.fn();
    const { container } = render(
      <AltchaWidget challengeUrl="https://example.com/challenge" onVerify={onVerify} />
    );

    fireStateChange(container.querySelector('altcha-widget')!, {
      state: 'verified',
      payload: null,
    });

    expect(onVerify).not.toHaveBeenCalled();
  });

  it.each(['expired', 'error'])('calls onExpire when the widget reports "%s"', (state) => {
    const onExpire = vi.fn();
    const { container } = render(
      <AltchaWidget
        challengeUrl="https://example.com/challenge"
        onVerify={vi.fn()}
        onExpire={onExpire}
      />
    );

    fireStateChange(container.querySelector('altcha-widget')!, { state, payload: null });

    expect(onExpire).toHaveBeenCalled();
  });

  it('does not throw when "expired" fires and no onExpire was provided', () => {
    const { container } = render(
      <AltchaWidget challengeUrl="https://example.com/challenge" onVerify={vi.fn()} />
    );

    expect(() =>
      fireStateChange(container.querySelector('altcha-widget')!, {
        state: 'expired',
        payload: null,
      })
    ).not.toThrow();
  });
});
