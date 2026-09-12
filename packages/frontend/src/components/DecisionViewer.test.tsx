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

// Exercises every arm of the TipTap renderer and the block switch in one
// document: each of the three viewers carries its own copy of this renderer,
// so each needs its own pass over it.
const richZone = {
  blocks: [
    {
      type: 'text',
      content: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'Kop met niveau' }],
          },
          { type: 'heading', content: [{ type: 'text', text: 'Kop zonder niveau' }] },
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'vet', marks: [{ type: 'bold' }] },
              { type: 'text', text: 'cursief', marks: [{ type: 'italic' }] },
              { type: 'text', text: 'onderstreept', marks: [{ type: 'underline' }] },
              { type: 'text', text: 'alles', marks: [{ type: 'bold' }, { type: 'italic' }] },
            ],
          },
          { type: 'paragraph' },
          {
            type: 'bulletList',
            content: [{ type: 'listItem', content: [{ type: 'text', text: 'bullet' }] }],
          },
          {
            type: 'orderedList',
            content: [{ type: 'listItem', content: [{ type: 'text', text: 'genummerd' }] }],
          },
          { type: 'paragraph', content: [{ type: 'hardBreak' }] },
          { type: 'blockquote', content: [{ type: 'text', text: 'onbekend nodetype' }] },
          { type: 'text' },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Beste {{naam}}, ref {{ontbreekt}}.' }],
          },
        ],
      },
    },
    { type: 'variable', variableKey: 'naam' },
    { type: 'variable', variableKey: 'ontbreekt' },
    { type: 'variable' },
    { type: 'separator' },
    { type: 'spacer' },
    { type: 'image', assetUrl: 'https://cdn.example/logo.png' },
    { type: 'image' },
    { type: 'text' },
    { type: 'onbekend' },
  ],
};

const richTemplate = {
  id: 'rich',
  name: 'Rich template',
  zones: {
    letterhead: { blocks: [] },
    contactInformation: { blocks: [] },
    reference: { blocks: [] },
    body: richZone,
    closing: { blocks: [] },
    signOff: { blocks: [] },
    annex: null,
  },
};

describe('DecisionViewer document rendering', () => {
  it('renders every block type, node type and text mark the composer can emit', async () => {
    mockHistoricVariables.mockResolvedValue({ success: true, data: { naam: 'Sanne' } });
    mockDecisionDocument.mockResolvedValue({ success: true, template: richTemplate });

    const { container } = render(<DecisionViewer processInstanceId="p1" />);
    await waitFor(() => expect(container.querySelector('h2')).not.toBeNull());

    // Marks nest rather than replace one another.
    expect(container.querySelector('strong')).toHaveTextContent('vet');
    expect(container.querySelector('em')).toHaveTextContent('cursief');
    expect(container.querySelector('u')).toHaveTextContent('onderstreept');
    // Marks apply in source order, so bold wraps first and italic wraps that.
    expect(container.querySelector('em strong')).toHaveTextContent('alles');

    // Headings honour their level and default to h1 without one.
    expect(container.querySelector('h2')).toHaveTextContent('Kop met niveau');
    expect(container.querySelector('h1')).toHaveTextContent('Kop zonder niveau');

    // Lists and their items.
    expect(container.querySelector('ul.list-disc li')).toHaveTextContent('bullet');
    expect(container.querySelector('ol.list-decimal li')).toHaveTextContent('genummerd');

    // An empty paragraph keeps its vertical space with a <br>, and a hardBreak
    // renders one too.
    expect(container.querySelectorAll('br').length).toBeGreaterThanOrEqual(2);

    // A node type the renderer does not know still shows its children rather
    // than dropping the text on the floor.
    expect(container).toHaveTextContent('onbekend nodetype');

    // Placeholder substitution, including a variable the process never set.
    expect(container).toHaveTextContent('Beste Sanne, ref .');

    // Separator, spacer and image blocks.
    expect(container.querySelector('hr')).not.toBeNull();
    expect(container.querySelector('div.h-4')).not.toBeNull();
    const imgs = container.querySelectorAll('img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0]).toHaveAttribute('src', 'https://cdn.example/logo.png');
  });
});
