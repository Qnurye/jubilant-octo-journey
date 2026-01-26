import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryInput } from '../../src/app/components/QueryInput';

describe('QueryInput', () => {
  const defaultProps = {
    onSubmit: vi.fn(),
    isLoading: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render textarea', () => {
      render(<QueryInput {...defaultProps} />);

      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('should render submit button', () => {
      render(<QueryInput {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'Ask' })).toBeInTheDocument();
    });

    it('should show placeholder text', () => {
      render(<QueryInput {...defaultProps} />);

      expect(
        screen.getByPlaceholderText(/Ask a question about algorithms/i)
      ).toBeInTheDocument();
    });

    it('should accept custom placeholder', () => {
      render(<QueryInput {...defaultProps} placeholder="Custom placeholder" />);

      expect(screen.getByPlaceholderText('Custom placeholder')).toBeInTheDocument();
    });

    it('should show character count', () => {
      render(<QueryInput {...defaultProps} />);

      expect(screen.getByText('0/2000')).toBeInTheDocument();
    });

    it('should show custom max length', () => {
      render(<QueryInput {...defaultProps} maxLength={500} />);

      expect(screen.getByText('0/500')).toBeInTheDocument();
    });

    it('should show keyboard hint', () => {
      const { container } = render(<QueryInput {...defaultProps} />);

      // Text is split by <kbd> elements
      const hint = container.querySelector('p');
      expect(hint?.textContent).toContain('Enter');
      expect(hint?.textContent).toContain('submit');
    });
  });

  describe('Text Input', () => {
    it('should update character count when typing', async () => {
      const user = userEvent.setup();
      render(<QueryInput {...defaultProps} />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Hello');

      expect(screen.getByText('5/2000')).toBeInTheDocument();
    });

    it('should accept user input', async () => {
      const user = userEvent.setup();
      render(<QueryInput {...defaultProps} />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Test query');

      expect(textarea).toHaveValue('Test query');
    });
  });

  describe('FR-UI-014: Loading States', () => {
    it('should disable textarea when loading', () => {
      render(<QueryInput {...defaultProps} isLoading={true} />);

      expect(screen.getByRole('textbox')).toBeDisabled();
    });

    it('should show "Thinking..." when loading', () => {
      render(<QueryInput {...defaultProps} isLoading={true} />);

      expect(screen.getByText('Thinking...')).toBeInTheDocument();
    });

    it('should disable submit button when loading', () => {
      render(<QueryInput {...defaultProps} isLoading={true} />);

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });
  });

  describe('Form Submission', () => {
    it('should call onSubmit with trimmed query when button is clicked', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<QueryInput onSubmit={onSubmit} isLoading={false} />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, '  Test query  ');
      
      const button = screen.getByRole('button', { name: 'Ask' });
      await user.click(button);

      expect(onSubmit).toHaveBeenCalledWith('Test query');
    });

    it('should not submit empty query', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<QueryInput onSubmit={onSubmit} isLoading={false} />);

      const button = screen.getByRole('button', { name: 'Ask' });
      await user.click(button);

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('should not submit whitespace-only query', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<QueryInput onSubmit={onSubmit} isLoading={false} />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, '   ');
      
      const button = screen.getByRole('button', { name: 'Ask' });
      await user.click(button);

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('should disable submit button for empty input', () => {
      render(<QueryInput {...defaultProps} />);

      const button = screen.getByRole('button', { name: 'Ask' });
      expect(button).toBeDisabled();
    });
  });

  describe('Keyboard Shortcuts', () => {
    it('should submit on Enter key', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<QueryInput onSubmit={onSubmit} isLoading={false} />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Test query');
      await user.keyboard('{Enter}');

      expect(onSubmit).toHaveBeenCalledWith('Test query');
    });

    it('should not submit on Shift+Enter', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<QueryInput onSubmit={onSubmit} isLoading={false} />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Test query');
      await user.keyboard('{Shift>}{Enter}{/Shift}');

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('should not submit on Enter when loading', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<QueryInput onSubmit={onSubmit} isLoading={true} />);

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'Test query' } });
      fireEvent.keyDown(textarea, { key: 'Enter' });

      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  describe('Character Limit', () => {
    it('should show warning when approaching limit (>90%)', async () => {
      const user = userEvent.setup();
      render(<QueryInput {...defaultProps} maxLength={100} />);

      const textarea = screen.getByRole('textbox');
      // Type 91 chars (>90% of 100)
      await user.type(textarea, 'a'.repeat(91));

      const counter = screen.getByText('91/100');
      expect(counter).toHaveClass('text-yellow-500');
    });

    it('should show error when exceeding limit', async () => {
      const user = userEvent.setup();
      render(<QueryInput {...defaultProps} maxLength={5} />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, '123456'); // 6 chars, over limit

      const counter = screen.getByText('6/5');
      expect(counter).toHaveClass('text-destructive');
    });

    it('should show error message when exceeding limit', async () => {
      const user = userEvent.setup();
      render(<QueryInput {...defaultProps} maxLength={5} />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, '123456');

      expect(screen.getByText(/exceeds maximum length/i)).toBeInTheDocument();
    });

    it('should disable submit when over limit', async () => {
      const user = userEvent.setup();
      render(<QueryInput {...defaultProps} maxLength={5} />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, '123456');

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });

    it('should not submit when over limit', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<QueryInput onSubmit={onSubmit} isLoading={false} maxLength={5} />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, '123456');
      await user.keyboard('{Enter}');

      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('should have proper form structure', () => {
      const { container } = render(<QueryInput {...defaultProps} />);

      expect(container.querySelector('form')).toBeInTheDocument();
    });

    it('should have submit button with type submit', () => {
      render(<QueryInput {...defaultProps} />);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('type', 'submit');
    });
  });
});
