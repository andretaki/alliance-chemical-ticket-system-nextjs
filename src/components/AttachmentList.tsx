import React from 'react';
import type { AttachmentData } from '@/types/ticket';

interface AttachmentListProps {
  attachments: AttachmentData[];
}

const AttachmentList: React.FC<AttachmentListProps> = ({ attachments }) => {
  if (!attachments || attachments.length === 0) {
    return null;
  }

  return (
    <div className="attachment-list">
      <h6 className="mb-2">
        <i className="fas fa-paperclip me-2"></i>
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
            <i className={`fas ${getFileIcon(attachment.filename || attachment.originalFilename)} me-2`}></i>
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
};

// Helper function to get appropriate icon based on file extension
function getFileIcon(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase();
  
  switch (extension) {
    case 'pdf':
      return 'fa-file-pdf';
    case 'doc':
    case 'docx':
      return 'fa-file-word';
    case 'xls':
    case 'xlsx':
      return 'fa-file-excel';
    case 'ppt':
    case 'pptx':
      return 'fa-file-powerpoint';
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
      return 'fa-file-image';
    case 'zip':
    case 'rar':
    case '7z':
      return 'fa-file-archive';
    case 'txt':
      return 'fa-file-alt';
    default:
      return 'fa-file';
  }
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