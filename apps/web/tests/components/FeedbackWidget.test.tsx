import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FeedbackWidget } from '../../src/app/components/FeedbackWidget';

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

  describe('Rendering', () => {
    it('should render the feedback prompt', () => {
      render(<FeedbackWidget {...defaultProps} />);

      expect(screen.getByText('Was this response helpful?')).toBeInTheDocument();
    });

    it('should render 5 star buttons', () => {
      render(<FeedbackWidget {...defaultProps} />);

      const stars = screen.getAllByRole('button').filter(btn => 
        btn.textContent === '☆' || btn.textContent === '★'
      );
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
    it('should highlight stars when clicked', async () => {
      const user = userEvent.setup();
      render(<FeedbackWidget {...defaultProps} />);

      const stars = screen.getAllByRole('button').filter(btn => 
        btn.textContent === '☆' || btn.textContent === '★'
      );
      
      await user.click(stars[2]); // Click 3rd star

      // First 3 stars should be filled
      expect(stars[0]).toHaveTextContent('★');
      expect(stars[1]).toHaveTextContent('★');
      expect(stars[2]).toHaveTextContent('★');
      // Last 2 should be empty
      expect(stars[3]).toHaveTextContent('☆');
      expect(stars[4]).toHaveTextContent('☆');
    });

    it('should show rating label after selection', async () => {
      const user = userEvent.setup();
      render(<FeedbackWidget {...defaultProps} />);

      const stars = screen.getAllByRole('button').filter(btn => 
        btn.textContent === '☆' || btn.textContent === '★'
      );

      await user.click(stars[4]); // 5 stars
      expect(screen.getByText('Excellent')).toBeInTheDocument();

      await user.click(stars[3]); // 4 stars
      expect(screen.getByText('Very Good')).toBeInTheDocument();

      await user.click(stars[2]); // 3 stars
      expect(screen.getByText('Good')).toBeInTheDocument();

      await user.click(stars[1]); // 2 stars
      expect(screen.getByText('Fair')).toBeInTheDocument();

      await user.click(stars[0]); // 1 star
      expect(screen.getByText('Poor')).toBeInTheDocument();
    });

    it('should show comment field after rating is selected', async () => {
      const user = userEvent.setup();
      render(<FeedbackWidget {...defaultProps} />);

      expect(screen.queryByLabelText(/Additional comments/)).not.toBeInTheDocument();

      const stars = screen.getAllByRole('button').filter(btn => 
        btn.textContent === '☆' || btn.textContent === '★'
      );
      await user.click(stars[2]);

      expect(screen.getByLabelText(/Additional comments/)).toBeInTheDocument();
    });
  });

  describe('Comment Field', () => {
    it('should accept user input', async () => {
      const user = userEvent.setup();
      render(<FeedbackWidget {...defaultProps} />);

      // Select rating first
      const stars = screen.getAllByRole('button').filter(btn => 
        btn.textContent === '☆' || btn.textContent === '★'
      );
      await user.click(stars[2]);

      const textarea = screen.getByLabelText(/Additional comments/);
      await user.type(textarea, 'Great response!');

      expect(textarea).toHaveValue('Great response!');
    });

    it('should show character count', async () => {
      const user = userEvent.setup();
      render(<FeedbackWidget {...defaultProps} />);

      const stars = screen.getAllByRole('button').filter(btn => 
        btn.textContent === '☆' || btn.textContent === '★'
      );
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

    it('should not allow submission without rating (button disabled)', () => {
      render(<FeedbackWidget {...defaultProps} />);

      const submitButton = screen.getByText('Submit Feedback');
      // Button should be disabled, preventing submission
      expect(submitButton).toBeDisabled();
      expect(submitButton).toHaveClass('cursor-not-allowed');
    });

    it('should enable submit button after rating selection', async () => {
      const user = userEvent.setup();
      render(<FeedbackWidget {...defaultProps} />);

      const stars = screen.getAllByRole('button').filter(btn => 
        btn.textContent === '☆' || btn.textContent === '★'
      );
      await user.click(stars[2]);

      const submitButton = screen.getByText('Submit Feedback');
      expect(submitButton).not.toBeDisabled();
    });

    it('should submit feedback to API', async () => {
      const user = userEvent.setup();
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 })
      );

      render(<FeedbackWidget {...defaultProps} />);

      const stars = screen.getAllByRole('button').filter(btn => 
        btn.textContent === '☆' || btn.textContent === '★'
      );
      await user.click(stars[3]); // 4 stars

      await user.click(screen.getByText('Submit Feedback'));

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          'http://localhost:3001/api/feedback',
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('"rating":4'),
          })
        );
      });
    });

    it('should include comment in submission', async () => {
      const user = userEvent.setup();
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 })
      );

      render(<FeedbackWidget {...defaultProps} />);

      const stars = screen.getAllByRole('button').filter(btn => 
        btn.textContent === '☆' || btn.textContent === '★'
      );
      await user.click(stars[4]);

      const textarea = screen.getByLabelText(/Additional comments/);
      await user.type(textarea, 'Very helpful!');

      await user.click(screen.getByText('Submit Feedback'));

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            body: expect.stringContaining('"comment":"Very helpful!"'),
          })
        );
      });
    });

    it('should call onSubmit callback on success', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 })
      );

      render(<FeedbackWidget {...defaultProps} onSubmit={onSubmit} />);

      const stars = screen.getAllByRole('button').filter(btn => 
        btn.textContent === '☆' || btn.textContent === '★'
      );
      await user.click(stars[4]);
      await user.click(screen.getByText('Submit Feedback'));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(5, undefined);
      });
    });

    it('should show thank you message after submission', async () => {
      const user = userEvent.setup();
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 })
      );

      render(<FeedbackWidget {...defaultProps} />);

      const stars = screen.getAllByRole('button').filter(btn => 
        btn.textContent === '☆' || btn.textContent === '★'
      );
      await user.click(stars[4]);
      await user.click(screen.getByText('Submit Feedback'));

      await waitFor(() => {
        expect(screen.getByText('Thank you for your feedback!')).toBeInTheDocument();
      });
    });

    it('should show loading state while submitting', async () => {
      const user = userEvent.setup();
      vi.spyOn(global, 'fetch').mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(
          new Response(JSON.stringify({ success: true }), { status: 200 })
        ), 100))
      );

      render(<FeedbackWidget {...defaultProps} />);

      const stars = screen.getAllByRole('button').filter(btn => 
        btn.textContent === '☆' || btn.textContent === '★'
      );
      await user.click(stars[4]);
      await user.click(screen.getByText('Submit Feedback'));

      expect(screen.getByText('Submitting...')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should display API error message', async () => {
      const user = userEvent.setup();
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Server error' }), { status: 500 })
      );

      render(<FeedbackWidget {...defaultProps} />);

      const stars = screen.getAllByRole('button').filter(btn => 
        btn.textContent === '☆' || btn.textContent === '★'
      );
      await user.click(stars[4]);
      await user.click(screen.getByText('Submit Feedback'));

      await waitFor(() => {
        expect(screen.getByText('Server error')).toBeInTheDocument();
      });
    });

    it('should call onError callback on failure', async () => {
      const user = userEvent.setup();
      const onError = vi.fn();
      vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network error'));

      render(<FeedbackWidget {...defaultProps} onError={onError} />);

      const stars = screen.getAllByRole('button').filter(btn => 
        btn.textContent === '☆' || btn.textContent === '★'
      );
      await user.click(stars[4]);
      await user.click(screen.getByText('Submit Feedback'));

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith('Network error');
      });
    });

    it('should display network error', async () => {
      const user = userEvent.setup();
      vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network error'));

      render(<FeedbackWidget {...defaultProps} />);

      const stars = screen.getAllByRole('button').filter(btn => 
        btn.textContent === '☆' || btn.textContent === '★'
      );
      await user.click(stars[4]);
      await user.click(screen.getByText('Submit Feedback'));

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });
  });

  describe('Compact Mode', () => {
    it('should show submit button only after rating in compact mode', async () => {
      const user = userEvent.setup();
      render(<FeedbackWidget {...defaultProps} compact />);

      expect(screen.queryByText('Submit')).not.toBeInTheDocument();

      const stars = screen.getAllByRole('button').filter(btn => 
        btn.textContent === '☆' || btn.textContent === '★'
      );
      await user.click(stars[2]);

      expect(screen.getByText('Submit')).toBeInTheDocument();
    });

    it('should not show comment field in compact mode', async () => {
      const user = userEvent.setup();
      render(<FeedbackWidget {...defaultProps} compact />);

      const stars = screen.getAllByRole('button').filter(btn => 
        btn.textContent === '☆' || btn.textContent === '★'
      );
      await user.click(stars[2]);

      expect(screen.queryByLabelText(/Additional comments/)).not.toBeInTheDocument();
    });

    it('should show error inline in compact mode', async () => {
      const user = userEvent.setup();
      vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Failed'));

      render(<FeedbackWidget {...defaultProps} compact />);

      const stars = screen.getAllByRole('button').filter(btn => 
        btn.textContent === '☆' || btn.textContent === '★'
      );
      await user.click(stars[2]);
      await user.click(screen.getByText('Submit'));

      await waitFor(() => {
        expect(screen.getByText('Failed')).toBeInTheDocument();
      });
    });
  });
});
