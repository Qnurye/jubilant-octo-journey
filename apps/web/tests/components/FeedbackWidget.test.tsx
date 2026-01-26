import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FeedbackWidget } from '../../src/app/components/FeedbackWidget';

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('FeedbackWidget', () => {
  const defaultProps = {
    queryId: 'query-123',
    apiUrl: 'http://localhost:3001',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Helper to get star buttons
  const getStarButtons = () => {
    return screen.getAllByRole('button').filter(btn => 
      btn.getAttribute('aria-label')?.includes('Rate')
    );
  };

  describe('Rendering', () => {
    it('should render the feedback prompt', () => {
      render(<FeedbackWidget {...defaultProps} />);

      expect(screen.getByText('Was this response helpful?')).toBeInTheDocument();
    });

    it('should render 5 star buttons', () => {
      render(<FeedbackWidget {...defaultProps} />);

      const stars = getStarButtons();
      expect(stars).toHaveLength(5);
    });

    it('should render submit button', () => {
      render(<FeedbackWidget {...defaultProps} />);

      expect(screen.getByText('Submit Feedback')).toBeInTheDocument();
    });

    it('should render compact version when compact prop is true', () => {
      render(<FeedbackWidget {...defaultProps} compact />);

      expect(screen.getByText('Rate this response:')).toBeInTheDocument();
      expect(screen.queryByText('Was this response helpful?')).not.toBeInTheDocument();
    });
  });

  describe('Star Rating', () => {
    it('should show rating label after selection', async () => {
      const user = userEvent.setup();
      render(<FeedbackWidget {...defaultProps} />);

      const stars = getStarButtons();

      await user.click(stars[4]); // 5 stars
      expect(screen.getByText('Excellent')).toBeInTheDocument();
    });

    it('should show comment field after rating is selected', async () => {
      const user = userEvent.setup();
      render(<FeedbackWidget {...defaultProps} />);

      expect(screen.queryByLabelText(/Additional comments/)).not.toBeInTheDocument();

      const stars = getStarButtons();
      await user.click(stars[2]);

      expect(screen.getByLabelText(/Additional comments/)).toBeInTheDocument();
    });

    it('should show different labels for different ratings', async () => {
      const user = userEvent.setup();
      render(<FeedbackWidget {...defaultProps} />);

      const stars = getStarButtons();

      await user.click(stars[0]); // 1 star
      expect(screen.getByText('Poor')).toBeInTheDocument();

      await user.click(stars[1]); // 2 stars
      expect(screen.getByText('Fair')).toBeInTheDocument();

      await user.click(stars[2]); // 3 stars
      expect(screen.getByText('Good')).toBeInTheDocument();

      await user.click(stars[3]); // 4 stars
      expect(screen.getByText('Very Good')).toBeInTheDocument();
    });
  });

  describe('Comment Field', () => {
    it('should accept user input', async () => {
      const user = userEvent.setup();
      render(<FeedbackWidget {...defaultProps} />);

      // Select rating first
      const stars = getStarButtons();
      await user.click(stars[2]);

      const textarea = screen.getByLabelText(/Additional comments/);
      await user.type(textarea, 'Great response!');

      expect(textarea).toHaveValue('Great response!');
    });

    it('should show character count', async () => {
      const user = userEvent.setup();
      render(<FeedbackWidget {...defaultProps} />);

      const stars = getStarButtons();
      await user.click(stars[2]);

      expect(screen.getByText('0/2000')).toBeInTheDocument();

      const textarea = screen.getByLabelText(/Additional comments/);
      await user.type(textarea, 'Test');

      expect(screen.getByText('4/2000')).toBeInTheDocument();
    });
  });

  describe('Form Submission', () => {
    it('should disable submit button when no rating selected', () => {
      render(<FeedbackWidget {...defaultProps} />);

      const submitButton = screen.getByText('Submit Feedback');
      expect(submitButton).toBeDisabled();
    });

    it('should enable submit button after rating selection', async () => {
      const user = userEvent.setup();
      render(<FeedbackWidget {...defaultProps} />);

      const stars = getStarButtons();
      await user.click(stars[2]);

      const submitButton = screen.getByText('Submit Feedback');
      expect(submitButton).not.toBeDisabled();
    });

    it('should submit feedback to API', async () => {
      const user = userEvent.setup();
      const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      } as Response);

      render(<FeedbackWidget {...defaultProps} />);

      const stars = getStarButtons();
      await user.click(stars[3]); // 4 stars

      const submitButton = screen.getByText('Submit Feedback');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:3001/api/feedback',
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              queryId: 'query-123',
              rating: 4,
              comment: undefined,
            }),
          })
        );
      });
    });

    it('should include comment in submission', async () => {
      const user = userEvent.setup();
      const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      } as Response);

      render(<FeedbackWidget {...defaultProps} />);

      const stars = getStarButtons();
      await user.click(stars[4]); // 5 stars

      const textarea = screen.getByLabelText(/Additional comments/);
      await user.type(textarea, 'Very helpful!');

      const submitButton = screen.getByText('Submit Feedback');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:3001/api/feedback',
          expect.objectContaining({
            body: JSON.stringify({
              queryId: 'query-123',
              rating: 5,
              comment: 'Very helpful!',
            }),
          })
        );
      });
    });

    it('should call onSubmit callback on success', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      } as Response);

      render(<FeedbackWidget {...defaultProps} onSubmit={onSubmit} />);

      const stars = getStarButtons();
      await user.click(stars[2]); // 3 stars

      const submitButton = screen.getByText('Submit Feedback');
      await user.click(submitButton);

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(3, undefined);
      });
    });
  });

  describe('Success State', () => {
    it('should show success message after submission', async () => {
      const user = userEvent.setup();
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      } as Response);

      render(<FeedbackWidget {...defaultProps} />);

      const stars = getStarButtons();
      await user.click(stars[4]);

      const submitButton = screen.getByText('Submit Feedback');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Thank you for your feedback!')).toBeInTheDocument();
      });
    });

    it('should hide form after successful submission', async () => {
      const user = userEvent.setup();
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      } as Response);

      render(<FeedbackWidget {...defaultProps} />);

      const stars = getStarButtons();
      await user.click(stars[4]);

      const submitButton = screen.getByText('Submit Feedback');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.queryByText('Submit Feedback')).not.toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should call onError callback on failure', async () => {
      const user = userEvent.setup();
      const onError = vi.fn();
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ message: 'Server error' }),
      } as Response);

      render(<FeedbackWidget {...defaultProps} onError={onError} />);

      const stars = getStarButtons();
      await user.click(stars[2]);

      const submitButton = screen.getByText('Submit Feedback');
      await user.click(submitButton);

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith('Server error');
      });
    });
  });

  describe('Compact Mode', () => {
    it('should show submit button after rating in compact mode', async () => {
      const user = userEvent.setup();
      render(<FeedbackWidget {...defaultProps} compact />);

      expect(screen.queryByText('Submit')).not.toBeInTheDocument();

      const stars = getStarButtons();
      await user.click(stars[2]);

      expect(screen.getByText('Submit')).toBeInTheDocument();
    });
  });
});
