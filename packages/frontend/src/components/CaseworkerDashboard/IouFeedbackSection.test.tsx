// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import IouFeedbackSection from './IouFeedbackSection';

vi.mock('../AltchaWidget', () => ({
  default: () => <div>altcha-widget</div>,
}));

function jsonResponse(data: unknown, ok = true, status = 200) {
  return { ok, status, json: () => Promise.resolve(data) };
}

// The Field component renders <label>{text}</label> as a sibling of its
// input, not wrapping it, and sets no htmlFor/id — so getByLabelText can't
// associate them. Grab inputs positionally within the "Indiener" card instead
// (Naam, Organisatie, Functie, Contact, in that DOM order).
function getFields(container: HTMLElement) {
  const inputs = container.querySelectorAll('input');
  return {
    name: inputs[0] as HTMLInputElement,
    contact: inputs[3] as HTMLInputElement,
    description: container.querySelector('textarea') as HTMLTextAreaElement,
  };
}

async function fillRequired(user: ReturnType<typeof userEvent.setup>, container: HTMLElement) {
  const { name, contact, description } = getFields(container);
  await user.type(name, 'Jan Jansen');
  await user.type(contact, 'jan@example.test');
  await user.type(description, 'Testfeedback');
}

beforeEach(() => {
  sessionStorage.clear();
  URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  URL.revokeObjectURL = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        data: { iid: 42, web_url: 'https://gitlab.example.test/issues/42' },
      })
    )
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe('IouFeedbackSection', () => {
  it('shows validation errors for empty required fields on submit', async () => {
    const user = userEvent.setup();
    render(<IouFeedbackSection />);

    await user.click(screen.getByRole('button', { name: 'Indienen' }));

    expect(screen.getByText('Vul de verplichte velden in:')).toBeInTheDocument();
    expect(screen.getAllByText('Naam').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Contact (e-mail)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Beschrijving').length).toBeGreaterThan(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('submitting valid data shows the success screen with the created work item', async () => {
    const user = userEvent.setup();
    const { container } = render(<IouFeedbackSection />);

    await fillRequired(user, container);
    await user.click(screen.getByRole('button', { name: 'Indienen' }));

    expect(await screen.findByText('Feedback ingediend')).toBeInTheDocument();
    expect(screen.getByText('#42')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Bekijk het werkitem/ })).toHaveAttribute(
      'href',
      'https://gitlab.example.test/issues/42'
    );
  });

  it('"Nieuwe feedback indienen" returns to a blank form after success', async () => {
    const user = userEvent.setup();
    const { container } = render(<IouFeedbackSection />);

    await fillRequired(user, container);
    await user.click(screen.getByRole('button', { name: 'Indienen' }));
    await screen.findByText('Feedback ingediend');

    await user.click(screen.getByRole('button', { name: 'Nieuwe feedback indienen' }));

    expect(screen.getByRole('button', { name: 'Indienen' })).toBeInTheDocument();
    expect(getFields(container).name.value).toBe('');
  });

  it('shows an error message when submission fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ success: false, error: { message: 'Server fout' } }, true)
        )
    );
    const user = userEvent.setup();
    const { container } = render(<IouFeedbackSection />);

    await fillRequired(user, container);
    await user.click(screen.getByRole('button', { name: 'Indienen' }));

    expect(await screen.findByText(/Server fout/)).toBeInTheDocument();
  });

  it('adding a non-image file shows a validation error and does not add it', async () => {
    const { container } = render(<IouFeedbackSection />);

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const textFile = new File(['x'], 'notes.txt', { type: 'text/plain' });
    // fireEvent bypasses user-event's `accept`-attribute file filtering, so
    // the component's own image-type validation is what's under test here.
    fireEvent.change(fileInput, { target: { files: [textFile] } });

    expect(screen.getByText('Alleen afbeeldingen zijn toegestaan.')).toBeInTheDocument();
    expect(screen.queryByAltText('notes.txt')).not.toBeInTheDocument();
  });

  it('adding a valid image shows a thumbnail, and removing it clears the preview', async () => {
    const user = userEvent.setup();
    const { container } = render(<IouFeedbackSection />);

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const image = new File(['x'], 'screenshot.png', { type: 'image/png' });
    await user.upload(fileInput, image);

    expect(await screen.findByAltText('screenshot.png')).toBeInTheDocument();

    await user.click(screen.getByTitle('Verwijderen'));

    expect(screen.queryByAltText('screenshot.png')).not.toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('caps screenshots at the maximum and shows an error for the excess', async () => {
    const user = userEvent.setup();
    const { container } = render(<IouFeedbackSection />);

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const files = Array.from(
      { length: 6 },
      (_, i) => new File(['x'], `s${i}.png`, { type: 'image/png' })
    );
    await user.upload(fileInput, files);

    expect(screen.getByText('Maximaal 5 screenshots.')).toBeInTheDocument();
    expect(container.querySelectorAll('img').length).toBe(5);
  });

  it('persists text field changes as a sessionStorage draft', async () => {
    const user = userEvent.setup();
    const { container } = render(<IouFeedbackSection />);

    await user.type(getFields(container).name, 'Jan Jansen');
    expect(JSON.parse(sessionStorage.getItem('iouFeedback.draft')!).name).toBe('Jan Jansen');
  });

  it('clears the sessionStorage draft entirely on a successful submit', async () => {
    const user = userEvent.setup();
    const { container } = render(<IouFeedbackSection />);

    await fillRequired(user, container);
    expect(sessionStorage.getItem('iouFeedback.draft')).not.toBeNull();

    await user.click(screen.getByRole('button', { name: 'Indienen' }));
    await screen.findByText('Feedback ingediend');

    // clearDraft() removes the key; the persist effect skips re-writing it
    // while submitState is 'success', so the key stays genuinely absent
    // instead of coming back as a blank draft.
    expect(sessionStorage.getItem('iouFeedback.draft')).toBeNull();
  });

  it('resumes persisting once the user starts a new submission', async () => {
    const user = userEvent.setup();
    const { container } = render(<IouFeedbackSection />);

    await fillRequired(user, container);
    await user.click(screen.getByRole('button', { name: 'Indienen' }));
    await screen.findByText('Feedback ingediend');
    await user.click(screen.getByRole('button', { name: 'Nieuwe feedback indienen' }));

    await user.type(getFields(container).name, 'Nieuwe naam');

    expect(JSON.parse(sessionStorage.getItem('iouFeedback.draft')!).name).toBe('Nieuwe naam');
  });
});
