import React from 'react';
import { AttachmentData } from '@/types/ticket';
import { Paperclip, FileText, Image, FileArchive } from 'lucide-react';

interface AttachmentListProps {
  attachments: AttachmentData[];
  title?: string;
}

const getFileIcon = (mimeType: string | undefined): React.ReactNode => {
  const iconClass = "w-4 h-4 text-primary";
  if (!mimeType) return <FileText className={iconClass} />;
  const mt = mimeType.toLowerCase();
  if (mt.startsWith('image/')) return <Image className={iconClass} />;
  if (mt === 'application/pdf') return <FileText className={iconClass} />;
  if (mt.includes('word')) return <FileText className={iconClass} />;
  if (mt.includes('excel')) return <FileText className={iconClass} />;
  if (mt.includes('powerpoint')) return <FileText className={iconClass} />;
  if (mt.includes('zip') || mt.includes('compressed') || mt.includes('archive')) return <FileArchive className={iconClass} />;
  if (mt.startsWith('text/')) return <FileText className={iconClass} />;
  return <FileText className={iconClass} />;
};

const formatFileSize = (bytes: number | undefined): string => {
  if (bytes === undefined || bytes === null || bytes < 0) return '';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const AttachmentListDisplay: React.FC<AttachmentListProps> = ({ attachments, title }) => {
  if (!attachments || attachments.length === 0) {
    return null;
  }

  return (
    <div className="attachment-list">
      {title && <div className="attachment-header mb-2 text-muted small flex items-center gap-1"><Paperclip className="w-3.5 h-3.5" />{title} ({attachments.length})</div>}
      <div className="list-group list-group-flush">
        {attachments.map((attachment) => (
          <a
            key={attachment.id}
            href={`/api/attachments/${attachment.id}/download`}
            target="_blank"
            rel="noopener noreferrer"
            className="list-group-item list-group-item-action d-flex justify-content-between align-items-center py-1 px-0 border-0 bg-transparent"
            title={`Download ${attachment.originalFilename}`}
          >
            <div className="d-flex align-items-center text-truncate me-2">
              <span className="me-2">{getFileIcon(attachment.mimeType)}</span>
              <span className="text-truncate small">{attachment.originalFilename}</span>
            </div>
            <span className="badge bg-light text-dark ms-2">{formatFileSize(attachment.fileSize)}</span>
          </a>
        ))}
      </div>
    </div>
  );
};

export default AttachmentListDisplay; 