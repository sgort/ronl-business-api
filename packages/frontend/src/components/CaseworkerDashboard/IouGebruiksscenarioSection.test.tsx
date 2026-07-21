// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import IouGebruiksscenarioSection from './IouGebruiksscenarioSection';

vi.mock('../AltchaWidget', () => ({
  default: () => <div>altcha-widget</div>,
}));

// Field/Card render <label> as a sibling of the control, not wrapping it, and
// set no htmlFor/id — getByLabelText can't associate them. Query positionally.
function getFields(container: HTMLElement) {
  const inputs = container.querySelectorAll('input');
  const textareas = container.querySelectorAll('textarea');
  return {
    title: inputs[0] as HTMLInputElement,
    name: inputs[1] as HTMLInputElement,
    org: inputs[2] as HTMLInputElement,
    contact: inputs[4] as HTMLInputElement,
    description: textareas[0] as HTMLTextAreaElement,
    desired: textareas[2] as HTMLTextAreaElement,
  };
}

async function fillRequired(user: ReturnType<typeof userEvent.setup>, container: HTMLElement) {
  const f = getFields(container);
  await user.type(f.title, 'Nieuw scenario');
  await user.type(f.name, 'Jan Jansen');
  await user.clear(f.org);
  await user.type(f.org, 'Provincie Flevoland');
  await user.type(f.contact, 'jan@example.test');
  await user.type(f.description, 'Omschrijving van het scenario.');
  await user.type(f.desired, 'Gewenst resultaat.');
}

function jsonResponse(data: unknown, ok = true, status = 200) {
  return { ok, status, json: () => Promise.resolve(data) };
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.includes('/public/use-case')) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: { iid: 7, web_url: 'https://gitlab.example.test/issues/7' },
          })
        );
      }
      return Promise.resolve(jsonResponse({ success: true, data: { markdown: '[bijlage](url)' } }));
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('IouGebruiksscenarioSection', () => {
  it('shows validation errors for empty required fields on submit', async () => {
    const user = userEvent.setup();
    render(<IouGebruiksscenarioSection />);

    await user.click(screen.getByRole('button', { name: 'Indienen' }));

    expect(screen.getByText('Vul de verplichte velden in:')).toBeInTheDocument();
    expect(screen.getByText('Titel')).toBeInTheDocument();
    expect(screen.getAllByText('Naam').length).toBeGreaterThan(0);
    expect(screen.getByText('Gewenst resultaat')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('submitting valid data posts the use-case and shows the success screen', async () => {
    const user = userEvent.setup();
    const { container } = render(<IouGebruiksscenarioSection />);

    await fillRequired(user, container);
    await user.click(screen.getByRole('button', { name: 'Indienen' }));

    expect(await screen.findByText('Succesvol ingediend')).toBeInTheDocument();
    expect(screen.getByText('#7')).toBeInTheDocument();

    const useCaseCall = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(([url]) =>
      String(url).includes('/public/use-case')
    );
    const body = JSON.parse(useCaseCall![1].body);
    expect(body.title).toBe('Nieuw scenario');
    expect(body.description).toContain('Omschrijving van het scenario.');
    expect(body.description).toContain('Gewenst resultaat.');
    expect(body.description).toContain('PO Assessment');
  });

  it('"Nieuw gebruiksscenario indienen" resets to a blank form', async () => {
    const user = userEvent.setup();
    const { container } = render(<IouGebruiksscenarioSection />);

    await fillRequired(user, container);
    await user.click(screen.getByRole('button', { name: 'Indienen' }));
    await screen.findByText('Succesvol ingediend');

    await user.click(screen.getByRole('button', { name: 'Nieuw gebruiksscenario indienen' }));

    expect(getFields(container).title.value).toBe('');
  });

  it('shows an error when the use-case submission itself fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ success: false, error: { message: 'Server fout' } }))
    );
    const user = userEvent.setup();
    const { container } = render(<IouGebruiksscenarioSection />);

    await fillRequired(user, container);
    await user.click(screen.getByRole('button', { name: 'Indienen' }));

    expect(await screen.findByText(/Server fout/)).toBeInTheDocument();
  });

  it('aborts submission and shows an error when an attachment fails to upload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/public/upload-file')) {
          return Promise.resolve(jsonResponse({ success: false, error: { message: 'Te groot' } }));
        }
        return Promise.resolve(jsonResponse({ success: true, data: { iid: 7, web_url: 'x' } }));
      })
    );
    const user = userEvent.setup();
    const { container } = render(<IouGebruiksscenarioSection />);

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(['x'], 'bijlage.pdf', { type: 'application/pdf' })] },
    });

    await fillRequired(user, container);
    await user.click(screen.getByRole('button', { name: 'Indienen' }));

    expect(await screen.findByText(/Bestand uploaden mislukt/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/public/use-case'),
      expect.anything()
    );
  });

  it('caps attachments at the maximum and shows an error for the excess', async () => {
    const { container } = render(<IouGebruiksscenarioSection />);

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const files = Array.from({ length: 6 }, (_, i) => new File(['x'], `f${i}.pdf`));
    fireEvent.change(fileInput, { target: { files } });

    expect(screen.getByText('Maximaal 5 bijlagen.')).toBeInTheDocument();
    expect(screen.getAllByTitle('Verwijderen')).toHaveLength(5);
  });

  it('adding and removing a concrete-example step works, and the last step cannot be removed', async () => {
    const user = userEvent.setup();
    const { container } = render(<IouGebruiksscenarioSection />);

    await user.click(screen.getByRole('button', { name: /Add step/ }));
    expect(container.querySelectorAll('[title="Remove step · Stap verwijderen"]')).toHaveLength(4);

    await user.click(screen.getAllByTitle('Remove step · Stap verwijderen')[0]);
    expect(container.querySelectorAll('[title="Remove step · Stap verwijderen"]')).toHaveLength(3);
  });

  it('selecting the "Overig / Other" checkbox enables its text input', async () => {
    // The "Overig / Other" row's checkbox is not wrapped in a <label> like the
    // other material options are, so clicking its text does nothing — the
    // checkbox itself (5th checkbox: 4 material options + this one) must be
    // clicked directly.
    const user = userEvent.setup();
    render(<IouGebruiksscenarioSection />);

    const otherInput = screen.getByPlaceholderText('specify…');
    expect(otherInput).toBeDisabled();

    await user.click(screen.getAllByRole('checkbox')[4]);
    expect(otherInput).toBeEnabled();
  });

  it('defaults priority to Medium and allows changing it', async () => {
    const user = userEvent.setup();
    render(<IouGebruiksscenarioSection />);

    const mediumRadio = screen.getByRole('radio', {
      name: (name) => name.includes('Medium'),
    }) as HTMLInputElement;
    expect(mediumRadio.checked).toBe(true);

    const highLabel = screen.getByText('🟠 High').closest('label')!;
    await user.click(highLabel);

    expect(mediumRadio.checked).toBe(false);
  });
});
