// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProcesBibliotheek from './ProcesBibliotheek';
import type { ProcessBundle } from '../../services/api';

const mockPublic = vi.hoisted(() => vi.fn());
vi.mock('../../services/api', () => ({ ldeApi: { bundles: { public: mockPublic } } }));

function makeBundle(overrides: Partial<ProcessBundle> = {}): ProcessBundle {
  return {
    id: 'b1',
    bpmnProcessId: 'DvtpToestemmingGevenProcess',
    name: 'DvTP toestemming geven',
    description: 'Toestemmingsprocedure voor private dienstverleners.',
    processRole: 'caseworker',
    status: 'active',
    boardOwner: 'caseworker',
    deployedAt: '2026-06-01T00:00:00Z',
    operatonUrl: 'https://operaton.example.test',
    operatonDeploymentId: 'dep-1',
    linkedDmnTemplates: [],
    deployedForms: [],
    deployedDocuments: [],
    subprocesses: [],
    ...overrides,
  };
}

beforeEach(() => {
  mockPublic.mockResolvedValue({ success: true, data: [] });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ProcesBibliotheek', () => {
  it('shows an empty state when there are no deployed bundles', async () => {
    render(<ProcesBibliotheek />);
    expect(await screen.findByText('No deployed processes found.')).toBeInTheDocument();
  });

  it('shows an error state and "Retry" reloads', async () => {
    mockPublic.mockResolvedValue({ success: false });
    const user = userEvent.setup();
    render(<ProcesBibliotheek />);

    expect(await screen.findByText('Process library could not be loaded.')).toBeInTheDocument();

    mockPublic.mockResolvedValue({ success: true, data: [makeBundle()] });
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('DvTP toestemming geven')).toBeInTheDocument();
  });

  it('renders a bundle card with its badges and the pluralized count footer', async () => {
    mockPublic.mockResolvedValue({ success: true, data: [makeBundle()] });
    render(<ProcesBibliotheek />);

    expect(await screen.findByText('DvTP toestemming geven')).toBeInTheDocument();
    expect(screen.getByText('DvtpToestemmingGevenProcess')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    // boardOwner and processRole are both 'caseworker' on the fixture — two badges.
    expect(screen.getAllByText('caseworker')).toHaveLength(2);
    expect(screen.getByText('1 process')).toBeInTheDocument();
  });

  it('falls back to the bpmnProcessId when the bundle name is blank', async () => {
    mockPublic.mockResolvedValue({
      success: true,
      data: [makeBundle({ name: '  ', bpmnProcessId: 'RawProcessId' })],
    });
    render(<ProcesBibliotheek />);
    expect(await screen.findByText('RawProcessId')).toBeInTheDocument();
  });

  it('a bundle with no forms/documents/subprocesses/dmn is not expandable', async () => {
    mockPublic.mockResolvedValue({ success: true, data: [makeBundle()] });
    render(<ProcesBibliotheek />);

    const toggle = await screen.findByRole('button', { name: /DvTP toestemming geven/ });
    expect(toggle).toBeDisabled();
  });

  it('expanding a bundle with detail shows its forms, documents, subprocesses, and DMN templates', async () => {
    mockPublic.mockResolvedValue({
      success: true,
      data: [
        makeBundle({
          deployedForms: [{ id: 'f1', name: 'Aanvraagformulier' }],
          deployedDocuments: [{ id: 'd1', name: 'Beschikking' }],
          subprocesses: [{ id: 'sp1', name: 'Subproces A', bpmnProcessId: 'SubA', status: 'wip' }],
          linkedDmnTemplates: ['dmn-rules-1'],
        }),
      ],
    });
    const user = userEvent.setup();
    render(<ProcesBibliotheek />);

    await user.click(await screen.findByRole('button', { name: /DvTP toestemming geven/ }));

    expect(screen.getByText('Forms')).toBeInTheDocument();
    expect(screen.getByText('Aanvraagformulier')).toBeInTheDocument();
    expect(screen.getByText('Documents')).toBeInTheDocument();
    expect(screen.getByText('Beschikking')).toBeInTheDocument();
    expect(screen.getByText('Subprocesses')).toBeInTheDocument();
    expect(screen.getByText('Subproces A')).toBeInTheDocument();
    expect(screen.getByText('DMN Templates')).toBeInTheDocument();
    expect(screen.getByText('dmn-rules-1')).toBeInTheDocument();
    expect(screen.getByText('dep-1')).toBeInTheDocument();
  });
});
