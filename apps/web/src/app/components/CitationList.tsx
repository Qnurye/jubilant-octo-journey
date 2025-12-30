'use client';

import { useState } from 'react';

export interface Citation {
  id: string;
  chunkId: string;
  documentTitle: string;
  documentUrl: string;
  snippet: string;
  relevanceScore: number;
}

interface CitationListProps {
  citations: Citation[];
  maxVisible?: number;
}

export function CitationList({ citations, maxVisible = 5 }: CitationListProps) {
  const [expanded, setExpanded] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);

  if (citations.length === 0) {
    return null;
  }

  const visibleCitations = expanded ? citations : citations.slice(0, maxVisible);
  const hasMore = citations.length > maxVisible;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Sources ({citations.length})
        </h3>
        {hasMore && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            {expanded ? 'Show less' : `Show all ${citations.length}`}
          </button>
        )}
      </div>

      <div className="grid gap-2">
        {visibleCitations.map((citation) => (
          <CitationCard
            key={citation.id}
            citation={citation}
            isSelected={selectedCitation?.id === citation.id}
            onClick={() =>
              setSelectedCitation(
                selectedCitation?.id === citation.id ? null : citation
              )
            }
          />
        ))}
      </div>

      {selectedCitation && (
        <CitationDetail
          citation={selectedCitation}
          onClose={() => setSelectedCitation(null)}
        />
      )}
    </div>
  );
}

interface CitationCardProps {
  citation: Citation;
  isSelected: boolean;
  onClick: () => void;
}

function CitationCard({ citation, isSelected, onClick }: CitationCardProps) {
  const relevancePercent = Math.round(citation.relevanceScore * 100);
  const relevanceColor =
    relevancePercent >= 80
      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
      : relevancePercent >= 60
        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
        : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';

  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left p-3 rounded-lg border transition-all
        ${
          isSelected
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800'
        }
      `}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-bold text-blue-600 dark:text-blue-400">
            {citation.id}
          </span>
          <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
            {citation.documentTitle}
          </span>
        </div>
        <span className={`text-xs px-1.5 py-0.5 rounded ${relevanceColor}`}>
          {relevancePercent}%
        </span>
      </div>

      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
        {citation.snippet}
      </p>
    </button>
  );
}

interface CitationDetailProps {
  citation: Citation;
  onClose: () => void;
}

function CitationDetail({ citation, onClose }: CitationDetailProps) {
  return (
    <div className="mt-2 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg font-bold text-blue-600 dark:text-blue-400">
              {citation.id}
            </span>
            <h4 className="font-semibold text-gray-900 dark:text-gray-100">
              {citation.documentTitle}
            </h4>
          </div>
          {citation.documentUrl && (
            <a
              href={citation.documentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              {citation.documentUrl}
            </a>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="mt-3">
        <h5 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
          Excerpt
        </h5>
        <blockquote className="pl-3 border-l-2 border-blue-500 text-sm text-gray-700 dark:text-gray-300 italic">
          {citation.snippet}
        </blockquote>
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
        <span>
          Relevance: <strong>{Math.round(citation.relevanceScore * 100)}%</strong>
        </span>
        <span>
          Chunk ID: <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded">{citation.chunkId}</code>
        </span>
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

export default CitationList;
