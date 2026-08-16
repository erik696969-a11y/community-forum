import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AuthorBadges from '../AuthorBadges';

describe('<AuthorBadges />', () => {
  it('renders nothing when there are no badges', () => {
    const { container } = render(<AuthorBadges badges={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when badges is undefined/null', () => {
    const { container } = render(<AuthorBadges />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders one badge per key with its title attribute set to the badge key', () => {
    render(<AuthorBadges badges={['helpful_member', 'verified_owner']} />);
    expect(screen.getByTitle('helpful_member')).toBeInTheDocument();
    expect(screen.getByTitle('verified_owner')).toBeInTheDocument();
  });
});
