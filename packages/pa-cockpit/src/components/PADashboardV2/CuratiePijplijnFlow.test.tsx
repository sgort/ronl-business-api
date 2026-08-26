// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import CuratiePijplijnFlow from './CuratiePijplijnFlow';

describe('CuratiePijplijnFlow', () => {
  it('renders the pipeline stages from source to curated', () => {
    render(<CuratiePijplijnFlow />);
    expect(screen.getByText('Ophalen')).toBeInTheDocument();
    expect(screen.getByText('Bevestigen')).toBeInTheDocument();
    expect(screen.getByText('Gecureerd')).toBeInTheDocument();
  });
});
