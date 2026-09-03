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

describe('CapacityClaimDocumentsViewer document rendering', () => {
  it('renders every block type, node type and text mark the composer can emit', async () => {
    mockBusinessApi.capacityClaim.documents.mockResolvedValue({
      success: true,
      data: {
        variables: { naam: 'Sanne' },
        boardDecisionNotification: richTemplate,
        capacityClaimHandover: null,
      },
    });
    const user = userEvent.setup();
    const { container } = render(<CapacityClaimDocumentsViewer instanceId="pi-1" />);
    await user.click(await screen.findByText('Board of Directors — decision notification'));

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
