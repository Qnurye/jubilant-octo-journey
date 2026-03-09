'use client';

import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';

interface ChatBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
  children?: ReactNode;
}

export function ChatBubble({ role, content, timestamp, children }: ChatBubbleProps) {
  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] md:max-w-[75%]">
          <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-3">
            <p className="text-sm whitespace-pre-wrap">{content}</p>
          </div>
          {timestamp && (
            <p className="text-[10px] text-muted-foreground mt-1 text-right">
              {formatTime(timestamp)}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] md:max-w-[75%]">
        <Card className="rounded-2xl rounded-bl-md">
          <CardContent className="p-4">
            {children || (
              <p className="text-sm whitespace-pre-wrap">{content}</p>
            )}
          </CardContent>
        </Card>
        {timestamp && (
          <p className="text-[10px] text-muted-foreground mt-1">
            {formatTime(timestamp)}
          </p>
        )}
      </div>
    </div>
  );
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default ChatBubble;
