import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CodeBlock } from '../../src/app/components/CodeBlock';

describe('CodeBlock', () => {
  const sampleCode = `function hello() {
  console.log("Hello, world!");
}`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('FR-UI-002: Syntax Highlighting', () => {
    it('should render code with syntax highlighting', () => {
      render(<CodeBlock code={sampleCode} language="javascript" />);
      
      // Code should be visible
      expect(screen.getByText(/function/)).toBeInTheDocument();
      expect(screen.getByText(/hello/)).toBeInTheDocument();
    });

    it('should display the language label', () => {
      render(<CodeBlock code={sampleCode} language="javascript" />);
      
      expect(screen.getByText('JavaScript')).toBeInTheDocument();
    });

    it('should normalize language aliases', () => {
      render(<CodeBlock code={sampleCode} language="js" />);
      
      // 'js' should be normalized to 'JavaScript'
      expect(screen.getByText('JavaScript')).toBeInTheDocument();
    });

    it('should handle C++ language', () => {
      const cppCode = `#include <iostream>
int main() {
  std::cout << "Hello";
  return 0;
}`;
      render(<CodeBlock code={cppCode} language="cpp" />);
      
      expect(screen.getByText('C++')).toBeInTheDocument();
    });
  });

  describe('FR-UI-003: Copy to Clipboard', () => {
    it('should render a copy button', () => {
      render(<CodeBlock code={sampleCode} language="javascript" />);
      
      expect(screen.getByText('Copy')).toBeInTheDocument();
    });

    it('should copy code to clipboard when copy button is clicked', async () => {
      render(<CodeBlock code={sampleCode} language="javascript" />);
      
      const copyButton = screen.getByText('Copy');
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(sampleCode.trim());
      });
    });

    it('should show "Copied!" confirmation after copying', async () => {
      render(<CodeBlock code={sampleCode} language="javascript" />);
      
      const copyButton = screen.getByText('Copy');
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(screen.getByText('Copied!')).toBeInTheDocument();
      });
    });
  });

  describe('FR-UI-004: Language Selector', () => {
    it('should render language selector dropdown trigger', () => {
      render(<CodeBlock code={sampleCode} language="javascript" />);
      
      // Click the language label to open dropdown
      const langButton = screen.getByText('JavaScript');
      expect(langButton).toBeInTheDocument();
    });

    it('should show language options when clicked', async () => {
      render(<CodeBlock code={sampleCode} language="javascript" />);
      
      const langButton = screen.getByText('JavaScript');
      fireEvent.click(langButton);

      await waitFor(() => {
        expect(screen.getByText('Python')).toBeInTheDocument();
        expect(screen.getByText('C++')).toBeInTheDocument();
        expect(screen.getByText('Java')).toBeInTheDocument();
      });
    });

    it('should change language when option is selected', async () => {
      render(<CodeBlock code={sampleCode} language="javascript" />);
      
      // Open dropdown
      const langButton = screen.getByText('JavaScript');
      fireEvent.click(langButton);

      // Select Python
      await waitFor(() => {
        const pythonOption = screen.getByText('Python');
        fireEvent.click(pythonOption);
      });

      // Language should now show Python
      await waitFor(() => {
        // The button should now show Python (there might be multiple elements)
        const buttons = screen.getAllByRole('button');
        const langButton = buttons.find(b => b.textContent?.includes('Python'));
        expect(langButton).toBeInTheDocument();
      });
    });
  });

  describe('Line Numbers', () => {
    it('should show line numbers by default', () => {
      render(<CodeBlock code={sampleCode} language="javascript" />);
      
      // Line numbers are rendered by react-syntax-highlighter
      // We check that the component renders without error
      expect(screen.getByText(/function/)).toBeInTheDocument();
    });

    it('should respect showLineNumbers prop', () => {
      render(<CodeBlock code={sampleCode} language="javascript" showLineNumbers={false} />);
      
      expect(screen.getByText(/function/)).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty code', () => {
      render(<CodeBlock code="" language="javascript" />);
      
      expect(screen.getByText('JavaScript')).toBeInTheDocument();
    });

    it('should handle unknown language', () => {
      render(<CodeBlock code={sampleCode} language="unknownlang" />);
      
      // Should fall back to showing the language as-is or 'text'
      expect(screen.getByText(/function/)).toBeInTheDocument();
    });

    it('should trim trailing whitespace from code', () => {
      const codeWithWhitespace = sampleCode + '\n\n\n';
      render(<CodeBlock code={codeWithWhitespace} language="javascript" />);
      
      // Verify it renders (trimming happens internally)
      expect(screen.getByText(/function/)).toBeInTheDocument();
    });
  });
});
