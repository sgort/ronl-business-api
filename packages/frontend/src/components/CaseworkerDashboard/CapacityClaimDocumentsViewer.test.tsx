// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CapacityClaimDocumentsViewer from './CapacityClaimDocumentsViewer';

const mockBusinessApi = vi.hoisted(() => ({
  capacityClaim: { documents: vi.fn() },
}));
vi.mock('../../services/api', () => ({ businessApi: mockBusinessApi }));

const template = {
  id: 't1',
  name: 'Decision notification',
  zones: {
    letterhead: {
      blocks: [
        {
          type: 'text',
          content: {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Gemeente Almere' }] }],
          },
        },
      ],
    },
    contactInformation: { blocks: [] },
    reference: { blocks: [] },
    body: {
      blocks: [
        { type: 'variable', variableKey: 'jobTitle' },
        { type: 'separator' },
        {
          type: 'text',
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Goedgekeurd', marks: [{ type: 'bold' }] }],
              },
            ],
          },
        },
      ],
    },
    closing: { blocks: [] },
    signOff: { blocks: [] },
    annex: null,
  },
};

beforeEach(() => {
  mockBusinessApi.capacityClaim.documents.mockResolvedValue({
    success: true,
    data: {
      variables: { jobTitle: 'Senior beleidsadviseur' },
      boardDecisionNotification: template,
      capacityClaimHandover: null,
    },
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('CapacityClaimDocumentsViewer', () => {
  it('shows a loading message before the documents resolve', () => {
    mockBusinessApi.capacityClaim.documents.mockReturnValue(new Promise(() => {}));
    render(<CapacityClaimDocumentsViewer instanceId="pi-1" />);
    expect(screen.getByText('Loading documents…')).toBeInTheDocument();
  });

  it('shows an error message when loading fails', async () => {
    mockBusinessApi.capacityClaim.documents.mockResolvedValue({ success: false });
    render(<CapacityClaimDocumentsViewer instanceId="pi-1" />);
    expect(await screen.findByText('Documents could not be loaded.')).toBeInTheDocument();
  });

  it('shows an error message when the request throws', async () => {
    mockBusinessApi.capacityClaim.documents.mockRejectedValue(new Error('network'));
    render(<CapacityClaimDocumentsViewer instanceId="pi-1" />);
    expect(await screen.findByText('Documents could not be loaded.')).toBeInTheDocument();
  });

  it('shows "Not available" for a template that was not produced', async () => {
    render(<CapacityClaimDocumentsViewer instanceId="pi-1" />);
    expect(
      await screen.findByText('Handover document (Recruitment / Procurement)')
    ).toBeInTheDocument();
    expect(screen.getByText('Not available')).toBeInTheDocument();
  });

  it('expanding a produced template renders its zones, substituting variables and applying marks', async () => {
    const user = userEvent.setup();
    render(<CapacityClaimDocumentsViewer instanceId="pi-1" />);

    await user.click(await screen.findByText('Board of Directors — decision notification'));

    expect(screen.getByText('Gemeente Almere')).toBeInTheDocument();
    expect(screen.getByText('Senior beleidsadviseur')).toBeInTheDocument();
    const bold = screen.getByText('Goedgekeurd');
    expect(bold.closest('strong')).not.toBeNull();
  });

  it('collapsing a document section hides its content again', async () => {
    const user = userEvent.setup();
    render(<CapacityClaimDocumentsViewer instanceId="pi-1" />);

    const toggle = await screen.findByText('Board of Directors — decision notification');
    await user.click(toggle);
    expect(screen.getByText('Gemeente Almere')).toBeInTheDocument();

    await user.click(toggle);
    expect(screen.queryByText('Gemeente Almere')).not.toBeInTheDocument();
  });
});
