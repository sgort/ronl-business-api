// @vitest-environment jsdom
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MdEditor from './MdEditor';

function Wrapper({
  initialValue = '',
  onFocusField = vi.fn(),
  readOnly = false,
}: {
  initialValue?: string;
  onFocusField?: (key: string) => void;
  readOnly?: boolean;
}) {
  const [value, setValue] = useState(initialValue);
  const taRef = useRef<HTMLTextAreaElement>(null!);
  return (
    <MdEditor
      value={value}
      onChange={setValue}
      taRef={taRef}
      fieldKey="waaromNu"
      onFocusField={onFocusField}
      placeholder="Schrijf hier…"
      readOnly={readOnly}
    />
  );
}

describe('MdEditor', () => {
  it('defaults to the split view showing both the textarea and the preview', () => {
    const { container } = render(<Wrapper />);
    expect(container.querySelector('.pac-db-md-ta')).not.toBeNull();
    expect(container.querySelector('.pac-db-md-preview')).not.toBeNull();
  });

  it('readOnly defaults to the voorbeeld view — no textarea rendered', () => {
    const { container } = render(<Wrapper readOnly />);
    expect(container.querySelector('.pac-db-md-ta')).toBeNull();
    expect(container.querySelector('.pac-db-md-preview')).not.toBeNull();
  });

  it('typing in the textarea updates the value and the word count', async () => {
    const user = userEvent.setup();
    const { container } = render(<Wrapper />);

    const textarea = container.querySelector('.pac-db-md-ta') as HTMLTextAreaElement;
    await user.type(textarea, 'twee woorden');

    expect(textarea.value).toBe('twee woorden');
    expect(screen.getByText('2 woorden · Markdown')).toBeInTheDocument();
  });

  it('focusing the textarea calls onFocusField with the field key', async () => {
    const onFocusField = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<Wrapper onFocusField={onFocusField} />);

    await user.click(container.querySelector('.pac-db-md-ta') as HTMLTextAreaElement);

    expect(onFocusField).toHaveBeenCalledWith('waaromNu');
  });

  it('switching to "Voorbeeld" hides the textarea, "Schrijven" hides the preview', async () => {
    const user = userEvent.setup();
    const { container } = render(<Wrapper initialValue="Hallo wereld" />);

    await user.click(screen.getByRole('button', { name: 'Voorbeeld' }));
    expect(container.querySelector('.pac-db-md-ta')).toBeNull();
    expect(screen.getByText('Hallo wereld')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Schrijven' }));
    expect(container.querySelector('.pac-db-md-ta')).not.toBeNull();
    expect(container.querySelector('.pac-db-md-preview')).toBeNull();
  });

  it('shows the empty-preview placeholder when there is no content', () => {
    render(<Wrapper initialValue="" />);
    expect(screen.getByText('Voorbeeld verschijnt hier…')).toBeInTheDocument();
  });

  it('the Bold toolbar button wraps the current (empty) selection with "**tekst**"', async () => {
    const user = userEvent.setup();
    const { container } = render(<Wrapper />);

    await user.click(screen.getByTitle('Vet'));

    const textarea = container.querySelector('.pac-db-md-ta') as HTMLTextAreaElement;
    expect(textarea.value).toBe('**tekst**');
  });

  it('the H2 toolbar button prefixes the current line', async () => {
    const user = userEvent.setup();
    const { container } = render(<Wrapper />);

    await user.click(screen.getByTitle('Kop'));

    const textarea = container.querySelector('.pac-db-md-ta') as HTMLTextAreaElement;
    expect(textarea.value).toBe('## ');
  });

  it('toolbar buttons are disabled when readOnly', () => {
    render(<Wrapper readOnly />);
    expect(screen.getByTitle('Vet')).toBeDisabled();
  });

  it('the Tabel toolbar button inserts a table scaffold at the caret', async () => {
    const user = userEvent.setup();
    const { container } = render(<Wrapper />);

    await user.click(screen.getByTitle('Tabel'));

    const textarea = container.querySelector('.pac-db-md-ta') as HTMLTextAreaElement;
    expect(textarea.value).toBe('\n| Kolom | Kolom |\n| --- | --- |\n| … | … |\n');
  });

  it('toolbar buttons do nothing in the Voorbeeld view, where no textarea is mounted', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const taRef = { current: null as unknown as HTMLTextAreaElement };
    render(
      <MdEditor
        value="Bestaande tekst"
        onChange={onChange}
        taRef={taRef}
        fieldKey="waaromNu"
        onFocusField={vi.fn()}
      />
    );

    // No readOnly prop: the editor starts editable, in the split view.
    expect(screen.getByRole('button', { name: 'Split' })).toHaveClass('active');
    await user.click(screen.getByRole('button', { name: 'Voorbeeld' }));
    expect(taRef.current).toBeNull();

    await user.click(screen.getByTitle('Vet'));
    await user.click(screen.getByTitle('Kop'));
    await user.click(screen.getByTitle('Tabel'));

    expect(onChange).not.toHaveBeenCalled();
  });
});
