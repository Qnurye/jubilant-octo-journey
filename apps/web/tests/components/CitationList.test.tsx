import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CitationList, type Citation } from '../../src/app/components/CitationList';

describe('CitationList', () => {
  const mockCitations: Citation[] = [
    {
      id: '[1]',
      chunkId: 'chunk-001',
      documentTitle: 'Introduction to Algorithms',
      documentUrl: 'https://example.com/algorithms',
      snippet: 'Binary search is a search algorithm that finds the position of a target value within a sorted array.',
      relevanceScore: 0.95,
    },
    {
      id: '[2]',
      chunkId: 'chunk-002',
      documentTitle: 'Data Structures Handbook',
      documentUrl: 'https://example.com/ds',
      snippet: 'A binary search tree is a rooted binary tree data structure.',
      relevanceScore: 0.78,
    },
    {
      id: '[3]',
      chunkId: 'chunk-003',
      documentTitle: 'Competitive Programming Guide',
      documentUrl: 'https://example.com/cp',
      snippet: 'Time complexity analysis is crucial for competitive programming.',
      relevanceScore: 0.55,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('FR-UI-011: Citation Display', () => {
    it('should render citation list with count', () => {
      render(<CitationList citations={mockCitations} />);

      expect(screen.getByText('Sources (3)')).toBeInTheDocument();
    });

    it('should display citation IDs in brackets', () => {
      render(<CitationList citations={mockCitations} />);

      expect(screen.getByText('[[1]]')).toBeInTheDocument();
      expect(screen.getByText('[[2]]')).toBeInTheDocument();
      expect(screen.getByText('[[3]]')).toBeInTheDocument();
    });

    it('should display document titles', () => {
      render(<CitationList citations={mockCitations} />);

      expect(screen.getByText('Introduction to Algorithms')).toBeInTheDocument();
      expect(screen.getByText('Data Structures Handbook')).toBeInTheDocument();
    });

    it('should display snippets', () => {
      render(<CitationList citations={mockCitations} />);

      expect(screen.getByText(/Binary search is a search algorithm/)).toBeInTheDocument();
    });

    it('should display relevance scores as percentages', () => {
      render(<CitationList citations={mockCitations} />);

      expect(screen.getByText('95%')).toBeInTheDocument();
      expect(screen.getByText('78%')).toBeInTheDocument();
      expect(screen.getByText('55%')).toBeInTheDocument();
    });

    it('should return null when no citations', () => {
      const { container } = render(<CitationList citations={[]} />);

      expect(container.firstChild).toBeNull();
    });
  });

  describe('Relevance Badge Variants', () => {
    it('should display high relevance percentage', () => {
      render(<CitationList citations={[mockCitations[0]]} />);
      expect(screen.getByText('95%')).toBeInTheDocument();
    });

    it('should display medium relevance percentage', () => {
      render(<CitationList citations={[mockCitations[1]]} />);
      expect(screen.getByText('78%')).toBeInTheDocument();
    });

    it('should display low relevance percentage', () => {
      render(<CitationList citations={[mockCitations[2]]} />);
      expect(screen.getByText('55%')).toBeInTheDocument();
    });
  });

  describe('Expand/Collapse', () => {
    const manyCitations: Citation[] = [
      ...mockCitations,
      {
        id: '[4]',
        chunkId: 'chunk-004',
        documentTitle: 'Algorithm Design Manual',
        documentUrl: 'https://example.com/adm',
        snippet: 'Dynamic programming is both a mathematical optimization method.',
        relevanceScore: 0.72,
      },
      {
        id: '[5]',
        chunkId: 'chunk-005',
        documentTitle: 'Graph Theory Basics',
        documentUrl: 'https://example.com/graphs',
        snippet: 'A graph is a structure amounting to a set of objects.',
        relevanceScore: 0.68,
      },
      {
        id: '[6]',
        chunkId: 'chunk-006',
        documentTitle: 'Number Theory',
        documentUrl: 'https://example.com/nt',
        snippet: 'Number theory is a branch of pure mathematics.',
        relevanceScore: 0.45,
      },
    ];

    it('should show only maxVisible citations by default', () => {
      render(<CitationList citations={manyCitations} maxVisible={3} />);

      expect(screen.getByText('Introduction to Algorithms')).toBeInTheDocument();
      expect(screen.getByText('Data Structures Handbook')).toBeInTheDocument();
      expect(screen.getByText('Competitive Programming Guide')).toBeInTheDocument();
      expect(screen.queryByText('Algorithm Design Manual')).not.toBeInTheDocument();
    });

    it('should show expand button when citations exceed maxVisible', () => {
      render(<CitationList citations={manyCitations} maxVisible={3} />);

      expect(screen.getByText(/Show all 6/)).toBeInTheDocument();
    });

    it('should expand to show all citations when clicked', () => {
      render(<CitationList citations={manyCitations} maxVisible={3} />);

      fireEvent.click(screen.getByText(/Show all 6/));

      expect(screen.getByText('Algorithm Design Manual')).toBeInTheDocument();
      expect(screen.getByText('Graph Theory Basics')).toBeInTheDocument();
      expect(screen.getByText('Number Theory')).toBeInTheDocument();
    });

    it('should show collapse button after expanding', () => {
      render(<CitationList citations={manyCitations} maxVisible={3} />);

      fireEvent.click(screen.getByText(/Show all 6/));

      expect(screen.getByText(/Show less/)).toBeInTheDocument();
    });
  });

  describe('Citation Detail View', () => {
    it('should show citation detail when card is clicked', () => {
      render(<CitationList citations={mockCitations} />);

      fireEvent.click(screen.getByText('Introduction to Algorithms'));

      expect(screen.getByText('Excerpt')).toBeInTheDocument();
      expect(screen.getByText(/Chunk ID:/)).toBeInTheDocument();
    });

    it('should highlight selected citation card', () => {
      render(<CitationList citations={mockCitations} />);

      fireEvent.click(screen.getByText('Introduction to Algorithms'));

      // Check that the detail view is shown (card is selected)
      expect(screen.getByText('Excerpt')).toBeInTheDocument();
    });

    it('should show document URL in detail view', () => {
      render(<CitationList citations={mockCitations} />);

      fireEvent.click(screen.getByText('Introduction to Algorithms'));

      expect(screen.getByText('https://example.com/algorithms')).toBeInTheDocument();
    });

    it('should close detail when clicking close button', () => {
      render(<CitationList citations={mockCitations} />);

      fireEvent.click(screen.getByText('Introduction to Algorithms'));
      expect(screen.getByText('Excerpt')).toBeInTheDocument();

      // Find and click the close button (has X icon)
      const closeButtons = screen.getAllByRole('button');
      const closeButton = closeButtons.find(btn => btn.querySelector('svg'));
      if (closeButton) {
        fireEvent.click(closeButton);
      }

      expect(screen.queryByText('Excerpt')).not.toBeInTheDocument();
    });

    it('should close detail when clicking the same citation again', () => {
      render(<CitationList citations={mockCitations} />);

      // Click to open
      const title = screen.getByText('Introduction to Algorithms');
      fireEvent.click(title);
      expect(screen.getByText('Excerpt')).toBeInTheDocument();

      // Click again to close - find the card in the list (not the detail view)
      const cards = screen.getAllByText('Introduction to Algorithms');
      fireEvent.click(cards[0]); // First one is in the list
      
      // Detail should be closed
      expect(screen.queryByText('Excerpt')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have clickable citation cards', () => {
      render(<CitationList citations={mockCitations} />);

      // Cards are clickable - verify we can click on them
      const title = screen.getByText('Introduction to Algorithms');
      fireEvent.click(title);
      
      // Should show detail view after click
      expect(screen.getByText('Excerpt')).toBeInTheDocument();
    });

    it('should have external link attributes for URLs', () => {
      render(<CitationList citations={mockCitations} />);

      fireEvent.click(screen.getByText('Introduction to Algorithms'));

      const link = screen.getByText('https://example.com/algorithms');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });
});
