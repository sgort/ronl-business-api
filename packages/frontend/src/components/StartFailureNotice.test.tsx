// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import StartFailureNotice from './StartFailureNotice';

const HEADLINE = 'De aanvraag kon niet worden ingediend. Probeer het opnieuw.';
const CAUSE = "no decision definition deployed with key 'AwbCompletenessCheck'";
const INSTANCE = 'http://localhost:8081/engine-rest';

describe('StartFailureNotice', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('shows the headline with the cause and engine beneath it outside production', () => {
    vi.stubEnv('MODE', 'acceptance');
    render(<StartFailureNotice failure={{ cause: CAUSE, instance: INSTANCE }} />);

    expect(screen.getByText(HEADLINE)).toBeInTheDocument();
    expect(screen.getByText(CAUSE)).toBeInTheDocument();
    expect(screen.getByText(INSTANCE)).toBeInTheDocument();
  });

  it('shows the cause without an engine line when the backend named no instance', () => {
    vi.stubEnv('MODE', 'development');
    render(<StartFailureNotice failure={{ cause: CAUSE }} />);

    expect(screen.getByText(CAUSE)).toBeInTheDocument();
    expect(screen.queryByText(/Operaton/)).not.toBeInTheDocument();
  });

  it('shows only the headline in production, whatever the backend said', () => {
    vi.stubEnv('MODE', 'production');
    render(<StartFailureNotice failure={{ cause: CAUSE, instance: INSTANCE }} />);

    expect(screen.getByText(HEADLINE)).toBeInTheDocument();
    expect(screen.queryByText(CAUSE)).not.toBeInTheDocument();
    expect(screen.queryByText(INSTANCE)).not.toBeInTheDocument();
  });

  it('shows only the headline when there is no cause to show', () => {
    vi.stubEnv('MODE', 'acceptance');
    render(<StartFailureNotice failure={{}} />);

    expect(screen.getByText(HEADLINE)).toBeInTheDocument();
    expect(screen.queryByText(/Oorzaak/)).not.toBeInTheDocument();
  });
});
