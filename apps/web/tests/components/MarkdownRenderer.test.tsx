import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MarkdownRenderer } from '../../src/app/components/MarkdownRenderer';

// Mock CodeBlock to simplify testing
vi.mock('../../src/app/components/CodeBlock', () => ({
  CodeBlock: ({ code, language }: { code: string; language: string }) => (
    <pre data-testid="code-block" data-language={language}>
      {code}
    </pre>
  ),
}));

// Mock KaTeX CSS import
vi.mock('katex/dist/katex.min.css', () => ({}));

describe('MarkdownRenderer', () => {
  describe('Basic Markdown', () => {
    it('should render paragraphs', () => {
      render(<MarkdownRenderer content="Hello world" />);

      expect(screen.getByText('Hello world')).toBeInTheDocument();
    });

    it('should render multiple paragraphs', () => {
      const content = `First paragraph

Second paragraph`;
      render(<MarkdownRenderer content={content} />);

      expect(screen.getByText('First paragraph')).toBeInTheDocument();
      expect(screen.getByText('Second paragraph')).toBeInTheDocument();
    });

    it('should render headings', () => {
      // Test each heading level separately to avoid GFM auto-linking issues
      render(<MarkdownRenderer content="# Heading 1" />);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Heading 1');
    });

    it('should render h2 headings', () => {
      render(<MarkdownRenderer content="## Heading 2" />);
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Heading 2');
    });

    it('should render h3 headings', () => {
      render(<MarkdownRenderer content="### Heading 3" />);
      expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Heading 3');
    });

    it('should render bold text', () => {
      render(<MarkdownRenderer content="This is **bold** text" />);

      expect(screen.getByText('bold')).toHaveClass('font-semibold');
    });

    it('should render italic text', () => {
      render(<MarkdownRenderer content="This is *italic* text" />);

      expect(screen.getByText('italic')).toBeInTheDocument();
      expect(screen.getByText('italic').tagName).toBe('EM');
    });
  });

  describe('Lists', () => {
    it('should render unordered lists', () => {
      const content = `- Item 1
- Item 2
- Item 3`;
      render(<MarkdownRenderer content={content} />);

      expect(screen.getByText('Item 1')).toBeInTheDocument();
      expect(screen.getByText('Item 2')).toBeInTheDocument();
      expect(screen.getByText('Item 3')).toBeInTheDocument();
    });

    it('should render ordered lists', () => {
      const content = `1. First
2. Second
3. Third`;
      render(<MarkdownRenderer content={content} />);

      expect(screen.getByText('First')).toBeInTheDocument();
      expect(screen.getByText('Second')).toBeInTheDocument();
      expect(screen.getByText('Third')).toBeInTheDocument();
    });
  });

  describe('Links', () => {
    it('should render links', () => {
      render(<MarkdownRenderer content="[Click here](https://example.com)" />);

      const link = screen.getByRole('link', { name: 'Click here' });
      expect(link).toHaveAttribute('href', 'https://example.com');
    });

    it('should open links in new tab', () => {
      render(<MarkdownRenderer content="[Link](https://example.com)" />);

      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  describe('Blockquotes', () => {
    it('should render blockquotes', () => {
      render(<MarkdownRenderer content="> This is a quote" />);

      const blockquote = screen.getByText('This is a quote').closest('blockquote');
      expect(blockquote).toBeInTheDocument();
      expect(blockquote).toHaveClass('border-l-4');
    });
  });

  describe('Horizontal Rules', () => {
    it('should render horizontal rules', () => {
      const content = `Above

---

Below`;
      const { container } = render(<MarkdownRenderer content={content} />);

      const hr = container.querySelector('hr');
      expect(hr).toBeInTheDocument();
    });
  });

  describe('Code Rendering', () => {
    it('should render inline code', () => {
      render(<MarkdownRenderer content="Use the `console.log()` function" />);

      const inlineCode = screen.getByText('console.log()');
      expect(inlineCode.tagName).toBe('CODE');
      expect(inlineCode).toHaveClass('font-mono');
    });

    it('should render code blocks using CodeBlock component', () => {
      const content = '```javascript\nconst x = 1;\n```';
      render(<MarkdownRenderer content={content} />);

      const codeBlock = screen.getByTestId('code-block');
      expect(codeBlock).toBeInTheDocument();
      expect(codeBlock).toHaveAttribute('data-language', 'javascript');
    });

    it('should pass correct code to CodeBlock', () => {
      const content = '```python\nprint("hello")\n```';
      render(<MarkdownRenderer content={content} />);

      const codeBlock = screen.getByTestId('code-block');
      expect(codeBlock).toHaveTextContent('print("hello")');
    });
  });

  describe('FR-UI-005: LaTeX Rendering', () => {
    it('should render inline math', () => {
      const { container } = render(<MarkdownRenderer content="The formula $E = mc^2$ is famous" />);

      // KaTeX renders into a span with class katex
      const katex = container.querySelector('.katex');
      expect(katex).toBeInTheDocument();
    });

    it('should render display math', () => {
      const content = `$$
\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}
$$`;
      const { container } = render(<MarkdownRenderer content={content} />);

      // KaTeX renders display math - check for katex class
      const katex = container.querySelector('.katex');
      expect(katex).toBeInTheDocument();
    });

    it('should render fractions', () => {
      const { container } = render(<MarkdownRenderer content="$\\frac{a}{b}$" />);

      const katex = container.querySelector('.katex');
      expect(katex).toBeInTheDocument();
    });

    it('should render Greek letters', () => {
      const { container } = render(<MarkdownRenderer content="$\\alpha \\beta \\gamma$" />);

      const katex = container.querySelector('.katex');
      expect(katex).toBeInTheDocument();
    });

    it('should render complex formulas', () => {
      const { container } = render(
        <MarkdownRenderer content="$$\\int_{0}^{\\infty} e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}$$" />
      );

      const katex = container.querySelector('.katex');
      expect(katex).toBeInTheDocument();
    });
  });

  describe('GFM (GitHub Flavored Markdown)', () => {
    it('should render tables', () => {
      const content = `| Header 1 | Header 2 |
| -------- | -------- |
| Cell 1   | Cell 2   |`;

      render(<MarkdownRenderer content={content} />);

      expect(screen.getByText('Header 1')).toBeInTheDocument();
      expect(screen.getByText('Cell 1')).toBeInTheDocument();
    });

    it('should render strikethrough', () => {
      render(<MarkdownRenderer content="~~deleted~~" />);

      const del = screen.getByText('deleted');
      expect(del.tagName).toBe('DEL');
    });

    it('should render task lists', () => {
      const content = `- [ ] Unchecked
- [x] Checked`;

      const { container } = render(<MarkdownRenderer content={content} />);

      const checkboxes = container.querySelectorAll('input[type="checkbox"]');
      expect(checkboxes).toHaveLength(2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty content', () => {
      const { container } = render(<MarkdownRenderer content="" />);

      expect(container.firstChild).toBeInTheDocument();
    });

    it('should handle mixed content (code, math, text)', () => {
      const content = `# Algorithm Analysis

The time complexity is $O(n \\log n)$.

\`\`\`python
def sort(arr):
    return sorted(arr)
\`\`\`

This is **important**.`;

      render(<MarkdownRenderer content={content} />);

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Algorithm Analysis');
      expect(screen.getByTestId('code-block')).toBeInTheDocument();
      expect(screen.getByText('important')).toHaveClass('font-semibold');
    });

    it('should handle special characters', () => {
      render(<MarkdownRenderer content="Use < and > for comparison" />);

      expect(screen.getByText(/Use < and > for comparison/)).toBeInTheDocument();
    });
  });
});
