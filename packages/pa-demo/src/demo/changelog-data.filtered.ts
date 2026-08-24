/**
 * Stands in for src/vendor/pages/changelog-data.ts.
 *
 * The real file is the project's actual commit history rendered as UI copy
 * — ~5000 lines of engineering diary, including commit messages that quote
 * real backend hostnames and auth-library names verbatim (e.g. the entry
 * documenting this very bundle-cleanliness gate, and one confirming an OAuth
 * connection against acc.api.open-regels.nl). That is appropriate for an
 * authenticated internal tool; shipped verbatim in a public unauthenticated
 * demo it would both leak internal infrastructure detail and trip
 * scripts/check-bundle.mjs's backend-origin check, since the whole file is
 * bundled as soon as ChangelogPanel.tsx imports it — a runtime redaction
 * would leave the real strings sitting in the compiled module regardless of
 * what's rendered.
 *
 * changelog-data.ts collides with a real vendored file at that path (like
 * modes.config), so this is redirected via the same Vite-alias technique
 * documented in vite.config.ts: only the bundler is redirected here, tsc
 * still resolves ChangelogPanel.tsx's import to the real vendored file,
 * which is sound because this re-exports the same types and a same-shaped
 * `changelog` value.
 */
export type {
  ChangelogEntry,
  ChangelogVersion,
  ChangelogVersionV2,
  ChangelogSection,
  ChangelogCommit,
  ChangelogItem,
  CommitType,
  FeedbackItem,
  ScopeTag,
  ScopeValue,
  Changelog,
} from '../vendor/pages/changelog-data';
import type { Changelog } from '../vendor/pages/changelog-data';

export const changelog: Changelog = {
  versions: [
    {
      version: 'demo',
      status: 'Public demo',
      statusColor: '#2d7a33',
      borderColor: '#c3e6cd',
      date: new Date().toISOString().slice(0, 10),
      scope: 'frontend',
      sections: [
        {
          icon: '🧪',
          iconColor: '#2563eb',
          title: 'This is a read-only public demo',
          items: [
            'plato.open-regels.nl runs entirely on fixture data — there is no connection to any backend, no authentication and no way to switch to a live environment.',
            "The full engineering changelog is an internal view of the production system and isn't shown here.",
          ],
        },
      ],
    },
  ],
};
