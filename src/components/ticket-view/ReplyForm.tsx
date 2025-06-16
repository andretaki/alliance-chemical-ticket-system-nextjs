'use client';

import React, { FormEvent, ChangeEvent, useRef, useState, useEffect } from 'react';
import axios from 'axios';

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [newComment]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const currentFiles = files.length;
      const newFiles = Array.from(e.target.files);
      
      if (currentFiles + newFiles.length > 5) {
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
      setNewComment((prev: string) => prev ? `${prev}\n\n${selectedContent}` : selectedContent);
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
    if (sendAsEmail) {
      return {
        icon: 'fas fa-paper-plane',
        label: 'Email Reply',
        description: 'Will be sent to customer via email',
        buttonText: 'Send Email',
        buttonClass: 'btn-primary'
      };
    }
    return {
      icon: 'fas fa-comment',
      label: 'Comment',
      description: 'Internal comment - not sent to customer',
      buttonText: 'Add Comment',
      buttonClass: 'btn-secondary'
    };
  };

  const replyMode = getReplyModeConfig();

  return (
    <div className="reply-form-wrapper">
      <div className="reply-form-container card border-0 shadow-sm">
        {/* Header */}
        <div className="reply-header bg-light border-bottom">
          <div className="d-flex align-items-center justify-content-between p-3">
            <div className="reply-title d-flex align-items-center">
              <div className="reply-icon me-2">
                <i className={`${replyMode.icon} text-primary`}></i>
              </div>
              <div>
                <h6 className="mb-0 fw-semibold">{replyMode.label}</h6>
                <small className="text-muted">{replyMode.description}</small>
              </div>
            </div>
            
            <div className="reply-tools d-flex align-items-center gap-2">
              {/* Template Selector */}
              <div className="template-selector">
                <select
                  className="form-select form-select-sm border-0 bg-white"
                  onChange={handleCannedResponseSelect}
                  value=""
                  disabled={isLoadingCanned || isSubmittingComment}
                  style={{ minWidth: '160px' }}
                >
                  <option value="" disabled>
                    {isLoadingCanned ? 'Loading templates...' : 'Insert template'}
                  </option>
                  {cannedResponsesList.map(resp => (
                    <option key={resp.id} value={resp.content}>
                      {resp.title}
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Status Reply Button */}
              {orderNumber && extractedStatus && ['shipped', 'awaiting_shipment', 'processing'].includes(extractedStatus) && insertSuggestedResponse && (
                <button 
                  type="button" 
                  className="btn btn-sm btn-outline-info border-0 bg-info bg-opacity-10 text-info" 
                  onClick={insertSuggestedResponse} 
                  disabled={isSubmittingComment}
                >
                  <i className="fas fa-magic me-1"></i>
                  AI Suggestion
                </button>
              )}
            </div>
          </div>
        </div>
        
        <form onSubmit={handleCommentSubmit} className="reply-form">
          <div className="reply-body p-3">
            {/* Text Editor Area */}
            <div className="editor-container mb-3">
              <div 
                className={`editor-wrapper border rounded ${isDragOver ? 'border-primary bg-primary bg-opacity-5' : 'border-light'}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <textarea
                  ref={textareaRef}
                  className="form-control border-0 resize-none"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder={`Type your ${replyMode.label.toLowerCase()} here...`}
                  rows={4}
                  readOnly={isSubmittingComment}
                  style={{ 
                    minHeight: '120px',
                    maxHeight: '300px',
                    overflow: 'auto'
                  }}
                />
                
                {isDragOver && (
                  <div className="drag-overlay position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center bg-primary bg-opacity-10 rounded">
                    <div className="text-center">
                      <i className="fas fa-cloud-upload-alt fa-2x text-primary mb-2"></i>
                      <div className="fw-medium text-primary">Drop files here to attach</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {/* File Upload Section */}
            <div className="file-section mb-3">
              <div className="file-input-wrapper">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="d-none"
                  multiple
                  disabled={isSubmittingComment}
                  id="fileInput"
                />
                <label 
                  htmlFor="fileInput" 
                  className="file-input-label btn btn-sm btn-outline-secondary border-0 bg-light"
                  style={{ cursor: isSubmittingComment ? 'not-allowed' : 'pointer' }}
                >
                  <i className="fas fa-paperclip me-1"></i>
                  Attach Files
                </label>
                <small className="text-muted ms-2">
                  Drop files anywhere or click to browse (max 5 files)
                </small>
              </div>
              
              {/* Selected Files */}
              {files.length > 0 && (
                <div className="selected-files mt-3">
                  <div className="files-header mb-2">
                    <small className="text-muted fw-medium">
                      <i className="fas fa-paperclip me-1"></i>
                      Attached Files ({files.length})
                    </small>
                  </div>
                  <div className="files-grid">
                    {files.map((file, index) => (
                      <div key={index} className="file-item d-flex align-items-center p-2 bg-light rounded border">
                        <div className="file-icon me-2">
                          <i className={`fas ${getFileIconClass(file.type)} text-primary`}></i>
                        </div>
                        <div className="file-info flex-grow-1 min-w-0">
                          <div className="file-name text-truncate fw-medium">{file.name}</div>
                          <div className="file-size small text-muted">{formatFileSize(file.size)}</div>
                        </div>
                        <button 
                          type="button" 
                          className="btn btn-sm btn-link text-danger p-1" 
                          onClick={() => removeFile(index)}
                          disabled={isSubmittingComment}
                          title="Remove file"
                        >
                          <i className="fas fa-times"></i>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Footer with options and submit */}
          <div className="reply-footer bg-light border-top p-3">
            <div className="d-flex align-items-center justify-content-between flex-wrap gap-3">
              {/* Reply Options */}
              <div className="reply-options d-flex align-items-center gap-3">
                <div className="form-check form-switch">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    id="internalNoteSwitch"
                    checked={isInternalNote}
                    onChange={e => {
                      const checked = e.target.checked;
                      setIsInternalNote(checked);
                      if (checked) setSendAsEmail(false);
                    }}
                    disabled={isSubmittingComment}
                  />
                  <label className="form-check-label d-flex align-items-center" htmlFor="internalNoteSwitch">
                    <i className="fas fa-lock me-2 text-warning"></i>
                    <span>Internal Note</span>
                  </label>
                </div>
                
                <div className="form-check form-switch">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    id="sendEmailSwitch"
                    checked={sendAsEmail}
                    onChange={e => {
                      const checked = e.target.checked;
                      setSendAsEmail(checked);
                      if (checked) setIsInternalNote(false);
                    }}
                    disabled={isInternalNote || !senderEmail || isSubmittingComment}
                  />
                  <label className="form-check-label d-flex align-items-center" htmlFor="sendEmailSwitch">
                    <i className="fas fa-paper-plane me-2 text-primary"></i>
                    <span>Send as Email</span>
                  </label>
                </div>
                
                {!senderEmail && (
                  <small className="text-muted">
                    <i className="fas fa-info-circle me-1"></i>
                    Email option disabled - no customer email
                  </small>
                )}
              </div>
              
              {/* Submit Button */}
              <button 
                type="submit" 
                className={`btn ${replyMode.buttonClass} px-4`}
                disabled={(!newComment?.trim() && files.length === 0) || isSubmittingComment}
              >
                {isSubmittingComment ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2"></span>
                    Submitting...
                  </>
                ) : (
                  <>
                    <i className={`${replyMode.icon} me-2`}></i>
                    {replyMode.buttonText}
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}