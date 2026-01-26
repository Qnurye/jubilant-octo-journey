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

    it('should display citation IDs', () => {
      render(<CitationList citations={mockCitations} />);

      expect(screen.getByText('[1]')).toBeInTheDocument();
      expect(screen.getByText('[2]')).toBeInTheDocument();
      expect(screen.getByText('[3]')).toBeInTheDocument();
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

  describe('Relevance Color Coding', () => {
    it('should show green for high relevance (>=80%)', () => {
      render(<CitationList citations={[mockCitations[0]]} />);

      const badge = screen.getByText('95%');
      expect(badge).toHaveClass('bg-green-100');
    });

    it('should show blue for medium relevance (60-79%)', () => {
      render(<CitationList citations={[mockCitations[1]]} />);

      const badge = screen.getByText('78%');
      expect(badge).toHaveClass('bg-blue-100');
    });

    it('should show yellow for low relevance (<60%)', () => {
      render(<CitationList citations={[mockCitations[2]]} />);

      const badge = screen.getByText('55%');
      expect(badge).toHaveClass('bg-yellow-100');
    });
  });

  describe('Expand/Collapse', () => {
    const manyCitations: Citation[] = Array.from({ length: 8 }, (_, i) => ({
      id: `[${i + 1}]`,
      chunkId: `chunk-00${i + 1}`,
      documentTitle: `Document ${i + 1}`,
      documentUrl: `https://example.com/doc${i + 1}`,
      snippet: `This is snippet ${i + 1}`,
      relevanceScore: 0.9 - i * 0.1,
    }));

    it('should show only maxVisible citations by default', () => {
      render(<CitationList citations={manyCitations} maxVisible={5} />);

      // Should show first 5
      expect(screen.getByText('[1]')).toBeInTheDocument();
      expect(screen.getByText('[5]')).toBeInTheDocument();
      // Should not show 6th
      expect(screen.queryByText('[6]')).not.toBeInTheDocument();
    });

    it('should show "Show all" button when more citations exist', () => {
      render(<CitationList citations={manyCitations} maxVisible={5} />);

      expect(screen.getByText('Show all 8')).toBeInTheDocument();
    });

    it('should not show expand button when citations fit', () => {
      render(<CitationList citations={mockCitations} maxVisible={5} />);

      expect(screen.queryByText(/Show all/)).not.toBeInTheDocument();
    });

    it('should expand to show all citations when clicked', () => {
      render(<CitationList citations={manyCitations} maxVisible={5} />);

      fireEvent.click(screen.getByText('Show all 8'));

      expect(screen.getByText('[6]')).toBeInTheDocument();
      expect(screen.getByText('[7]')).toBeInTheDocument();
      expect(screen.getByText('[8]')).toBeInTheDocument();
    });

    it('should show "Show less" after expanding', () => {
      render(<CitationList citations={manyCitations} maxVisible={5} />);

      fireEvent.click(screen.getByText('Show all 8'));

      expect(screen.getByText('Show less')).toBeInTheDocument();
    });

    it('should collapse back when "Show less" is clicked', () => {
      render(<CitationList citations={manyCitations} maxVisible={5} />);

      // Expand
      fireEvent.click(screen.getByText('Show all 8'));
      // Collapse
      fireEvent.click(screen.getByText('Show less'));

      expect(screen.queryByText('[6]')).not.toBeInTheDocument();
    });
  });

  describe('Citation Detail View', () => {
    it('should show detail panel when citation is clicked', () => {
      render(<CitationList citations={mockCitations} />);

      fireEvent.click(screen.getByText('Introduction to Algorithms'));

      // Detail panel should show full snippet
      expect(screen.getByText('Excerpt')).toBeInTheDocument();
    });

    it('should show document URL in detail view', () => {
      render(<CitationList citations={mockCitations} />);

      fireEvent.click(screen.getByText('Introduction to Algorithms'));

      expect(screen.getByText('https://example.com/algorithms')).toBeInTheDocument();
    });

    it('should show chunk ID in detail view', () => {
      render(<CitationList citations={mockCitations} />);

      fireEvent.click(screen.getByText('Introduction to Algorithms'));

      expect(screen.getByText('chunk-001')).toBeInTheDocument();
    });

    it('should highlight selected citation card', () => {
      render(<CitationList citations={mockCitations} />);

      const card = screen.getByText('Introduction to Algorithms').closest('button');
      fireEvent.click(card!);

      expect(card).toHaveClass('border-blue-500');
    });

    it('should close detail when clicking the same citation again', () => {
      render(<CitationList citations={mockCitations} />);

      // Get the card button
      const card = screen.getByText('Introduction to Algorithms').closest('button')!;
      
      // Open
      fireEvent.click(card);
      expect(screen.getByText('Excerpt')).toBeInTheDocument();

      // Close by clicking again - need to get card again as there are now 2 titles
      const cards = screen.getAllByText('Introduction to Algorithms');
      const cardButton = cards.find(el => el.closest('button'))?.closest('button');
      fireEvent.click(cardButton!);
      expect(screen.queryByText('Excerpt')).not.toBeInTheDocument();
    });

    it('should close detail when close button is clicked', () => {
      render(<CitationList citations={mockCitations} />);

      fireEvent.click(screen.getByText('Introduction to Algorithms'));
      
      // Find and click close button
      const closeButton = screen.getByRole('button', { name: '' }); // The X button has no text
      fireEvent.click(closeButton);

      expect(screen.queryByText('Excerpt')).not.toBeInTheDocument();
    });

    it('should switch detail view when clicking different citation', () => {
      render(<CitationList citations={mockCitations} />);

      // Click first
      fireEvent.click(screen.getByText('Introduction to Algorithms'));
      expect(screen.getByText('chunk-001')).toBeInTheDocument();

      // Click second
      fireEvent.click(screen.getByText('Data Structures Handbook'));
      expect(screen.getByText('chunk-002')).toBeInTheDocument();
      expect(screen.queryByText('chunk-001')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have clickable citation cards', () => {
      render(<CitationList citations={mockCitations} />);

      const cards = screen.getAllByRole('button');
      expect(cards.length).toBeGreaterThanOrEqual(3);
    });

    it('should open links in new tab', () => {
      render(<CitationList citations={mockCitations} />);

      fireEvent.click(screen.getByText('Introduction to Algorithms'));

      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });
});
