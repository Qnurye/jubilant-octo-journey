/**
 * Upload Utility Tests
 *
 * Tests for file upload helper functions:
 * - saveUploadToTemp: Temp file creation, hashing, path traversal prevention
 * - cleanupTempFile: File removal and graceful missing-file handling
 * - detectFormat: Extension-based format detection
 *
 * @module apps/api/tests/unit/upload
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { tmpdir } from 'os';

// We need to mock fs/promises so tests don't touch the real filesystem
const mockMkdir = vi.fn().mockResolvedValue(undefined);
const mockWriteFile = vi.fn().mockResolvedValue(undefined);
const mockUnlink = vi.fn().mockResolvedValue(undefined);
const mockAccess = vi.fn().mockResolvedValue(undefined);

vi.mock('fs/promises', () => ({
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  unlink: (...args: unknown[]) => mockUnlink(...args),
  access: (...args: unknown[]) => mockAccess(...args),
}));

// Mock crypto.randomUUID for deterministic filenames
const MOCK_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const originalRandomUUID = crypto.randomUUID;

import {
  saveUploadToTemp,
  cleanupTempFile,
  detectFormat,
  MAX_FILE_SIZE,
} from '../../src/lib/upload';

// ============================================================================
// detectFormat Tests
// ============================================================================

describe('detectFormat', () => {
  it('should detect pdf format', () => {
    expect(detectFormat('document.pdf')).toBe('pdf');
  });

  it('should detect markdown from .md extension', () => {
    expect(detectFormat('notes.md')).toBe('markdown');
  });

  it('should detect markdown from .markdown extension', () => {
    expect(detectFormat('readme.markdown')).toBe('markdown');
  });

  it('should detect text from .txt extension', () => {
    expect(detectFormat('data.txt')).toBe('text');
  });

  it('should detect text from .text extension', () => {
    expect(detectFormat('data.text')).toBe('text');
  });

  it('should return null for unsupported formats', () => {
    expect(detectFormat('photo.jpg')).toBeNull();
  });

  it('should return null for files with no extension', () => {
    expect(detectFormat('no-extension')).toBeNull();
  });

  it('should be case insensitive', () => {
    expect(detectFormat('CAPS.PDF')).toBe('pdf');
    expect(detectFormat('Notes.MD')).toBe('markdown');
    expect(detectFormat('DATA.TXT')).toBe('text');
  });
});

// ============================================================================
// saveUploadToTemp Tests
// ============================================================================

describe('saveUploadToTemp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    crypto.randomUUID = vi.fn().mockReturnValue(MOCK_UUID);
  });

  afterEach(() => {
    crypto.randomUUID = originalRandomUUID;
  });

  it('should create the temp directory', async () => {
    const file = new File(['hello world'], 'test.pdf', { type: 'application/pdf' });
    await saveUploadToTemp(file);

    expect(mockMkdir).toHaveBeenCalledWith(
      join(tmpdir(), 'competitiontutor-uploads'),
      { recursive: true }
    );
  });

  it('should write file content to a unique path', async () => {
    const content = 'hello world';
    const file = new File([content], 'test.pdf', { type: 'application/pdf' });
    const result = await saveUploadToTemp(file);

    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const writtenPath = mockWriteFile.mock.calls[0][0] as string;
    expect(writtenPath).toBe(result.path);
    expect(result.path).toContain(MOCK_UUID);
    expect(result.path.endsWith('.pdf')).toBe(true);
  });

  it('should return correct SHA-256 hash', async () => {
    const content = 'hello world';
    const file = new File([content], 'test.pdf', { type: 'application/pdf' });
    const result = await saveUploadToTemp(file);

    // SHA-256 of "hello world"
    const { createHash } = await import('crypto');
    const expectedHash = createHash('sha256').update(Buffer.from(content)).digest('hex');
    expect(result.hash).toBe(expectedHash);
  });

  it('should return correct file size', async () => {
    const content = 'hello world';
    const file = new File([content], 'test.pdf', { type: 'application/pdf' });
    const result = await saveUploadToTemp(file);

    expect(result.size).toBe(Buffer.from(content).length);
  });

  it('should use UUID in filename, not the original name (CRITICAL-02)', async () => {
    const file = new File(['data'], 'malicious-name.pdf', { type: 'application/pdf' });
    const result = await saveUploadToTemp(file);

    expect(result.path).toContain(MOCK_UUID);
    expect(result.path).not.toContain('malicious-name');
  });

  it('should sanitize path traversal attempts in filename', async () => {
    const file = new File(['data'], '../../etc/passwd.pdf', { type: 'application/pdf' });
    const result = await saveUploadToTemp(file);

    // The path should be within the temp directory, not a traversal
    expect(result.path).toContain(MOCK_UUID);
    expect(result.path).not.toContain('..');
    expect(result.path).toContain(join(tmpdir(), 'competitiontutor-uploads'));
  });

  it('should sanitize backslash path separators', async () => {
    const file = new File(['data'], '..\\..\\windows\\system32\\evil.pdf', { type: 'application/pdf' });
    const result = await saveUploadToTemp(file);

    expect(result.path).toContain(MOCK_UUID);
    expect(result.path).not.toContain('\\');
  });
});

// ============================================================================
// cleanupTempFile Tests
// ============================================================================

describe('cleanupTempFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should remove an existing file', async () => {
    mockAccess.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);

    await cleanupTempFile('/tmp/some-file.pdf');

    expect(mockAccess).toHaveBeenCalledWith('/tmp/some-file.pdf');
    expect(mockUnlink).toHaveBeenCalledWith('/tmp/some-file.pdf');
  });

  it('should silently ignore non-existent file', async () => {
    mockAccess.mockRejectedValue(new Error('ENOENT'));

    // Should not throw
    await expect(cleanupTempFile('/tmp/nonexistent.pdf')).resolves.toBeUndefined();
  });
});

// ============================================================================
// MAX_FILE_SIZE constant
// ============================================================================

describe('MAX_FILE_SIZE', () => {
  it('should be 10MB', () => {
    expect(MAX_FILE_SIZE).toBe(10 * 1024 * 1024);
  });
});
