import { useRef, useState } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_URL as string;
const MAX_SCREENSHOTS = 5;
const MAX_SIZE_MB = 10;

interface Screenshot {
  id: string;
  file: File;
  previewUrl: string;
}

interface FormState {
  name: string;
  org: string;
  role: string;
  contact: string;
  description: string;
}

const initialForm = (): FormState => ({
  name: '',
  org: 'Provincie Flevoland',
  role: '',
  contact: '',
  description: '',
});

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

export default function IouFeedbackSection() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [errors, setErrors] = useState<Set<string>>(new Set());
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [successData, setSuccessData] = useState<{ iid: number; web_url: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // ── Field helpers ──────────────────────────────────────────────────────────

  function set<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const n = new Set(prev);
      n.delete(key);
      return n;
    });
  }

  // ── Screenshot helpers ─────────────────────────────────────────────────────

  function addFiles(files: FileList | File[]) {
    setScreenshotError(null);
    const arr = Array.from(files);
    const valid: Screenshot[] = [];

    for (const file of arr) {
      if (!file.type.startsWith('image/')) {
        setScreenshotError('Alleen afbeeldingen zijn toegestaan.');
        continue;
      }
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        setScreenshotError(`Maximale bestandsgrootte is ${MAX_SIZE_MB} MB.`);
        continue;
      }
      if (screenshots.length + valid.length >= MAX_SCREENSHOTS) {
        setScreenshotError(`Maximaal ${MAX_SCREENSHOTS} screenshots.`);
        break;
      }
      valid.push({
        id: `${Date.now()}-${Math.random()}`,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }
    setScreenshots((prev) => [...prev, ...valid]);
  }

  function removeScreenshot(id: string) {
    setScreenshots((prev) => {
      const removed = prev.find((s) => s.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((s) => s.id !== id);
    });
  }

  function handlePaste(e: React.ClipboardEvent) {
    const files = Array.from(e.clipboardData.items)
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((f): f is File => f !== null);
    if (files.length > 0) {
      e.preventDefault();
      addFiles(files);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    dropZoneRef.current?.classList.remove('border-blue-400', 'bg-blue-50');
    addFiles(e.dataTransfer.files);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    dropZoneRef.current?.classList.add('border-blue-400', 'bg-blue-50');
  }

  function handleDragLeave() {
    dropZoneRef.current?.classList.remove('border-blue-400', 'bg-blue-50');
  }

  // ── Validation ─────────────────────────────────────────────────────────────

  function validate(): boolean {
    const invalid = new Set<string>();
    if (!form.name.trim()) invalid.add('name');
    if (!form.contact.trim()) invalid.add('contact');
    if (!form.description.trim()) invalid.add('description');
    setErrors(invalid);
    return invalid.size === 0;
  }

  // ── Submission ─────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!validate()) return;

    setSubmitState('submitting');
    setErrorMessage('');

    const fd = new FormData();
    fd.append('name', form.name.trim());
    fd.append('org', form.org.trim());
    fd.append('role', form.role.trim());
    fd.append('contact', form.contact.trim());
    fd.append('description', form.description.trim());
    screenshots.forEach((s) => fd.append('screenshots', s.file, s.file.name));

    try {
      const response = await fetch(`${API_BASE_URL}/public/feedback`, {
        method: 'POST',
        body: fd,
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || `HTTP ${response.status}`);
      }
      setSuccessData(data.data);
      setSubmitState('success');
      screenshots.forEach((s) => URL.revokeObjectURL(s.previewUrl));
      setForm(initialForm());
      setScreenshots([]);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error');
      setSubmitState('error');
    }
  }

  // ── Input class ────────────────────────────────────────────────────────────

  const inputCls = (field: string) =>
    `w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
      errors.has(field) ? 'border-red-400 bg-red-50' : 'border-gray-300'
    }`;

  // ── Success state ──────────────────────────────────────────────────────────

  if (submitState === 'success' && successData) {
    return (
      <div className="max-w-2xl">
        <div className="bg-green-50 border border-green-300 rounded-xl p-6">
          <p className="text-2xl mb-2">✅</p>
          <h2 className="text-lg font-bold text-green-800 mb-1">Feedback ingediend</h2>
          <p className="text-sm text-green-700 mb-3">
            Werkitem <strong>#{successData.iid}</strong> is aangemaakt.{' '}
            <a
              href={successData.web_url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold"
            >
              Bekijk het werkitem →
            </a>
          </p>
          <button
            onClick={() => setSubmitState('idle')}
            className="mt-2 px-4 py-2 text-sm bg-green-700 text-white rounded-lg hover:bg-green-800"
          >
            Nieuwe feedback indienen
          </button>
        </div>
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl space-y-4 pb-8" onPaste={handlePaste}>
      <div>
        <h2 className="text-lg font-bold text-gray-800 mb-1">Feedback geven</h2>
        <p className="text-sm text-gray-500 leading-relaxed">
          Deel uw ervaringen, suggesties of meld een probleem. Screenshots kunt u plakken of slepen
          in het veld hieronder.
        </p>
      </div>

      {/* ── 1. Submitter ── */}
      <Card number="1" label="Indiener">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Naam" required>
            <input
              className={inputCls('name')}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </Field>
          <Field label="Organisatie">
            <input
              className={inputCls('org')}
              value={form.org}
              onChange={(e) => set('org', e.target.value)}
            />
          </Field>
          <Field label="Functie">
            <input
              className={inputCls('role')}
              placeholder="e.g. Beleidsadviseur"
              value={form.role}
              onChange={(e) => set('role', e.target.value)}
            />
          </Field>
          <Field label="Contact (e-mail)" required>
            <input
              className={inputCls('contact')}
              type="email"
              value={form.contact}
              onChange={(e) => set('contact', e.target.value)}
            />
          </Field>
        </div>
      </Card>

      {/* ── 2. Description ── */}
      <Card number="2" label="Beschrijving">
        <Field label="Wat wilt u melden of voorstellen?" required>
          <textarea
            className={inputCls('description')}
            rows={5}
            placeholder="Beschrijf uw feedback zo concreet mogelijk…"
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
          />
        </Field>
      </Card>

      {/* ── 3. Screenshots ── */}
      <Card number="3" label="Screenshots (optioneel)">
        <p className="text-xs text-gray-500 mb-3">
          Plak screenshots (Ctrl+V), sleep ze in het vak, of kies bestanden. Maximaal{' '}
          {MAX_SCREENSHOTS} afbeeldingen van elk max. {MAX_SIZE_MB} MB.
        </p>

        {/* Drop zone */}
        <div
          ref={dropZoneRef}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer transition-colors hover:border-gray-400 hover:bg-gray-50"
        >
          <p className="text-sm text-gray-400">
            📋 Plak, sleep of{' '}
            <span className="underline" style={{ color: 'var(--color-primary, #0046ad)' }}>
              kies bestanden
            </span>
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
        </div>

        {screenshotError && <p className="text-xs text-red-600 mt-2">{screenshotError}</p>}

        {/* Thumbnails */}
        {screenshots.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mt-3">
            {screenshots.map((s) => (
              <div
                key={s.id}
                className="relative group rounded-lg overflow-hidden border border-gray-200"
              >
                <img src={s.previewUrl} alt={s.file.name} className="w-full h-24 object-cover" />
                <button
                  onClick={() => removeScreenshot(s.id)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Verwijderen"
                >
                  ×
                </button>
                <p className="text-xs text-gray-500 truncate px-1 py-0.5 bg-white/80">
                  {s.file.name}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Validation errors */}
      {errors.size > 0 && (
        <div className="bg-red-50 border border-red-300 rounded-xl px-4 py-3 text-sm text-red-700">
          <strong>Vul de verplichte velden in:</strong>
          <ul className="list-disc list-inside mt-1 space-y-0.5">
            {errors.has('name') && <li>Naam</li>}
            {errors.has('contact') && <li>Contact (e-mail)</li>}
            {errors.has('description') && <li>Beschrijving</li>}
          </ul>
        </div>
      )}

      {/* Submit error */}
      {submitState === 'error' && (
        <div className="bg-red-50 border border-red-300 rounded-xl px-4 py-3 text-sm text-red-700">
          <strong>❌ Indiening mislukt</strong> — {errorMessage}
        </div>
      )}

      {/* Submit */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleSubmit}
          disabled={submitState === 'submitting'}
          className="flex items-center gap-2 px-5 py-2.5 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60"
          style={{ backgroundColor: 'var(--color-primary, #0046ad)' }}
        >
          {submitState === 'submitting' && (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          )}
          {submitState === 'submitting' ? 'Bezig…' : 'Indienen'}
        </button>
        <p className="text-xs text-gray-400">
          Uw feedback maakt een werkitem aan in het IOU Architecture-projectbeheer.
        </p>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Card({
  number,
  label,
  children,
}: {
  number: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 bg-gray-50">
        <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold flex-shrink-0">
          {number}
        </span>
        <span className="text-sm font-semibold text-gray-700">{label}</span>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}
