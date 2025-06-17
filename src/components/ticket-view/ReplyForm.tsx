'use client';

import React, { FormEvent, ChangeEvent, useRef, useState, useEffect } from 'react';
import axios from 'axios';
import RichTextEditor from './RichTextEditor';

interface CannedResponse {
  id: number;
  title: string;
  content: string;
  category?: string;
}

interface ReplyFormProps {
  ticketId: number;
  senderEmail?: string | null;
  extractedStatus?: string | null;
  extractedTracking?: string | null;
  extractedCarrier?: string | null;
  extractedShipDate?: string | null;
  extractedOrderDate?: string | null;
  orderNumber?: string | null;
  isSubmittingComment: boolean;
  newComment: string;
  setNewComment: React.Dispatch<React.SetStateAction<string>>;
  isInternalNote: boolean;
  setIsInternalNote: (value: boolean) => void;
  sendAsEmail: boolean;
  setSendAsEmail: (value: boolean) => void;
  files: File[];
  setFiles: React.Dispatch<React.SetStateAction<File[]>>;
  handleCommentSubmit: (e: FormEvent) => Promise<void>;
  insertSuggestedResponse?: () => void;
}

// Helper functions
const formatFileSize = (bytes?: number): string => {
  if (bytes === undefined || bytes === null || bytes < 0) return '';
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getFileIconClass = (mimeType?: string | null): string => {
  if (!mimeType) return 'fa-file';
  const mt = mimeType.toLowerCase();
  if (mt.startsWith('image/')) return 'fa-file-image';
  if (mt === 'application/pdf') return 'fa-file-pdf';
  if (mt.includes('word')) return 'fa-file-word';
  if (mt.includes('excel')) return 'fa-file-excel';
  if (mt.includes('powerpoint')) return 'fa-file-powerpoint';
  if (mt.includes('zip') || mt.includes('compressed')) return 'fa-file-archive';
  if (mt.startsWith('text/')) return 'fa-file-alt';
  return 'fa-file';
};

export default function ReplyForm({
  ticketId,
  senderEmail,
  extractedStatus,
  orderNumber,
  isSubmittingComment,
  newComment,
  setNewComment,
  isInternalNote,
  setIsInternalNote,
  sendAsEmail,
  setSendAsEmail,
  files,
  setFiles,
  handleCommentSubmit,
  insertSuggestedResponse
}: ReplyFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cannedResponsesList, setCannedResponsesList] = useState<CannedResponse[]>([]);
  const [isLoadingCanned, setIsLoadingCanned] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);

  // Fetch canned responses
  useEffect(() => {
    const fetchCannedResponses = async () => {
      setIsLoadingCanned(true);
      try {
        const res = await axios.get<CannedResponse[]>('/api/canned-responses');
        setCannedResponsesList(res.data);
      } catch (err) {
        console.error("Failed to fetch canned responses:", err);
      } finally {
        setIsLoadingCanned(false);
      }
    };
    fetchCannedResponses();
  }, []);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const currentFiles = files.length;
      const newFiles = Array.from(e.target.files);
      
      if (currentFiles + newFiles.length > 5) {
        alert("You can only upload a maximum of 5 files.");
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      
      setFiles((prevFiles: File[]) => [...prevFiles, ...newFiles]);
    }
  };

  const removeFile = (indexToRemove: number) => {
    setFiles((prevFiles: File[]) => prevFiles.filter((_, index) => index !== indexToRemove));
    if (files.length === 1 && fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCannedResponseSelect = (e: ChangeEvent<HTMLSelectElement>) => {
    const selectedContent = e.target.value;
    if (selectedContent) {
      setNewComment((prev: string) => `${prev}<p>${selectedContent}</p>`);
      e.target.value = "";
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (files.length + droppedFiles.length <= 5) {
      setFiles((prevFiles: File[]) => [...prevFiles, ...droppedFiles]);
    } else {
       alert("You can only upload a maximum of 5 files.");
    }
  };

  const getReplyModeConfig = () => {
    if (isInternalNote) {
      return {
        icon: 'fas fa-lock',
        label: 'Internal Note',
        description: 'Only visible to your team',
        buttonText: 'Save Note',
        buttonClass: 'btn-warning'
      };
    }
    return {
      icon: 'fas fa-paper-plane',
      label: 'Email Reply',
      description: `Will be sent to ${senderEmail}`,
      buttonText: 'Send Email',
      buttonClass: 'btn-primary'
    };
  };

  const replyMode = getReplyModeConfig();
  
  const canSubmit = newComment.replace(/<[^>]+>/g, '').trim() !== '' || files.length > 0;

  return (
    <div 
      className={`reply-form-container card border-0 shadow-sm bg-light ${isDragOver ? 'border-primary' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <form onSubmit={handleCommentSubmit} className="reply-form">
        <div className="reply-body p-3">
          {/* "To" Field and Canned Responses */}
          {!isInternalNote && (
            <div className="d-flex align-items-center justify-content-between mb-2">
              <div className="input-group input-group-sm flex-grow-1 me-2">
                <span className="input-group-text bg-light border-0" id="to-addon">To:</span>
                <input type="text" className="form-control form-control-sm bg-white border-0" value={senderEmail || ''} readOnly />
              </div>
              <div className="template-selector">
                <select
                  className="form-select form-select-sm"
                  onChange={handleCannedResponseSelect}
                  value=""
                  disabled={isLoadingCanned || isSubmittingComment}
                  title="Insert a pre-written response"
                >
                  <option value="" disabled>
                    {isLoadingCanned ? 'Loading...' : 'Insert template'}
                  </option>
                  {cannedResponsesList.map(resp => (
                    <option key={resp.id} value={resp.content}>
                      {resp.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Rich Text Editor */}
          <div className="editor-wrapper mb-2">
            <RichTextEditor
              value={newComment}
              onChange={setNewComment}
              placeholder={isInternalNote ? "Leave an internal note... (visible to team only)" : "Type your email reply here..."}
              readOnly={isSubmittingComment}
              minHeight="150px"
            />
          </div>
          
          {/* Attachments Section */}
          <div className="attachments-section">
            {files.length > 0 && (
              <div className="attachments-list mb-2">
                {files.map((file, index) => (
                  <div key={index} className="attachment-item d-inline-flex align-items-center bg-white border rounded p-1 me-2 mb-1 small">
                    <i className={`fas ${getFileIconClass(file.type)} me-2 text-primary fa-fw`}></i>
                    <span className="text-truncate" style={{maxWidth: '150px'}}>{file.name}</span>
                    <span className="text-muted ms-2">{formatFileSize(file.size)}</span>
                    <button type="button" className="btn-close ms-2" style={{fontSize: '0.6rem'}} onClick={() => removeFile(index)} disabled={isSubmittingComment}></button>
                  </div>
                ))}
              </div>
            )}
            <div 
              className={`attachment-drop-zone text-center p-2 border-2 border-dashed rounded ${isDragOver ? 'border-primary bg-primary bg-opacity-10' : 'border-light'}`} 
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                type="file"
                multiple
                ref={fileInputRef}
                onChange={handleFileChange}
                className="d-none"
                disabled={isSubmittingComment || files.length >= 5}
              />
              <i className="fas fa-paperclip me-1"></i>
              {isDragOver 
                ? "Drop files here" 
                : files.length > 0
                  ? `Add more files (${files.length}/5)`
                  : "Attach Files (drag & drop or click)"}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="reply-footer d-flex justify-content-between align-items-center p-3 border-top bg-light">
          <div className="form-check form-switch">
            <input
              className="form-check-input"
              type="checkbox"
              role="switch"
              id="internalNoteSwitch"
              checked={isInternalNote}
              onChange={(e) => {
                setIsInternalNote(e.target.checked);
                // When switching to internal note, "send as email" is not applicable
                if(e.target.checked) setSendAsEmail(false);
              }}
              disabled={isSubmittingComment}
            />
            <label className="form-check-label" htmlFor="internalNoteSwitch">
              Internal Note
            </label>
          </div>

          <div className="d-flex align-items-center gap-2">
            {insertSuggestedResponse && (
              <button 
                type="button" 
                className="btn btn-sm btn-outline-info" 
                onClick={insertSuggestedResponse} 
                disabled={isSubmittingComment}
                title="Insert AI suggested reply"
              >
                <i className="fas fa-magic"></i> AI Suggestion
              </button>
            )}
            <button
              type="submit"
              className={`btn btn-sm ${replyMode.buttonClass}`}
              disabled={isSubmittingComment || !canSubmit}
            >
              {isSubmittingComment ? (
                <>
                  <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                  Sending...
                </>
              ) : (
                <><i className={`${replyMode.icon} me-1`}></i> {replyMode.buttonText}</>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}