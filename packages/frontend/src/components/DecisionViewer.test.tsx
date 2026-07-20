// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import DecisionViewer from './DecisionViewer';

const mockFormInstance = vi.hoisted(() => ({
  importSchema: vi.fn().mockResolvedValue(undefined),
  destroy: vi.fn(),
}));
const MockForm = vi.hoisted(() =>
  vi.fn(function MockFormCtor() {
    return mockFormInstance;
  })
);
vi.mock('@bpmn-io/form-js', () => ({ Form: MockForm }));

const mockHistoricVariables = vi.hoisted(() => vi.fn());
const mockDecisionDocument = vi.hoisted(() => vi.fn());
vi.mock('../services/api', () => ({
  businessApi: {
    process: { historicVariables: mockHistoricVariables, decisionDocument: mockDecisionDocument },
  },
}));

const template = {
  id: 't1',
  name: 'Test template',
  zones: {
    letterhead: {
      blocks: [
        {
          type: 'text',
          content: {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Gemeente Utrecht' }] }],
          },
        },
      ],
    },
    contactInformation: { blocks: [] },
    reference: { blocks: [] },
    body: { blocks: [{ type: 'variable', variableKey: 'permitDecision' }] },
    closing: { blocks: [] },
    signOff: { blocks: [] },
  },
};

describe('DecisionViewer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockFormInstance.importSchema.mockClear();
    mockFormInstance.destroy.mockClear();
    MockForm.mockClear();
  });

  it('shows a loading indicator before the fetches resolve', () => {
    mockHistoricVariables.mockReturnValue(new Promise(() => {}));
    mockDecisionDocument.mockReturnValue(new Promise(() => {}));

    render(<DecisionViewer processInstanceId="p1" />);

    expect(screen.getByText('Beslissing laden…')).toBeInTheDocument();
  });

  it('renders the document template, substituting variables into text and variable blocks', async () => {
    mockHistoricVariables.mockResolvedValue({
      success: true,
      data: { permitDecision: 'Vergunning verleend' },
    });
    mockDecisionDocument.mockResolvedValue({ success: true, template });

    render(<DecisionViewer processInstanceId="p1" />);

    await waitFor(() => expect(screen.getByText('Gemeente Utrecht')).toBeInTheDocument());
    expect(screen.getByText('Vergunning verleend')).toBeInTheDocument();
  });

  it('falls back to the form-js readonly schema when there is no document template', async () => {
    mockHistoricVariables.mockResolvedValue({ success: true, data: { status: 'Afgehandeld' } });
    mockDecisionDocument.mockResolvedValue({ success: false });

    const { container } = render(<DecisionViewer processInstanceId="p1" />);

    await waitFor(() => expect(MockForm).toHaveBeenCalled());
    expect(container.querySelector('.fjs-container')).not.toBeNull();
    expect(mockFormInstance.importSchema).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'awb-notify-applicant-readonly' }),
      { status: 'Afgehandeld' }
    );
  });

  it('still mounts form-js in fallback mode even when showFallback is false, but keeps it hidden', async () => {
    mockHistoricVariables.mockResolvedValue({ success: true, data: {} });
    mockDecisionDocument.mockResolvedValue({ success: false });

    const { container } = render(<DecisionViewer processInstanceId="p1" showFallback={false} />);

    await waitFor(() => expect(MockForm).toHaveBeenCalled());
    expect(container.querySelector('.hidden')).not.toBeNull();
    expect(container.querySelector('.fjs-container')).toBeNull();
  });

  it('destroys the form-js instance on unmount', async () => {
    mockHistoricVariables.mockResolvedValue({ success: true, data: {} });
    mockDecisionDocument.mockResolvedValue({ success: false });

    const { unmount } = render(<DecisionViewer processInstanceId="p1" />);
    await waitFor(() => expect(MockForm).toHaveBeenCalled());

    unmount();

    expect(mockFormInstance.destroy).toHaveBeenCalled();
  });

  it('falls back to form-js (not an error) when the API calls reject — allSettled absorbs rejections', async () => {
    mockHistoricVariables.mockRejectedValue(new Error('down'));
    mockDecisionDocument.mockRejectedValue(new Error('down'));

    const { container } = render(<DecisionViewer processInstanceId="p1" />);

    await waitFor(() => expect(container.querySelector('.fjs-container')).not.toBeNull());
  });

  it('shows an error message when the effect itself throws synchronously, and showFallback is true', async () => {
    mockHistoricVariables.mockImplementation(() => {
      throw new Error('boom before allSettled');
    });
    mockDecisionDocument.mockResolvedValue({ success: false });

    render(<DecisionViewer processInstanceId="p1" />);

    await waitFor(() =>
      expect(screen.getByText('Document kon niet worden geladen.')).toBeInTheDocument()
    );
  });
});
