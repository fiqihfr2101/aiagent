/**
 * Format a byte count into a human-readable file size string.
 *
 * Examples:
 *   formatFileSize(0)       → "0 B"
 *   formatFileSize(512)     → "512 B"
 *   formatFileSize(1024)    → "1.0 KB"
 *   formatFileSize(15360)   → "15.0 KB"
 *   formatFileSize(2202009) → "2.1 MB"
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/** Supported file extensions for upload. */
export const SUPPORTED_FILE_TYPES = [
  '.png', '.jpg', '.jpeg', '.gif', '.webp',
  '.pdf', '.doc', '.docx', '.txt',
  '.py', '.js', '.ts', '.tsx', '.jsx',
  '.json', '.yaml', '.yml', '.md',
];

/** Returns true if the MIME type is a previewable image. */
export function isImageType(type: string): boolean {
  return type.startsWith('image/');
}

/** Returns a human-readable file type label. */
export function getFileTypeLabel(type: string): string {
  if (type.startsWith('image/')) return 'Image';
  if (type.includes('pdf')) return 'PDF';
  if (type.includes('word') || type.includes('doc')) return 'Document';
  if (type.includes('json')) return 'JSON';
  if (type.includes('yaml') || type.includes('yml')) return 'YAML';
  if (type.includes('javascript') || type.includes('typescript')) return 'Code';
  if (type.includes('python')) return 'Python';
  if (type.includes('text')) return 'Text';
  return 'File';
}
