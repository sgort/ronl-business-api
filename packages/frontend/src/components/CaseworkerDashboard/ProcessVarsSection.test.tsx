// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProcessVarsSection from './ProcessVarsSection';

describe('ProcessVarsSection', () => {
  it('shows a loading state', () => {
    render(<ProcessVarsSection variables={null} loading />);
    expect(screen.getByText('Laden…')).toBeInTheDocument();
  });

  it('shows a "no data" state for null or empty variables', () => {
    const { rerender } = render(<ProcessVarsSection variables={null} />);
    expect(screen.getByText('Geen procesgegevens.')).toBeInTheDocument();

    rerender(<ProcessVarsSection variables={{}} />);
    expect(screen.getByText('Geen procesgegevens.')).toBeInTheDocument();
  });

  it('filters out internal-plumbing variables and humanizes the rest', () => {
    render(<ProcessVarsSection variables={{ municipality: 'Almere', edocsWorkspaceId: 'w-1' }} />);

    expect(screen.queryByTitle('municipality')).not.toBeInTheDocument();
    expect(screen.getByTitle('edocsWorkspaceId')).toHaveTextContent('Edocs Workspace Id');
    expect(screen.getByText('w-1')).toBeInTheDocument();
  });

  it('renders null/undefined values as an em dash and objects as JSON', () => {
    render(<ProcessVarsSection variables={{ psDate: null, extra: { nested: true } }} />);

    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('{"nested":true}')).toBeInTheDocument();
  });
});
