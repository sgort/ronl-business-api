// packages/public-site/src/components/SearchForm.tsx
import { useEffect, useState, type FormEvent } from 'react';
import type { Translations } from '../i18n';

interface Props {
  t: Translations;
  value: string;
  onSubmit: (q: string) => void;
  id?: string;
}

export default function SearchForm({ t, value, onSubmit, id = 'pub-q' }: Props) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit(v.trim());
  }

  return (
    <form className="pub-searchform" role="search" onSubmit={handleSubmit}>
      <label htmlFor={id} className="pub-sr-only">
        {t.searchLabel}
      </label>
      <input
        id={id}
        type="search"
        value={v}
        placeholder={t.placeholder}
        autoComplete="off"
        onChange={(e) => setV(e.target.value)}
      />
      <button type="submit">
        <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <circle cx="8.5" cy="8.5" r="6" stroke="currentColor" strokeWidth="2.2" />
          <path
            d="M13.5 13.5 18 18"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
        {t.search}
      </button>
    </form>
  );
}
