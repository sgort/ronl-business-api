// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import RollenSection from './RollenSection';

const mockUseProfielData = vi.hoisted(() => vi.fn());
vi.mock('../../hooks/useProfielData', () => ({ useProfielData: mockUseProfielData }));

beforeEach(() => {
  mockUseProfielData.mockReturnValue({ data: null, loading: false, error: null, load: vi.fn() });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('RollenSection', () => {
  it('falls back to JWT roles with their descriptions when there is no onboarding profile', () => {
    render(<RollenSection user={{ sub: '1', roles: ['caseworker', 'admin'] } as never} />);

    expect(screen.getByText('caseworker')).toBeInTheDocument();
    expect(screen.getByText('Behandelen van aanvragen en zaken')).toBeInTheDocument();
    expect(screen.getByText('admin')).toBeInTheDocument();
    expect(screen.getByText('Beheerder')).toBeInTheDocument();
  });

  it('shows a loading skeleton while the onboarding profile loads', () => {
    mockUseProfielData.mockReturnValue({ data: null, loading: true, error: null, load: vi.fn() });
    const { container } = render(
      <RollenSection user={{ sub: '1', employeeId: 'e1', roles: [] } as never} />
    );
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
  });

  it("prefers the onboarding profile's assignedRoles over JWT roles once loaded", () => {
    mockUseProfielData.mockReturnValue({
      data: { assignedRoles: 'rip-planner, rip-inkoop' },
      loading: false,
      error: null,
      load: vi.fn(),
    });
    render(<RollenSection user={{ sub: '1', employeeId: 'e1', roles: ['caseworker'] } as never} />);

    expect(screen.getByText('rip-planner')).toBeInTheDocument();
    expect(screen.getByText('rip-inkoop')).toBeInTheDocument();
    expect(screen.queryByText('caseworker')).not.toBeInTheDocument();
  });

  it('shows the access level badge and its description when present', () => {
    mockUseProfielData.mockReturnValue({
      data: { accessLevel: 'uitgebreid' },
      loading: false,
      error: null,
      load: vi.fn(),
    });
    render(<RollenSection user={{ sub: '1', employeeId: 'e1', roles: [] } as never} />);

    expect(screen.getByText('uitgebreid')).toBeInTheDocument();
    expect(screen.getByText('Uitgebreide toegang inclusief rapportages')).toBeInTheDocument();
  });

  it('shows a hint to link an employee ID when there is no profile and none is set', () => {
    render(<RollenSection user={{ sub: '1', roles: [] } as never} />);
    expect(screen.getByText(/Koppel uw medewerker-ID via/)).toBeInTheDocument();
  });
});
