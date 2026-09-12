// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProfielSection from './ProfielSection';

const mockLoad = vi.hoisted(() => vi.fn());
const mockUseProfielData = vi.hoisted(() => vi.fn());
vi.mock('../../hooks/useProfielData', () => ({ useProfielData: mockUseProfielData }));

beforeEach(() => {
  mockUseProfielData.mockReturnValue({
    data: undefined,
    loading: false,
    error: null,
    load: mockLoad,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ProfielSection — personal data', () => {
  it('renders only the fields that are set, mapping a known LOA to its label', () => {
    render(
      <ProfielSection
        user={
          {
            sub: '1',
            name: 'Sanne Bakker',
            preferred_username: 'sbakker',
            loa: 'substantieel',
            roles: ['caseworker'],
          } as never
        }
        tenantConfig={null}
      />
    );

    expect(screen.getByText('Sanne Bakker')).toBeInTheDocument();
    expect(screen.getByText('sbakker')).toBeInTheDocument();
    expect(screen.getByText('Substantieel')).toBeInTheDocument();
    expect(screen.getByText('caseworker')).toBeInTheDocument();
    expect(screen.queryByText('Medewerker-ID')).not.toBeInTheDocument();
  });

  it('falls back to the raw LOA value when it has no known label', () => {
    render(
      <ProfielSection
        user={{ sub: '1', loa: 'weird-level', roles: [] } as never}
        tenantConfig={null}
      />
    );
    expect(screen.getByText('weird-level')).toBeInTheDocument();
  });

  it("prefers tenantConfig.displayName over the user's municipality field", () => {
    render(
      <ProfielSection
        user={{ sub: '1', municipality: 'Almere', roles: [] } as never}
        tenantConfig={{ displayName: 'Gemeente Almere' } as never}
      />
    );
    expect(screen.getByText('Gemeente Almere')).toBeInTheDocument();
  });
});

describe('ProfielSection — onboarding data', () => {
  it('shows a loading skeleton', () => {
    mockUseProfielData.mockReturnValue({
      data: undefined,
      loading: true,
      error: null,
      load: mockLoad,
    });
    const { container } = render(
      <ProfielSection
        user={{ sub: '1', employeeId: 'e1', roles: [] } as never}
        tenantConfig={null}
      />
    );
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
  });

  it('shows an error message', () => {
    mockUseProfielData.mockReturnValue({
      data: undefined,
      loading: false,
      error: 'Onboardingprofiel kon niet worden geladen.',
      load: mockLoad,
    });
    render(
      <ProfielSection
        user={{ sub: '1', employeeId: 'e1', roles: [] } as never}
        tenantConfig={null}
      />
    );
    expect(screen.getByText('Onboardingprofiel kon niet worden geladen.')).toBeInTheDocument();
  });

  it('with no employeeId and showManualFetch, lets the user enter one and fetch on click', async () => {
    const user = userEvent.setup();
    render(<ProfielSection user={{ sub: '1', roles: [] } as never} tenantConfig={null} />);

    await user.type(screen.getByPlaceholderText('bijv. emp-001'), '  emp-002  ');
    await user.click(screen.getByRole('button', { name: 'Ophalen' }));

    expect(mockLoad).toHaveBeenCalledWith('emp-002');
  });

  it('fetching via Enter key works too, and the button is disabled when the input is empty', async () => {
    const user = userEvent.setup();
    render(<ProfielSection user={{ sub: '1', roles: [] } as never} tenantConfig={null} />);

    expect(screen.getByRole('button', { name: 'Ophalen' })).toBeDisabled();

    await user.type(screen.getByPlaceholderText('bijv. emp-001'), 'emp-003{Enter}');

    expect(mockLoad).toHaveBeenCalledWith('emp-003');
  });

  it('with showManualFetch=false and no employeeId, shows a plain message instead of the input', () => {
    render(
      <ProfielSection
        user={{ sub: '1', roles: [] } as never}
        tenantConfig={null}
        showManualFetch={false}
      />
    );
    expect(screen.getByText('Geen onboardingprofiel gevonden.')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('bijv. emp-001')).not.toBeInTheDocument();
  });

  it('shows the hr-medewerker hint only for users with that role, when no profile exists', () => {
    mockUseProfielData.mockReturnValue({ data: null, loading: false, error: null, load: mockLoad });
    const { rerender } = render(
      <ProfielSection
        user={{ sub: '1', employeeId: 'e1', roles: ['hr-medewerker'] } as never}
        tenantConfig={null}
      />
    );
    expect(screen.getByText('Medewerker onboarden')).toBeInTheDocument();

    rerender(
      <ProfielSection
        user={{ sub: '1', employeeId: 'e1', roles: ['caseworker'] } as never}
        tenantConfig={null}
      />
    );
    expect(screen.queryByText('Medewerker onboarden')).not.toBeInTheDocument();
  });

  it('renders the onboarding profile fields and the "voltooid" badge when data is present', () => {
    mockUseProfielData.mockReturnValue({
      data: {
        firstName: 'Sanne',
        lastName: 'Bakker',
        department: 'Sociaal domein',
        jobFunction: 'Adviseur',
        accessLevel: 'basis',
        assignedRoles: 'caseworker',
      },
      loading: false,
      error: null,
      load: mockLoad,
    });
    render(
      <ProfielSection
        user={{ sub: '1', employeeId: 'e1', roles: [] } as never}
        tenantConfig={null}
      />
    );

    expect(screen.getByText('Onboarding voltooid')).toBeInTheDocument();
    expect(screen.getByText('Bakker')).toBeInTheDocument();
    expect(screen.getByText('Sociaal domein')).toBeInTheDocument();
  });
});
