// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RipFase1WipViewer from './RipFase1WipViewer';

const mockBusinessApi = vi.hoisted(() => ({
  rip: { instanceDocuments: vi.fn() },
}));
vi.mock('../../services/api', () => ({ businessApi: mockBusinessApi }));

vi.mock('./ProcessStepsTimeline', () => ({
  default: ({ instanceId }: { instanceId: string }) => <div>steps-timeline-{instanceId}</div>,
}));

const intakeTemplate = {
  id: 't1',
  name: 'Intake',
  zones: {
    letterhead: { blocks: [] },
    contactInformation: { blocks: [] },
    reference: { blocks: [] },
    body: { blocks: [{ type: 'variable', variableKey: 'projectName' }] },
    closing: { blocks: [] },
    signOff: { blocks: [] },
  },
};

beforeEach(() => {
  mockBusinessApi.rip.instanceDocuments.mockResolvedValue({
    success: true,
    data: {
      variables: { projectName: 'Rondweg Noord' },
      intakeReport: intakeTemplate,
      psuReport: null,
      pdp: null,
    },
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('RipFase1WipViewer', () => {
  it('shows a loading message before the documents resolve', () => {
    mockBusinessApi.rip.instanceDocuments.mockReturnValue(new Promise(() => {}));
    render(<RipFase1WipViewer instanceId="pi-1" />);
    expect(screen.getByText('Documenten laden…')).toBeInTheDocument();
  });

  it('shows an error message when loading fails', async () => {
    mockBusinessApi.rip.instanceDocuments.mockResolvedValue({ success: false });
    render(<RipFase1WipViewer instanceId="pi-1" />);
    expect(await screen.findByText('Documenten konden niet worden geladen.')).toBeInTheDocument();
  });

  it('shows "Nog niet beschikbaar" for documents that were not produced', async () => {
    render(<RipFase1WipViewer instanceId="pi-1" />);
    expect(await screen.findByText('PSU-verslag (Kolom 3)')).toBeInTheDocument();
    const cards = screen.getAllByText('Nog niet beschikbaar');
    expect(cards).toHaveLength(2); // psuReport + pdp
  });

  it('expanding a produced document section substitutes its variables', async () => {
    const user = userEvent.setup();
    render(<RipFase1WipViewer instanceId="pi-1" />);

    await user.click(await screen.findByText('Intakeverslag (Kolom 2)'));

    expect(screen.getByText('Rondweg Noord')).toBeInTheDocument();
  });

  it('the process-steps section is open by default and shows the timeline', async () => {
    render(<RipFase1WipViewer instanceId="pi-1" />);
    expect(await screen.findByText('steps-timeline-pi-1')).toBeInTheDocument();
  });

  it('collapsing the process-steps section hides the timeline', async () => {
    const user = userEvent.setup();
    render(<RipFase1WipViewer instanceId="pi-1" />);
    await screen.findByText('steps-timeline-pi-1');

    await user.click(screen.getByText('Processtappen'));

    expect(screen.queryByText('steps-timeline-pi-1')).not.toBeInTheDocument();
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

describe('RipFase1WipViewer document rendering', () => {
  it('renders every block type, node type and text mark the composer can emit', async () => {
    mockBusinessApi.rip.instanceDocuments.mockResolvedValue({
      success: true,
      data: {
        variables: { naam: 'Sanne' },
        intakeReport: richTemplate,
        psuReport: null,
        pdp: null,
      },
    });
    const user = userEvent.setup();
    const { container } = render(<RipFase1WipViewer instanceId="pi-1" />);
    await user.click(await screen.findByText('Intakeverslag (Kolom 2)'));

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
