import React from 'react';
import { AttachmentData } from '@/types/ticket';

interface AttachmentListProps {
  attachments: AttachmentData[];
  title?: string;
}

const getFileIcon = (mimeType: string | undefined): string => {
  if (!mimeType) return 'fa-file';
  const mt = mimeType.toLowerCase();
  if (mt.startsWith('image/')) return 'fa-file-image';
  if (mt === 'application/pdf') return 'fa-file-pdf';
  if (mt.includes('word') || mt === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'fa-file-word';
  if (mt.includes('excel') || mt === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'fa-file-excel';
  if (mt.includes('powerpoint') || mt === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') return 'fa-file-powerpoint';
  if (mt.includes('zip') || mt.includes('compressed') || mt.includes('archive')) return 'fa-file-archive';
  if (mt.startsWith('text/')) return 'fa-file-alt';
  return 'fa-file';
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
      {title && <div className="attachment-header mb-2 text-muted small"><i className="fas fa-paperclip me-1"></i>{title} ({attachments.length})</div>}
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
              <i className={`fas ${getFileIcon(attachment.mimeType)} me-2 text-primary fa-fw`}></i>
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