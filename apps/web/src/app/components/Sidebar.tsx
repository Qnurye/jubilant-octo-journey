'use client';

import { Plus, MessageCircle, MessageSquare, Trash2 } from 'lucide-react';
import {
  Sidebar as SidebarRoot,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ConversationItem {
  id: string;
  title: string;
  preview?: string;
  timestamp?: Date;
  updatedAt?: string;
  messageCount: number;
}

interface SidebarProps {
  conversations: ConversationItem[];
  currentId?: string;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete?: (id: string) => void;
}

export function Sidebar({
  conversations,
  currentId,
  onSelect,
  onNewChat,
  onDelete,
}: SidebarProps) {
  return (
    <SidebarRoot>
      <SidebarHeader>
        <Button onClick={onNewChat} className="w-full">
          <Plus className="size-5 mr-2" />
          New Chat
        </Button>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            {conversations.length === 0 ? (
              <Empty className="border-0 p-4">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <MessageCircle className="size-5 opacity-50" />
                  </EmptyMedia>
                  <EmptyTitle className="text-sm">No conversations yet</EmptyTitle>
                  <EmptyDescription className="text-xs">
                    Start asking questions!
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <SidebarMenu>
                {conversations.map((conv) => (
                  <ConversationMenuItem
                    key={conv.id}
                    conversation={conv}
                    isActive={conv.id === currentId}
                    onClick={() => onSelect(conv.id)}
                    onDelete={onDelete ? () => onDelete(conv.id) : undefined}
                  />
                ))}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarSeparator />

      <SidebarFooter>
        <div className="text-xs text-muted-foreground text-center py-2">
          {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
        </div>
      </SidebarFooter>
    </SidebarRoot>
  );
}

function ConversationMenuItem({
  conversation,
  isActive,
  onClick,
  onDelete,
}: {
  conversation: ConversationItem;
  isActive: boolean;
  onClick: () => void;
  onDelete?: () => void;
}) {
  const resolvedDate = conversation.timestamp || (conversation.updatedAt ? new Date(conversation.updatedAt) : new Date());
  const timeAgo = getTimeAgo(resolvedDate);
  const { isMobile, setOpenMobile } = useSidebar();

  const handleClick = () => {
    onClick();
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <SidebarMenuItem className="group/item">
      <SidebarMenuButton
        isActive={isActive}
        onClick={handleClick}
        className="h-auto py-3"
        tooltip={conversation.title}
      >
        <div className="flex flex-col items-start w-full min-w-0">
          <div className="flex items-start justify-between gap-2 w-full">
            <span className="font-medium text-sm truncate">
              {conversation.title}
            </span>
            <span className="text-xs text-muted-foreground shrink-0">
              {timeAgo}
            </span>
          </div>
          {conversation.preview && (
            <p className="text-xs text-muted-foreground truncate mt-1 w-full text-left">
              {conversation.preview}
            </p>
          )}
          <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
            <MessageSquare className="size-3" />
            <span>{conversation.messageCount}</span>
          </div>
        </div>
      </SidebarMenuButton>
      {onDelete && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="absolute right-2 top-3 opacity-0 group-hover/item:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive z-10"
              aria-label="Delete conversation"
            >
              <Trash2 className="size-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Delete conversation</p>
          </TooltipContent>
        </Tooltip>
      )}
    </SidebarMenuItem>
  );
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString();
}

export default Sidebar;
