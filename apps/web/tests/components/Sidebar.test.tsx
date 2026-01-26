import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar } from '../../src/app/components/Sidebar';
import { SidebarProvider } from '../../src/components/ui/sidebar';

// Wrapper component for tests
function SidebarWrapper(props: Parameters<typeof Sidebar>[0]) {
  return (
    <SidebarProvider defaultOpen>
      <Sidebar {...props} />
    </SidebarProvider>
  );
}

describe('Sidebar', () => {
  const mockConversations = [
    {
      id: '1',
      title: 'Algorithm Question',
      preview: 'How do I implement binary search?',
      timestamp: new Date(Date.now() - 1000 * 60 * 5), // 5 mins ago
      messageCount: 4,
    },
    {
      id: '2',
      title: 'Dynamic Programming',
      preview: 'Explain the knapsack problem',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
      messageCount: 8,
    },
    {
      id: '3',
      title: 'Graph Traversal',
      preview: 'BFS vs DFS comparison',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3), // 3 days ago
      messageCount: 12,
    },
  ];

  const defaultProps = {
    conversations: mockConversations,
    currentId: undefined,
    onSelect: vi.fn(),
    onNewChat: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('FR-UI-008: Display Conversation History', () => {
    it('should render conversation list', () => {
      render(<SidebarWrapper {...defaultProps} />);

      expect(screen.getByText('Algorithm Question')).toBeInTheDocument();
      expect(screen.getByText('Dynamic Programming')).toBeInTheDocument();
      expect(screen.getByText('Graph Traversal')).toBeInTheDocument();
    });

    it('should display conversation preview text', () => {
      render(<SidebarWrapper {...defaultProps} />);

      expect(screen.getByText('How do I implement binary search?')).toBeInTheDocument();
      expect(screen.getByText('Explain the knapsack problem')).toBeInTheDocument();
    });

    it('should show message count for each conversation', () => {
      render(<SidebarWrapper {...defaultProps} />);

      expect(screen.getByText('4')).toBeInTheDocument();
      expect(screen.getByText('8')).toBeInTheDocument();
      expect(screen.getByText('12')).toBeInTheDocument();
    });

    it('should display relative timestamps', () => {
      render(<SidebarWrapper {...defaultProps} />);

      expect(screen.getByText('5m')).toBeInTheDocument();
      expect(screen.getByText('2h')).toBeInTheDocument();
      expect(screen.getByText('3d')).toBeInTheDocument();
    });

    it('should show total conversation count in footer', () => {
      render(<SidebarWrapper {...defaultProps} />);

      expect(screen.getByText('3 conversations')).toBeInTheDocument();
    });

    it('should handle singular conversation count', () => {
      render(<SidebarWrapper {...defaultProps} conversations={[mockConversations[0]]} />);

      expect(screen.getByText('1 conversation')).toBeInTheDocument();
    });

    it('should show empty state when no conversations', () => {
      render(<SidebarWrapper {...defaultProps} conversations={[]} />);

      expect(screen.getByText('No conversations yet')).toBeInTheDocument();
      expect(screen.getByText('Start asking questions!')).toBeInTheDocument();
    });
  });

  describe('FR-UI-009: Navigation Between Conversations', () => {
    it('should call onSelect when conversation is clicked', () => {
      render(<SidebarWrapper {...defaultProps} />);

      fireEvent.click(screen.getByText('Algorithm Question'));

      expect(defaultProps.onSelect).toHaveBeenCalledWith('1');
    });

    it('should highlight the current/active conversation', () => {
      render(<SidebarWrapper {...defaultProps} currentId="2" />);

      const activeButton = screen.getByText('Dynamic Programming').closest('button');
      expect(activeButton).toHaveAttribute('data-active', 'true');
    });

    it('should call onNewChat when New Chat button is clicked', () => {
      render(<SidebarWrapper {...defaultProps} />);

      fireEvent.click(screen.getByText('New Chat'));

      expect(defaultProps.onNewChat).toHaveBeenCalled();
    });
  });

  describe('Time Formatting', () => {
    it('should show "now" for very recent timestamps', () => {
      const recentConvo = {
        ...mockConversations[0],
        timestamp: new Date(Date.now() - 1000 * 30), // 30 seconds ago
      };
      render(<SidebarWrapper {...defaultProps} conversations={[recentConvo]} />);

      expect(screen.getByText('now')).toBeInTheDocument();
    });

    it('should show minutes for timestamps less than an hour', () => {
      const conv = {
        ...mockConversations[0],
        timestamp: new Date(Date.now() - 1000 * 60 * 45), // 45 mins ago
      };
      render(<SidebarWrapper {...defaultProps} conversations={[conv]} />);

      expect(screen.getByText('45m')).toBeInTheDocument();
    });

    it('should show hours for timestamps less than a day', () => {
      const conv = {
        ...mockConversations[0],
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 18), // 18 hours ago
      };
      render(<SidebarWrapper {...defaultProps} conversations={[conv]} />);

      expect(screen.getByText('18h')).toBeInTheDocument();
    });

    it('should show days for timestamps less than a week', () => {
      const conv = {
        ...mockConversations[0],
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5), // 5 days ago
      };
      render(<SidebarWrapper {...defaultProps} conversations={[conv]} />);

      expect(screen.getByText('5d')).toBeInTheDocument();
    });
  });
});
