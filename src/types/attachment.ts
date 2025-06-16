export interface AttachmentData {
  id: string;
  filename: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  uploadedAt: Date;
  url?: string;
} 