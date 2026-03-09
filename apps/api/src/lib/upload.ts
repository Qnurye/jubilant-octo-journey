/**
 * File Upload Utility
 *
 * Functions for handling file uploads:
 * - Save uploaded files to OS temp directory
 * - Compute SHA-256 content hash for deduplication
 * - Detect file format from filename extension
 * - Clean up temporary files
 *
 * @module apps/api/lib/upload
 */

import { createHash } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdir, writeFile, unlink, access } from 'fs/promises';

/** Result of saving an uploaded file to temp directory */
export interface SavedUpload {
  /** Absolute path to the temporary file */
  path: string;
  /** SHA-256 hex digest of the file content */
  hash: string;
  /** File size in bytes */
  size: number;
}

/** Supported document formats */
export type DocumentFormat = 'pdf' | 'markdown' | 'text';

/** Maximum allowed file size: 10MB */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Temp directory for uploads */
const UPLOAD_TEMP_DIR = join(tmpdir(), 'competitiontutor-uploads');

/**
 * Ensure the upload temp directory exists
 */
async function ensureTempDir(): Promise<void> {
  await mkdir(UPLOAD_TEMP_DIR, { recursive: true });
}

/**
 * Save an uploaded File to the OS temp directory
 *
 * Writes the file content to a unique temp path and computes
 * the SHA-256 hash of the content for deduplication.
 *
 * @param file - Web API File object from multipart form data
 * @returns Path, hash, and size of the saved file
 */
export async function saveUploadToTemp(file: File): Promise<SavedUpload> {
  await ensureTempDir();

  const buffer = Buffer.from(await file.arrayBuffer());
  const hash = createHash('sha256').update(buffer).digest('hex');

  // Sanitize filename: strip path separators to prevent path traversal (CRITICAL-02)
  const safeName = file.name.replace(/[/\\]/g, '_').replace(/\.\./g, '_');
  const ext = safeName.split('.').pop() || '';
  const uniqueName = `${crypto.randomUUID()}.${ext}`;
  const filePath = join(UPLOAD_TEMP_DIR, uniqueName);

  await writeFile(filePath, buffer);

  return {
    path: filePath,
    hash,
    size: buffer.length,
  };
}

/**
 * Remove a temporary file
 *
 * Silently ignores errors if the file doesn't exist.
 *
 * @param path - Absolute path to the temp file
 */
export async function cleanupTempFile(path: string): Promise<void> {
  try {
    await access(path);
    await unlink(path);
  } catch {
    // File already removed or never existed — no action needed
  }
}

/**
 * Detect document format from a filename extension
 *
 * @param filename - Original filename (e.g. "notes.md")
 * @returns Detected format, or null if unsupported
 */
export function detectFormat(filename: string): DocumentFormat | null {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf':
      return 'pdf';
    case 'md':
    case 'markdown':
      return 'markdown';
    case 'txt':
    case 'text':
      return 'text';
    default:
      return null;
  }
}
