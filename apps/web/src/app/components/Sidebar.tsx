'use client';

import { Plus, MessageCircle, MessageSquare } from 'lucide-react';
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

interface ConversationItem {
  id: string;
  title: string;
  preview: string;
  timestamp: Date;
  messageCount: number;
}

interface SidebarProps {
  conversations: ConversationItem[];
  currentId?: string;
  onSelect: (id: string) => void;
  onNewChat: () => void;
}

export function Sidebar({
  conversations,
  currentId,
  onSelect,
  onNewChat,
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
}: {
  conversation: ConversationItem;
  isActive: boolean;
  onClick: () => void;
}) {
  const timeAgo = getTimeAgo(conversation.timestamp);
  const { isMobile, setOpenMobile } = useSidebar();

  const handleClick = () => {
    onClick();
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <SidebarMenuItem>
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
          <p className="text-xs text-muted-foreground truncate mt-1 w-full text-left">
            {conversation.preview}
          </p>
          <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
            <MessageSquare className="size-3" />
            <span>{conversation.messageCount}</span>
          </div>
        </div>
      </SidebarMenuButton>
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
