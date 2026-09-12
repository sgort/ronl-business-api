// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SigningPanel from './SigningPanel';

const mockCreatePackage = vi.hoisted(() => vi.fn());
const mockStatus = vi.hoisted(() => vi.fn());
const mockGetBaseUrl = vi.hoisted(() => vi.fn());
vi.mock('../../services/api', () => ({
  businessApi: {
    validsign: { createPackage: mockCreatePackage, status: mockStatus },
    getBaseUrl: mockGetBaseUrl,
  },
}));

const spec = { required: true as const, templateId: 'rip-pdp', status: 'none' as const };

describe('SigningPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBaseUrl.mockReturnValue('http://localhost:3002/v1');
  });
  afterEach(() => vi.useRealTimers());

  it('publishes the backend mode on the panel, so a test can refuse before requesting', () => {
    const { container, rerender } = render(
      <SigningPanel taskId="t1" spec={{ ...spec, stubMode: true }} onCompleted={vi.fn()} />
    );
    expect(container.querySelector('.pb-sign-panel')).toHaveAttribute(
      'data-validsign-stub',
      'true'
    );

    // The distinction that matters: the E2E journey refuses to click when this
    // is anything but "true", because by the time a live ceremony URL exists a
    // real ValidSign package has already been created against the licence.
    rerender(
      <SigningPanel taskId="t1" spec={{ ...spec, stubMode: false }} onCompleted={vi.fn()} />
    );
    expect(container.querySelector('.pb-sign-panel')).toHaveAttribute(
      'data-validsign-stub',
      'false'
    );

    // An older backend omits the field entirely; that must not read as stub.
    rerender(<SigningPanel taskId="t1" spec={spec} onCompleted={vi.fn()} />);
    expect(container.querySelector('.pb-sign-panel')).toHaveAttribute(
      'data-validsign-stub',
      'false'
    );
  });

  it('offers both delivery routes before anything is created', () => {
    render(<SigningPanel taskId="t1" spec={spec} onCompleted={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Onderteken nu/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Stuur per e-mail/ })).toBeTruthy();
  });

  it('shows the ceremony iframe once a package exists', async () => {
    mockCreatePackage.mockResolvedValue({
      success: true,
      data: { packageId: 'pkg-1', signingUrl: '/v1/validsign/stub/ceremony/pkg-1' },
    });
    render(<SigningPanel taskId="t1" spec={spec} onCompleted={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /Onderteken nu/ }));
    await waitFor(() => {
      const frame = document.querySelector('iframe.pb-sign-frame') as HTMLIFrameElement;
      expect(frame.src).toContain('/v1/validsign/stub/ceremony/pkg-1');
    });
  });

  it('names the recipient on the email route, because it is the claimant', async () => {
    mockCreatePackage.mockResolvedValue({
      success: true,
      data: { packageId: 'pkg-1', sentTo: 'pl@flevoland.nl' },
    });
    render(<SigningPanel taskId="t1" spec={spec} onCompleted={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /Stuur per e-mail/ }));
    await waitFor(() => expect(screen.getByText(/pl@flevoland\.nl/)).toBeTruthy());
  });

  it('calls onCompleted when polling reports completion, and sets no message itself', async () => {
    mockCreatePackage.mockResolvedValue({
      success: true,
      data: { packageId: 'pkg-1', signingUrl: '/x' },
    });
    mockStatus.mockResolvedValue({ success: true, data: { status: 'completed' } });
    const onCompleted = vi.fn();
    render(<SigningPanel taskId="t1" spec={spec} onCompleted={onCompleted} />);
    await userEvent.click(screen.getByRole('button', { name: /Onderteken nu/ }));
    await waitFor(() => expect(onCompleted).toHaveBeenCalled(), { timeout: 5000 });
    expect(screen.queryByText(/Taak voltooid/)).toBeNull();
  });

  it('reports a decline as an outcome rather than an error', async () => {
    mockCreatePackage.mockResolvedValue({
      success: true,
      data: { packageId: 'p', signingUrl: '/x' },
    });
    mockStatus.mockResolvedValue({ success: true, data: { status: 'declined' } });
    const onCompleted = vi.fn();
    render(<SigningPanel taskId="t1" spec={spec} onCompleted={onCompleted} />);
    await userEvent.click(screen.getByRole('button', { name: /Onderteken nu/ }));
    await waitFor(() => expect(screen.getByText(/niet akkoord/i)).toBeTruthy());
    expect(screen.queryByText(/mislukt/i)).toBeNull();
  });

  it('stops polling when unmounted', async () => {
    mockCreatePackage.mockResolvedValue({
      success: true,
      data: { packageId: 'p', signingUrl: '/x' },
    });
    mockStatus.mockResolvedValue({ success: true, data: { status: 'sent' } });
    const { unmount } = render(<SigningPanel taskId="t1" spec={spec} onCompleted={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /Onderteken nu/ }));
    await waitFor(() => expect(mockStatus).toHaveBeenCalled());
    const callsAtUnmount = mockStatus.mock.calls.length;
    unmount();
    await new Promise((r) => setTimeout(r, 3500));
    expect(mockStatus.mock.calls.length).toBe(callsAtUnmount);
  });

  it('stops silently polling and surfaces an error after repeated status-poll failures', async () => {
    mockCreatePackage.mockResolvedValue({
      success: true,
      data: { packageId: 'p', signingUrl: '/x' },
    });
    // Every poll fails the same way a persistently unreachable status
    // endpoint would (res.success: false) -- the exact silent-forever case
    // this guards against.
    mockStatus.mockResolvedValue({
      success: false,
      error: { code: 'SIGNATURE_STATUS_FAILED', message: 'boom' },
    });
    render(<SigningPanel taskId="t1" spec={spec} onCompleted={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /Onderteken nu/ }));
    await waitFor(() => expect(screen.getByText(/status.*niet worden opgehaald/i)).toBeTruthy(), {
      timeout: 10000,
    });
    // No retry button: retrying cannot fix an unreachable status endpoint.
    expect(screen.queryByRole('button', { name: /Opnieuw proberen/ })).toBeNull();
    const callsAtError = mockStatus.mock.calls.length;
    // Entering the error state stops polling entirely -- it is not silent
    // failure with the panel spinning forever underneath the message.
    await new Promise((r) => setTimeout(r, 3500));
    expect(mockStatus.mock.calls.length).toBe(callsAtError);
  }, 15000);

  it('does not surface an error on a single transient poll failure', async () => {
    mockCreatePackage.mockResolvedValue({
      success: true,
      data: { packageId: 'p', signingUrl: '/x' },
    });
    mockStatus
      .mockRejectedValueOnce(new Error('network blip'))
      .mockResolvedValue({ success: true, data: { status: 'sent' } });
    render(<SigningPanel taskId="t1" spec={spec} onCompleted={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /Onderteken nu/ }));
    await waitFor(() => expect(mockStatus).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 3200));
    expect(screen.queryByText(/status.*niet worden opgehaald/i)).toBeNull();
  }, 10000);

  it('offers no retry on a 422 — the signer has no email claim, which retrying cannot fix', async () => {
    mockCreatePackage.mockResolvedValue({
      success: false,
      error: {
        code: 'MISSING_SIGNER_EMAIL',
        message: 'The signed-in user has no email claim on their token',
      },
    });
    render(<SigningPanel taskId="t1" spec={spec} onCompleted={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /Onderteken nu/ }));
    await waitFor(() => expect(screen.getByText(/beheerder/i)).toBeTruthy());
    expect(screen.queryByRole('button', { name: /Opnieuw proberen/ })).toBeNull();
  });

  it('names the invalid request on a 400, and still offers retry', async () => {
    mockCreatePackage.mockResolvedValue({
      success: false,
      error: { code: 'INVALID_DELIVERY', message: "delivery must be 'embedded' or 'email'" },
    });
    render(<SigningPanel taskId="t1" spec={spec} onCompleted={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /Onderteken nu/ }));
    await waitFor(() => expect(screen.getByText(/embedded.*email/)).toBeTruthy());
    expect(screen.getByRole('button', { name: /Opnieuw proberen/ })).toBeTruthy();
  });

  it('falls back to a generic retryable message on anything else (e.g. a 500)', async () => {
    mockCreatePackage.mockResolvedValue({
      success: false,
      error: { code: 'SIGNATURE_PACKAGE_FAILED', message: 'Failed to create signature package' },
    });
    render(<SigningPanel taskId="t1" spec={spec} onCompleted={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /Onderteken nu/ }));
    await waitFor(() => expect(screen.getByText(/mislukt/i)).toBeTruthy());
    expect(screen.getByRole('button', { name: /Opnieuw proberen/ })).toBeTruthy();
  });

  it('does not offer to create a second package when reopened on an in-flight email package', () => {
    // GET /spec never returns the recipient for the email route, but the
    // status is still 'sent' — the panel must not fall through to idle and
    // offer both creation buttons again, which would fire a second real
    // signature request.
    const inFlightEmailSpec = {
      required: true as const,
      templateId: 'rip-pdp',
      status: 'sent' as const,
      packageId: 'pkg-1',
    };
    render(<SigningPanel taskId="t1" spec={inFlightEmailSpec} onCompleted={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Onderteken nu/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Stuur per e-mail/ })).toBeNull();
  });

  it('does not poll again when the parent re-renders with a fresh onCompleted closure', async () => {
    mockCreatePackage.mockResolvedValue({
      success: true,
      data: { packageId: 'p', signingUrl: '/x' },
    });
    mockStatus.mockResolvedValue({ success: true, data: { status: 'sent' } });

    function Wrapper() {
      const [n, setN] = useState(0);
      return (
        <div>
          <button onClick={() => setN((x) => x + 1)}>rerender {n}</button>
          {/* A fresh closure every render, on purpose — this is what
              ProjectDetail's onCompleted={() => onDone(task)} does. */}
          <SigningPanel taskId="t1" spec={spec} onCompleted={() => {}} />
        </div>
      );
    }

    render(<Wrapper />);
    await userEvent.click(screen.getByRole('button', { name: /Onderteken nu/ }));
    await waitFor(() => expect(mockStatus).toHaveBeenCalledTimes(1));

    const rerender = screen.getByRole('button', { name: /rerender/ });
    await userEvent.click(rerender);
    await userEvent.click(rerender);
    await userEvent.click(rerender);

    // Give any errant effect re-run a tick to fire before asserting.
    await new Promise((r) => setTimeout(r, 50));
    expect(mockStatus).toHaveBeenCalledTimes(1);
  });

  it('resolves a relative signingUrl against the API origin, not the frontend origin — the actual bug', async () => {
    // Regression test for the real deploy failure: a relative signingUrl
    // put straight into an iframe resolves against the FRONTEND's own
    // origin (jsdom's default document origin here, http://localhost:3000),
    // which is exactly what made the earlier "shows the ceremony iframe"
    // test's toContain(...) assertion pass even though the bug was live —
    // an iframe.src getter resolves relative attributes against ANY base,
    // so the substring still matched. Asserting the full src against the
    // API's origin is the only way this actually catches it.
    mockGetBaseUrl.mockReturnValue('http://localhost:3002/v1');
    mockCreatePackage.mockResolvedValue({
      success: true,
      data: { packageId: 'pkg-1', signingUrl: '/v1/validsign/stub/ceremony/pkg-1' },
    });
    render(<SigningPanel taskId="t1" spec={spec} onCompleted={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /Onderteken nu/ }));
    await waitFor(() => {
      const frame = document.querySelector('iframe.pb-sign-frame') as HTMLIFrameElement;
      expect(frame.src).toBe('http://localhost:3002/v1/validsign/stub/ceremony/pkg-1');
    });
  });
});
