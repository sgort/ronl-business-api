import { useRef, useState } from 'react';
import AltchaWidget from '../AltchaWidget';

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_MB = 10;

const API_BASE_URL = import.meta.env.VITE_API_URL as string;

const MATERIAL_OPTIONS = [
  'Excel / spreadsheet',
  'Word / PDF',
  'Procesdiagram / Process diagram',
  'DMN-bestand / DMN file',
];

const PRIORITY_OPTIONS = [
  {
    value: '🔴 Critical — blocking current work / Kritiek — blokkeert huidig werk',
    label: '🔴 Critical',
    sub: 'Blocking current work · Blokkeert huidig werk',
  },
  {
    value: '🟠 High — needed within months / Hoog — nodig binnen maanden',
    label: '🟠 High',
    sub: 'Needed within months · Nodig binnen maanden',
  },
  {
    value: '🟡 Medium — planned for near future / Middel — gepland voor nabije toekomst',
    label: '🟡 Medium',
    sub: 'Planned for near future · Nabije toekomst',
  },
  {
    value: '🟢 Low — nice to have / Laag — prettig om te hebben',
    label: '🟢 Low',
    sub: 'Nice to have · Prettig om te hebben',
  },
];

const PO_ASSESSMENT_TEMPLATE = `
---

## 🔒 PO Assessment · PO Beoordeling

*To be completed by the Product Owner after review.*
*In te vullen door de Product Owner na beoordeling.*

### A. Classification · Classificatie

- [ ] New DMN decision model(s)
- [ ] New LDE chain composition
- [ ] New / modified BPMN process
- [ ] New or extended CPRMV API capability
- [ ] New or extended RONL Business API capability
- [ ] Documentation / reference implementation
- [ ] Multiple — see component impact below

### B. Component Impact · Component impact

| Component | Impact | Notes · Opmerkingen |
|---|---|---|
| RONL Business API | None / Minor / Moderate / Major | |
| CPSV Editor | None / Minor / Moderate / Major | |
| Linked Data Explorer | None / Minor / Moderate / Major | |
| CPRMV API | None / Minor / Moderate / Major | |
| TriplyDB / Knowledge Graph | None / Minor / Moderate / Major | |
| Operaton (BPMN/DMN engine) | None / Minor / Moderate / Major | |
| Documentation site | None / Minor / Moderate / Major | |

### C. Technical Prerequisites · Technische vereisten

*(To be completed by PO)*

### D. Effort Estimate · Inspanningsschatting

- [ ] Small — hours · Klein — uren
- [ ] Medium — days · Middel — dagen
- [ ] Large — weeks · Groot — weken
- [ ] Epic — requires its own project · Epic — vereist een eigen project

### E. Decision · Beslissing

- [ ] ✅ Accepted · Geaccepteerd
- [ ] 🕐 Deferred · Uitgesteld
- [ ] ❌ Declined · Afgewezen

**Rationale · Motivatie:** *(To be completed by PO)*

**Target milestone · Doelmijlpaal:** *(To be completed by PO)*

### F. Follow-up Actions · Vervolgacties

| Action · Actie | Owner · Eigenaar | Due · Deadline |
|---|---|---|
| | | |
`.trim();

interface FormState {
  title: string;
  name: string;
  org: string;
  role: string;
  contact: string;
  description: string;
  current: string;
  desired: string;
  steps: string[];
  legislation: string;
  parties: string;
  materials: Set<string>;
  materialOther: string;
  priority: string;
}

interface AttachedFile {
  id: string;
  file: File;
}

const initialForm = (): FormState => ({
  title: '',
  name: '',
  org: 'Provincie Flevoland',
  role: '',
  contact: '',
  description: '',
  current: '',
  desired: '',
  steps: ['', '', ''],
  legislation: '',
  parties: '',
  materials: new Set(),
  materialOther: '',
  priority: PRIORITY_OPTIONS[2].value, // Medium default
});

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

export default function IouGebruiksscenarioSection() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [errors, setErrors] = useState<Set<string>>(new Set());
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [successData, setSuccessData] = useState<{ iid: number; web_url: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [altchaPayload, setAltchaPayload] = useState('');
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const attachmentDropRef = useRef<HTMLDivElement>(null);

  // ── Field helpers ────────────────────────────────────────────────────────

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  function setStep(index: number, value: string) {
    setForm((prev) => {
      const steps = [...prev.steps];
      steps[index] = value;
      return { ...prev, steps };
    });
  }

  function addStep() {
    setForm((prev) => ({ ...prev, steps: [...prev.steps, ''] }));
  }

  function removeStep(index: number) {
    setForm((prev) => ({
      ...prev,
      steps: prev.steps.filter((_, i) => i !== index),
    }));
  }

  function toggleMaterial(value: string) {
    setForm((prev) => {
      const next = new Set(prev.materials);
      next.has(value) ? next.delete(value) : next.add(value);
      return { ...prev, materials: next };
    });
  }

  // ── Attachment helpers ───────────────────────────────────────────────────

  function addAttachments(files: FileList | File[]) {
    setAttachmentError(null);
    const arr = Array.from(files);
    const valid: AttachedFile[] = [];

    for (const file of arr) {
      if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
        setAttachmentError(`Maximale bestandsgrootte is ${MAX_ATTACHMENT_MB} MB per bestand.`);
        continue;
      }
      if (attachments.length + valid.length >= MAX_ATTACHMENTS) {
        setAttachmentError(`Maximaal ${MAX_ATTACHMENTS} bijlagen.`);
        break;
      }
      valid.push({ id: `${Date.now()}-${Math.random()}`, file });
    }
    setAttachments((prev) => [...prev, ...valid]);
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  function handleAttachmentDrop(e: React.DragEvent) {
    e.preventDefault();
    attachmentDropRef.current?.classList.remove('border-blue-400', 'bg-blue-50');
    addAttachments(e.dataTransfer.files);
  }

  function handleAttachmentDragOver(e: React.DragEvent) {
    e.preventDefault();
    attachmentDropRef.current?.classList.add('border-blue-400', 'bg-blue-50');
  }

  function handleAttachmentDragLeave() {
    attachmentDropRef.current?.classList.remove('border-blue-400', 'bg-blue-50');
  }

  // ── Validation ───────────────────────────────────────────────────────────

  function validate(): boolean {
    const required: Array<[keyof FormState, string]> = [
      ['title', 'title'],
      ['name', 'name'],
      ['org', 'org'],
      ['contact', 'contact'],
      ['description', 'description'],
      ['desired', 'desired'],
    ];
    const invalid = new Set(
      required.filter(([key]) => !(form[key] as string).trim()).map(([, id]) => id)
    );
    setErrors(invalid);
    return invalid.size === 0;
  }

  // ── Submission ───────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!validate()) return;

    const today = new Date().toLocaleDateString('nl-NL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    const filledSteps = form.steps.map((s) => s.trim()).filter(Boolean);
    const stepsText = filledSteps.length
      ? filledSteps.map((s, i) => `**Step ${i + 1} · Stap ${i + 1}:** ${s}`).join('\n\n')
      : '*(not provided)*';

    const selectedMaterials = Array.from(form.materials).map((m) =>
      m === '__other__' ? form.materialOther.trim() || 'Other' : m
    );
    const materialsText = selectedMaterials.length
      ? selectedMaterials.map((m) => `- ${m}`).join('\n')
      : '- *(none indicated)*';

    const markdownBody = `## 1. Submitter · Indiener

| Field · Veld | Value · Waarde |
|---|---|
| Name · Naam | ${form.name.trim()} |
| Organisation · Organisatie | ${form.org.trim()} |
| Role · Functie | ${form.role.trim() || '—'} |
| Contact | ${form.contact.trim()} |
| Date submitted · Datum ingediend | ${today} |

---

## 2. Description · Beschrijving

${form.description.trim()}

---

## 3. Current Situation · Huidige situatie

${form.current.trim() || '*(not provided)*'}

---

## 4. Desired Outcome · Gewenst resultaat

${form.desired.trim()}

---

## 5. Concrete Example · Concreet voorbeeld

${stepsText}

---

## 6. Relevant Legislation · Relevante wet- of regelgeving

${form.legislation.trim() || '*(not provided)*'}

---

## 7. Affected Parties · Betrokken partijen

${form.parties.trim() || '*(not provided)*'}

---

## 8. Existing Materials · Bestaande materialen

${materialsText}

---

## 9. Priority · Prioriteit

${form.priority}

---

${PO_ASSESSMENT_TEMPLATE}`;

    setSubmitState('submitting');
    setSuccessData(null);
    setErrorMessage('');

    try {
      // ── Pre-upload attachments to GitLab, collect markdown references ──
      const attachmentMarkdown: string[] = [];
      for (const a of attachments) {
        const fd = new FormData();
        fd.append('file', a.file, a.file.name);
        const uploadRes = await fetch(`${API_BASE_URL}/public/upload-file`, {
          method: 'POST',
          body: fd,
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok || !uploadData.success) {
          throw new Error(`Bestand uploaden mislukt: ${uploadData.error?.message ?? a.file.name}`);
        }
        attachmentMarkdown.push(uploadData.data.markdown);
      }

      const attachmentsSection =
        attachmentMarkdown.length > 0
          ? `\n\n---\n\n## Bijlagen · Attachments\n\n${attachmentMarkdown.join('\n\n')}`
          : '';

      // ── Submit use-case as JSON (with attachment references embedded) ──
      const response = await fetch(`${API_BASE_URL}/public/use-case`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          description: markdownBody + attachmentsSection,
          altcha: altchaPayload,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || `HTTP ${response.status}`);
      }

      setSuccessData(data.data);
      setSubmitState('success');
      setForm(initialForm());
      setAttachments([]);
      setAltchaPayload('');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error');
      setSubmitState('error');
    }
  }

  // ── Styles ───────────────────────────────────────────────────────────────

  const inputCls = (field: string) =>
    `w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
      errors.has(field) ? 'border-red-400 bg-red-50' : 'border-gray-300'
    }`;

  // ── Render ───────────────────────────────────────────────────────────────

  if (submitState === 'success' && successData) {
    return (
      <div className="max-w-2xl">
        <div className="bg-green-50 border border-green-300 rounded-xl p-6">
          <p className="text-2xl mb-2">✅</p>
          <h2 className="text-lg font-bold text-green-800 mb-1">Succesvol ingediend</h2>
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
            Nieuw gebruiksscenario indienen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-4 pb-8">
      {/* Intro */}
      <div>
        <h2 className="text-lg font-bold text-gray-800 mb-1">Gebruiksscenario indienen</h2>
        <p className="text-sm text-gray-500 leading-relaxed">
          Gebruik dit formulier om een nieuw gebruiksscenario in te dienen voor het IOU
          Architecture-ecosysteem. Vul alle secties zo volledig mogelijk in — technische kennis is
          niet vereist.
        </p>
      </div>

      {/* ── 1. Title ── */}
      <Card number="1" en="Title" nl="Titel">
        <Field label="Short, descriptive name · Korte, beschrijvende naam" required>
          <input
            className={inputCls('title')}
            placeholder="e.g. Subsidy eligibility check for Flevoland residents"
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
          />
        </Field>
      </Card>

      {/* ── 2. Submitter ── */}
      <Card number="2" en="Submitter" nl="Indiener">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Name · Naam" required>
            <input
              className={inputCls('name')}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </Field>
          <Field label="Organisation · Organisatie" required>
            <input
              className={inputCls('org')}
              value={form.org}
              onChange={(e) => set('org', e.target.value)}
            />
          </Field>
          <Field label="Role / Function · Functie">
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

      {/* ── 3. Description ── */}
      <Card number="3" en="Description" nl="Beschrijving">
        <Field label="What is this use case about? · Waar gaat dit gebruiksscenario over?" required>
          <textarea
            className={inputCls('description')}
            rows={4}
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
          />
        </Field>
      </Card>

      {/* ── 4. Current situation ── */}
      <Card number="4" en="Current Situation" nl="Huidige situatie">
        <Field label="How is this handled today? · Hoe wordt dit nu gedaan?">
          <textarea
            className={inputCls('current')}
            rows={3}
            placeholder="e.g. Manual spreadsheet, phone calls, paper forms…"
            value={form.current}
            onChange={(e) => set('current', e.target.value)}
          />
        </Field>
      </Card>

      {/* ── 5. Desired outcome ── */}
      <Card number="5" en="Desired Outcome" nl="Gewenst resultaat">
        <Field label="What should the system do? · Wat moet het systeem doen?" required>
          <textarea
            className={inputCls('desired')}
            rows={3}
            value={form.desired}
            onChange={(e) => set('desired', e.target.value)}
          />
        </Field>
      </Card>

      {/* ── 6. Steps ── */}
      <Card number="6" en="Concrete Example" nl="Concreet voorbeeld">
        <p className="text-xs text-gray-500 mb-3">
          Describe the process step by step. Real or fictional data is fine. ·{' '}
          <em>Beschrijf het proces stap voor stap.</em>
        </p>
        <div className="space-y-2">
          {form.steps.map((step, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="flex-shrink-0 w-5 h-5 rounded-md bg-slate-500 text-white text-xs flex items-center justify-center mt-2.5 font-mono font-semibold">
                {i + 1}
              </span>
              <textarea
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={2}
                placeholder={`Describe step ${i + 1}… · Beschrijf stap ${i + 1}…`}
                value={step}
                onChange={(e) => setStep(i, e.target.value)}
              />
              {form.steps.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeStep(i)}
                  className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-200 text-gray-400 text-xs flex items-center justify-center mt-2.5 hover:bg-red-100 hover:text-red-500 transition-colors"
                  title="Remove step · Stap verwijderen"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addStep}
          className="mt-3 flex items-center gap-1.5 text-sm text-blue-600 border border-dashed border-blue-400 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition-colors"
        >
          <span className="text-base leading-none">+</span> Add step · Stap toevoegen
        </button>
      </Card>

      {/* ── 7. Legislation ── */}
      <Card number="7" en="Relevant Legislation or Policy" nl="Relevante wet- of regelgeving">
        <Field label="Which law or policy document does this relate to? · Welke wet of beleidsdocument?">
          <textarea
            className={inputCls('legislation')}
            rows={2}
            placeholder="e.g. Participatiewet, artikel 11 · Omgevingswet, artikel 4.2"
            value={form.legislation}
            onChange={(e) => set('legislation', e.target.value)}
          />
        </Field>
      </Card>

      {/* ── 8. Affected parties ── */}
      <Card number="8" en="Affected Parties" nl="Betrokken partijen">
        <Field label="Who is involved in or affected by this use case? · Wie is betrokken?">
          <textarea
            className={inputCls('parties')}
            rows={2}
            placeholder="e.g. Inwoners Flevoland, afdeling Sociale Zaken, SVB"
            value={form.parties}
            onChange={(e) => set('parties', e.target.value)}
          />
        </Field>
      </Card>

      {/* ── 9. Materials ── */}
      <Card number="9" en="Existing Materials" nl="Bestaande materialen">
        <p className="text-xs text-gray-500 mb-3">
          Do you have documents or process descriptions that already capture this use case? ·{' '}
          <em>Heeft u documenten die dit gebruiksscenario al beschrijven?</em>
        </p>
        <div className="space-y-2">
          {MATERIAL_OPTIONS.map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.materials.has(opt)}
                onChange={() => toggleMaterial(opt)}
                className="accent-blue-600"
              />
              {opt}
            </label>
          ))}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.materials.has('__other__')}
                onChange={() => toggleMaterial('__other__')}
                className="accent-blue-600"
              />
              Overig / Other:
            </label>
            <input
              type="text"
              className="border border-gray-300 rounded px-2 py-1 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="specify…"
              value={form.materialOther}
              onChange={(e) => setForm((prev) => ({ ...prev, materialOther: e.target.value }))}
              disabled={!form.materials.has('__other__')}
            />
          </div>
        </div>

        {/* ── File upload ── */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-500 mb-2">
            Optionally attach files (PDF, Word, diagrams…) ·{' '}
            <em>
              Voeg optioneel bestanden toe — max. {MAX_ATTACHMENTS} bestanden van elk max.{' '}
              {MAX_ATTACHMENT_MB} MB.
            </em>
          </p>
          <div
            ref={attachmentDropRef}
            onDrop={handleAttachmentDrop}
            onDragOver={handleAttachmentDragOver}
            onDragLeave={handleAttachmentDragLeave}
            onClick={() => attachmentInputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 rounded-lg px-4 py-3 text-center cursor-pointer transition-colors hover:border-gray-400 hover:bg-gray-50"
          >
            <p className="text-sm text-gray-400">
              Sleep bestanden hier of{' '}
              <span className="underline" style={{ color: 'var(--color-primary, #0046ad)' }}>
                kies bestanden
              </span>
            </p>
            <input
              ref={attachmentInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && addAttachments(e.target.files)}
            />
          </div>

          {attachmentError && <p className="text-xs text-red-600 mt-1">{attachmentError}</p>}

          {attachments.length > 0 && (
            <ul className="mt-2 space-y-1">
              {attachments.map((a) => (
                <li key={a.id} className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="text-gray-400">📎</span>
                  <span className="truncate flex-1">{a.file.name}</span>
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {(a.file.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(a.id)}
                    className="flex-shrink-0 w-4 h-4 rounded-full bg-gray-200 text-gray-400 text-xs flex items-center justify-center hover:bg-red-100 hover:text-red-500 transition-colors"
                    title="Verwijderen"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {/* ── 10. Priority ── */}
      <Card number="10" en="Priority" nl="Prioriteit">
        <p className="text-xs text-gray-500 mb-3">
          How urgent is this for your work? · <em>Hoe urgent is dit voor uw werk?</em>
        </p>
        <div className="grid grid-cols-2 gap-2">
          {PRIORITY_OPTIONS.map((opt) => {
            const selected = form.priority === opt.value;
            return (
              <label
                key={opt.value}
                className={`flex items-start gap-2 border-2 rounded-lg p-3 cursor-pointer transition-colors ${
                  selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="priority"
                  value={opt.value}
                  checked={selected}
                  onChange={() => set('priority', opt.value)}
                  className="accent-blue-600 mt-0.5"
                />
                <span>
                  <span className="text-sm font-semibold text-gray-800 block">{opt.label}</span>
                  <span className="text-xs text-gray-500">{opt.sub}</span>
                </span>
              </label>
            );
          })}
        </div>
      </Card>

      {/* PO notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
        <strong>🔒 PO Beoordeling</strong> — Deze sectie wordt na indiening ingevuld door de Product
        Owner en maakt geen deel uit van dit formulier.
      </div>

      {/* Validation errors */}
      {errors.size > 0 && (
        <div className="bg-red-50 border border-red-300 rounded-xl px-4 py-3 text-sm text-red-700">
          <strong>Vul de verplichte velden in:</strong>
          <ul className="list-disc list-inside mt-1 space-y-0.5">
            {errors.has('title') && <li>Titel</li>}
            {errors.has('name') && <li>Naam</li>}
            {errors.has('org') && <li>Organisatie</li>}
            {errors.has('contact') && <li>Contact (e-mail)</li>}
            {errors.has('description') && <li>Beschrijving</li>}
            {errors.has('desired') && <li>Gewenst resultaat</li>}
          </ul>
        </div>
      )}

      {/* Submit error */}
      {submitState === 'error' && (
        <div className="bg-red-50 border border-red-300 rounded-xl px-4 py-3 text-sm text-red-700">
          <strong>❌ Indiening mislukt</strong> — {errorMessage}
        </div>
      )}

      {/* ALTCHA */}
      <AltchaWidget
        challengeUrl={`${API_BASE_URL}/public/altcha/challenge`}
        onVerify={setAltchaPayload}
        onExpire={() => setAltchaPayload('')}
      />

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
          Uw indiening maakt een werkitem aan in het IOU Architecture-projectbeheer.
        </p>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function Card({
  number,
  en,
  nl,
  children,
}: {
  number: string;
  en: string;
  nl: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 bg-gray-50">
        <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold flex-shrink-0">
          {number}
        </span>
        <span className="text-sm font-semibold text-gray-700">
          {en} <span className="font-normal text-gray-400">· {nl}</span>
        </span>
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
    <div className="mb-0">
      <label className="block text-xs font-medium text-gray-600 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}
