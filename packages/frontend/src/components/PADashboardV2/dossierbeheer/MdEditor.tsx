/**
 * MdEditor — the Markdown-first narrative field editor (.pac-db-md).
 *
 * Raw Markdown is stored; the live preview is rendered with
 * react-markdown + remark-gfm and sanitised with rehype-sanitize (raw HTML
 * disabled), per the authoring architecture spec — no hand-rolled renderer.
 * The toolbar wraps/prefixes the current selection in the textarea; the parent
 * keeps a ref so snippets can be inserted at the caret of the focused field.
 */

import { useState, type RefObject } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { wordCount } from '../../../pages/public-affairs-v2/dossierbeheer.data';

type MdView = 'schrijven' | 'split' | 'voorbeeld';

interface Props {
  value: string;
  onChange: (next: string) => void;
  taRef: RefObject<HTMLTextAreaElement>;
  fieldKey: string;
  onFocusField: (key: string) => void;
  placeholder?: string;
}

export default function MdEditor({
  value,
  onChange,
  taRef,
  fieldKey,
  onFocusField,
  placeholder,
}: Props) {
  const [view, setView] = useState<MdView>('split');
  const [focused, setFocused] = useState(false);

  const surround = (before: string, after: string = before) => {
    const ta = taRef.current;
    if (!ta) return;
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const sel = value.slice(s, e) || 'tekst';
    onChange(value.slice(0, s) + before + sel + after + value.slice(e));
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = s + before.length;
      ta.selectionEnd = s + before.length + sel.length;
    });
  };

  const linePrefix = (prefix: string) => {
    const ta = taRef.current;
    if (!ta) return;
    const s = ta.selectionStart;
    const lineStart = value.lastIndexOf('\n', s - 1) + 1;
    onChange(value.slice(0, lineStart) + prefix + value.slice(lineStart));
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = s + prefix.length;
    });
  };

  const insertBlock = (block: string) => {
    const ta = taRef.current;
    if (!ta) return;
    const s = ta.selectionStart;
    onChange(value.slice(0, s) + block + value.slice(s));
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = s + block.length;
    });
  };

  const TB = ({ label, title, onClick }: { label: string; title: string; onClick: () => void }) => (
    <button
      type="button"
      className="pac-db-md-tb"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {label}
    </button>
  );

  return (
    <div className={`pac-db-md ${focused ? 'focused' : ''}`}>
      <div className="pac-db-md-toolbar">
        <TB label="H2" title="Kop" onClick={() => linePrefix('## ')} />
        <TB label="H3" title="Subkop" onClick={() => linePrefix('### ')} />
        <span className="pac-db-md-tb-sep" />
        <TB label="B" title="Vet" onClick={() => surround('**')} />
        <TB label="I" title="Cursief" onClick={() => surround('*')} />
        <TB label="&ldquo; &rdquo;" title="Citaat" onClick={() => linePrefix('> ')} />
        <span className="pac-db-md-tb-sep" />
        <TB label="• lijst" title="Opsomming" onClick={() => linePrefix('- ')} />
        <TB label="1." title="Genummerd" onClick={() => linePrefix('1. ')} />
        <TB
          label="Tabel"
          title="Tabel"
          onClick={() => insertBlock('\n| Kolom | Kolom |\n| --- | --- |\n| … | … |\n')}
        />
        <TB label="Link" title="Link" onClick={() => surround('[', '](https://)')} />
        <span className="pac-db-md-spacer" />
        <span className="pac-db-md-viewtog">
          {(
            [
              ['schrijven', 'Schrijven'],
              ['split', 'Split'],
              ['voorbeeld', 'Voorbeeld'],
            ] as const
          ).map(([id, lbl]) => (
            <button
              key={id}
              type="button"
              className={view === id ? 'active' : ''}
              onClick={() => setView(id)}
            >
              {lbl}
            </button>
          ))}
        </span>
      </div>
      <div className={`pac-db-md-body ${view === 'split' ? 'split' : ''}`}>
        {view !== 'voorbeeld' && (
          <textarea
            ref={taRef}
            className="pac-db-md-ta"
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => {
              setFocused(true);
              onFocusField(fieldKey);
            }}
            onBlur={() => setFocused(false)}
          />
        )}
        {view !== 'schrijven' &&
          (value ? (
            <div className="pac-db-md-preview pac-md">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                {value}
              </ReactMarkdown>
            </div>
          ) : (
            <div className="pac-db-md-preview empty">Voorbeeld verschijnt hier…</div>
          ))}
      </div>
      <div className="pac-db-md-foot">
        <span className="safe">✓ veilig gerenderd — rehype-sanitize</span>
        <span>·</span>
        <span>{wordCount(value)} woorden · Markdown</span>
      </div>
    </div>
  );
}
