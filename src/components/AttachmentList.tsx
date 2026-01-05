import React from 'react';
import type { AttachmentData } from '@/types/ticket';
import { Paperclip, FileText, Image, FileArchive } from 'lucide-react';

interface AttachmentListProps {
  attachments: AttachmentData[];
}

// Helper function to get appropriate icon based on file extension
function getFileIcon(fileName: string): React.ReactNode {
  const extension = fileName.split('.').pop()?.toLowerCase();
  const iconClass = "w-4 h-4";

  switch (extension) {
    case 'pdf':
    case 'doc':
    case 'docx':
    case 'xls':
    case 'xlsx':
    case 'ppt':
    case 'pptx':
    case 'txt':
      return <FileText className={iconClass} />;
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
      return <Image className={iconClass} />;
    case 'zip':
    case 'rar':
    case '7z':
      return <FileArchive className={iconClass} />;
    default:
      return <FileText className={iconClass} />;
  }
}

const AttachmentList: React.FC<AttachmentListProps> = ({ attachments }) => {
  if (!attachments || attachments.length === 0) {
    return null;
  }

  return (
    <div className="attachment-list">
      <h6 className="mb-2 flex items-center gap-2">
        <Paperclip className="w-4 h-4" />
        Attachments ({attachments.length})
      </h6>
      <div className="list-group">
        {attachments.map((attachment, index) => (
          <a
            key={index}
            href={`/api/attachments/${attachment.id}/download`}
            target="_blank"
            rel="noopener noreferrer"
            className="list-group-item list-group-item-action d-flex align-items-center"
          >
            <span className="me-2">{getFileIcon(attachment.filename || attachment.originalFilename)}</span>
            <div className="flex-grow-1">
              <div className="d-flex justify-content-between align-items-center">
                <span className="text-truncate" style={{ maxWidth: '300px' }}>
                  {attachment.filename || attachment.originalFilename}
                </span>
                <small className="text-muted ms-2">
                  {formatFileSize(attachment.fileSize)}
                </small>
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

// Helper function to format file size
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default AttachmentList; 