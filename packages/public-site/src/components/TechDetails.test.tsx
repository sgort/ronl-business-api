// packages/public-site/src/components/TechDetails.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TechDetails from './TechDetails';
import { translations } from '../i18n';

const t = translations.nl;
const rows: [string, string][] = [
  ['service.uri', 'https://regels.overheid.nl/services/digital-twin'],
  ['api', '/v1/public/regels/digital-twin-inkomensregelingen'],
];

describe('TechDetails', () => {
  it('renders the key/value table without a download line when there is nothing to download', () => {
    render(<TechDetails t={t} rows={rows} />);
    expect(screen.getByText('service.uri')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders a clickable download link per DMN, labelled with its filename', () => {
    render(
      <TechDetails
        t={t}
        rows={rows}
        downloads={[
          {
            title: 'HvA_full_dmn_export-patched.dmn',
            xmlUrl: 'https://lde.test/v1/dmns/_bad36e9e/xml',
          },
        ]}
      />
    );
    const link = screen.getByRole('link', { name: /HvA_full_dmn_export-patched\.dmn/ });
    expect(link).toHaveAttribute('href', 'https://lde.test/v1/dmns/_bad36e9e/xml');
  });

  it('puts the download in the key/value table so it aligns with the other rows', () => {
    render(
      <TechDetails
        t={t}
        rows={rows}
        downloads={[
          {
            title: 'HvA_full_dmn_export-patched.dmn',
            xmlUrl: 'https://lde.test/v1/dmns/_bad36e9e/xml',
          },
        ]}
      />
    );
    // Same <tr> shape as service.uri/api: key in the <th> column, link in the
    // <td> column, so the link starts where /v1/public/... starts.
    const key = screen.getByText(t.techDmnDownload);
    expect(key.tagName).toBe('TH');
    const link = screen.getByRole('link', { name: /HvA_full_dmn_export-patched\.dmn/ });
    expect(link.closest('td')?.closest('tr')).toBe(key.closest('tr'));
  });

  it('renders one line per DMN when a service publishes several', () => {
    render(
      <TechDetails
        t={t}
        rows={rows}
        downloads={[
          { title: 'first.dmn', xmlUrl: 'https://lde.test/v1/dmns/first/xml' },
          { title: 'second.dmn', xmlUrl: 'https://lde.test/v1/dmns/second/xml' },
        ]}
      />
    );
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });
});
