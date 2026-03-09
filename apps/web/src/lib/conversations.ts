import type { Conversation } from './types';

const INDEX_KEY = 'conv-index';
const CONV_PREFIX = 'conv:';
const MAX_STORAGE_BYTES = 4 * 1024 * 1024; // 4MB

interface ConversationIndexEntry {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}

function getIndex(): ConversationIndexEntry[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ConversationIndexEntry[];
  } catch {
    return [];
  }
}

function setIndex(index: ConversationIndexEntry[]): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

function estimateStorageUsage(): number {
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      const value = localStorage.getItem(key);
      // Each char is roughly 2 bytes in UTF-16
      total += (key.length + (value?.length || 0)) * 2;
    }
  }
  return total;
}

function evictOldest(): void {
  const index = getIndex();
  if (index.length === 0) return;

  // Sort ascending by updatedAt (oldest first)
  const sorted = [...index].sort(
    (a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
  );

  while (estimateStorageUsage() > MAX_STORAGE_BYTES && sorted.length > 0) {
    const oldest = sorted.shift();
    if (oldest) {
      localStorage.removeItem(`${CONV_PREFIX}${oldest.id}`);
      const remaining = getIndex().filter((e) => e.id !== oldest.id);
      setIndex(remaining);
    }
  }
}

export function saveConversation(conv: Conversation): void {
  const key = `${CONV_PREFIX}${conv.id}`;
  localStorage.setItem(key, JSON.stringify(conv));

  // Update index
  const index = getIndex();
  const entry: ConversationIndexEntry = {
    id: conv.id,
    title: conv.title,
    updatedAt: conv.updatedAt,
    messageCount: conv.messages.length,
  };

  const existingIdx = index.findIndex((e) => e.id === conv.id);
  if (existingIdx >= 0) {
    index[existingIdx] = entry;
  } else {
    index.push(entry);
  }

  // Sort by updatedAt descending
  index.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  setIndex(index);

  // LRU eviction if over budget
  if (estimateStorageUsage() > MAX_STORAGE_BYTES) {
    evictOldest();
  }
}

export function loadConversation(id: string): Conversation | null {
  try {
    const raw = localStorage.getItem(`${CONV_PREFIX}${id}`);
    if (!raw) return null;
    return JSON.parse(raw) as Conversation;
  } catch {
    return null;
  }
}

export function listConversations(): ConversationIndexEntry[] {
  return getIndex();
}

export function deleteConversation(id: string): void {
  localStorage.removeItem(`${CONV_PREFIX}${id}`);
  const index = getIndex().filter((e) => e.id !== id);
  setIndex(index);
}
