'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { CodeBlock } from './CodeBlock';
import type { Components } from 'react-markdown';

// Import KaTeX CSS
import 'katex/dist/katex.min.css';

interface MarkdownRendererProps {
  content: string;
  isDark?: boolean;
}

export function MarkdownRenderer({ content, isDark = true }: MarkdownRendererProps) {
  const components: Components = {
    // Custom code block rendering
    code({ className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '');
      const isInline = !match && !String(children).includes('\n');
      
      if (isInline) {
        // Inline code
        return (
          <code 
            className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-sm font-mono text-pink-600 dark:text-pink-400"
            {...props}
          >
            {children}
          </code>
        );
      }

      // Code block
      const language = match ? match[1] : 'text';
      const code = String(children).replace(/\n$/, '');
      
      return (
        <CodeBlock 
          code={code} 
          language={language} 
          isDark={isDark}
        />
      );
    },
    
    // Style other elements
    p({ children }) {
      return <p className="mb-4 leading-relaxed">{children}</p>;
    },
    
    h1({ children }) {
      return <h1 className="text-2xl font-bold mb-4 mt-6">{children}</h1>;
    },
    
    h2({ children }) {
      return <h2 className="text-xl font-bold mb-3 mt-5">{children}</h2>;
    },
    
    h3({ children }) {
      return <h3 className="text-lg font-semibold mb-2 mt-4">{children}</h3>;
    },
    
    ul({ children }) {
      return <ul className="list-disc list-inside mb-4 space-y-1">{children}</ul>;
    },
    
    ol({ children }) {
      return <ol className="list-decimal list-inside mb-4 space-y-1">{children}</ol>;
    },
    
    li({ children }) {
      return <li className="ml-2">{children}</li>;
    },
    
    blockquote({ children }) {
      return (
        <blockquote className="border-l-4 border-blue-500 pl-4 my-4 italic text-gray-600 dark:text-gray-400">
          {children}
        </blockquote>
      );
    },
    
    a({ href, children }) {
      return (
        <a 
          href={href} 
          className="text-blue-600 dark:text-blue-400 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          {children}
        </a>
      );
    },
    
    table({ children }) {
      return (
        <div className="overflow-x-auto my-4">
          <table className="min-w-full border border-gray-200 dark:border-gray-700 rounded-lg">
            {children}
          </table>
        </div>
      );
    },
    
    thead({ children }) {
      return <thead className="bg-gray-100 dark:bg-gray-800">{children}</thead>;
    },
    
    th({ children }) {
      return (
        <th className="px-4 py-2 text-left font-semibold border-b border-gray-200 dark:border-gray-700">
          {children}
        </th>
      );
    },
    
    td({ children }) {
      return (
        <td className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
          {children}
        </td>
      );
    },
    
    hr() {
      return <hr className="my-6 border-gray-200 dark:border-gray-700" />;
    },
    
    strong({ children }) {
      return <strong className="font-semibold">{children}</strong>;
    },
    
    em({ children }) {
      return <em className="italic">{children}</em>;
    },
  };

  return (
    <div className="prose dark:prose-invert max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default MarkdownRenderer;
