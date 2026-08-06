// packages/public-site/src/components/chrome.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SkipLink from './SkipLink';
import TopBar from './TopBar';
import SearchForm from './SearchForm';
import Facet from './Facet';
import Tabs from './Tabs';
import TechDetails from './TechDetails';
import { translations } from '../i18n';

const t = translations.nl;

describe('SkipLink', () => {
  it('links to #pub-main', () => {
    render(<SkipLink label="Direct naar de inhoud" />);
    expect(screen.getByText('Direct naar de inhoud')).toHaveAttribute('href', '#pub-main');
  });
});

describe('TopBar', () => {
  it('calls onLangChange with the clicked language', () => {
    const onLangChange = vi.fn();
    render(
      <MemoryRouter>
        <TopBar t={t} lang="nl" onLangChange={onLangChange} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: 'EN' }));
    expect(onLangChange).toHaveBeenCalledWith('en');
  });

  it('marks the active language with aria-pressed', () => {
    render(
      <MemoryRouter>
        <TopBar t={t} lang="nl" onLangChange={() => {}} />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: 'NL' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('SearchForm', () => {
  it('submits the trimmed value', () => {
    const onSubmit = vi.fn();
    render(<SearchForm t={t} value="" onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(t.searchLabel), {
      target: { value: '  zorgtoeslag  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.search) }));
    expect(onSubmit).toHaveBeenCalledWith('zorgtoeslag');
  });
});

describe('Facet', () => {
  it('reports the toggled value and reflects checked state', () => {
    const onToggle = vi.fn();
    render(
      <Facet
        legend="Soort"
        options={[{ value: 'regel', count: 3 }]}
        selected={['regel']}
        onToggle={onToggle}
      />
    );
    const checkbox = screen.getByRole('checkbox', { name: /regel/ });
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    expect(onToggle).toHaveBeenCalledWith('regel');
  });
});

describe('Tabs', () => {
  it('marks the active tab via aria-selected and reports clicks', () => {
    const onChange = vi.fn();
    render(
      <Tabs
        tabs={[
          { id: 'a', label: 'A', count: 1 },
          { id: 'b', label: 'B', count: 2 },
        ]}
        active="a"
        onChange={onChange}
      />
    );
    expect(screen.getByRole('tab', { name: /^A/ })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: /^B/ }));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});

describe('TechDetails', () => {
  it('is collapsed by default and expands on click', () => {
    render(<TechDetails t={t} rows={[['key', 'value']]} />);
    const details = screen.getByText(t.tech).closest('details')!;
    expect(details).not.toHaveAttribute('open');
    fireEvent.click(screen.getByText(t.tech));
    expect(details).toHaveAttribute('open');
  });
});
