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

interface QuickAction {
  id: string;
  label: string;
  content: string;
  icon: string;
  variant: string;
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

// Quick action templates
const QUICK_ACTIONS: QuickAction[] = [
  { id: 'acknowledge', label: 'Acknowledge', content: 'Thank you for contacting us. I have received your message and will get back to you shortly.', icon: 'fa-check-circle', variant: 'outline-success' },
  { id: 'investigating', label: 'Investigating', content: 'I am currently investigating this issue and will update you as soon as I have more information.', icon: 'fa-search', variant: 'outline-info' },
  { id: 'escalate', label: 'Escalating', content: 'I am escalating this to our specialist team who will be in touch with you shortly.', icon: 'fa-arrow-up', variant: 'outline-warning' },
  { id: 'resolved', label: 'Resolved', content: 'This issue has been resolved. Please let me know if you need any further assistance.', icon: 'fa-check', variant: 'outline-success' },
  { id: 'followup', label: 'Follow Up', content: 'I wanted to follow up on your recent inquiry. Is there anything else I can help you with?', icon: 'fa-clock', variant: 'outline-primary' },
];

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
  const [showQuickActions, setShowQuickActions] = useState(true);
  const [priority, setPriority] = useState<'normal' | 'high' | 'urgent'>('normal');
  const [scheduleFor, setScheduleFor] = useState<string>('');
  const [signature, setSignature] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Fetch canned responses and user signature
  useEffect(() => {
    const fetchData = async () => {
      setIsLoadingCanned(true);
      try {
        const [cannedRes, signatureRes] = await Promise.all([
          axios.get<CannedResponse[]>('/api/canned-responses'),
          axios.get<{signature: string}>('/api/users/me/signature').catch(() => ({ data: { signature: '' } }))
        ]);
        setCannedResponsesList(cannedRes.data);
        setSignature(signatureRes.data.signature);
      } catch (err) {
        console.error("Failed to fetch data:", err);
      } finally {
        setIsLoadingCanned(false);
      }
    };
    fetchData();
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

  const handleQuickAction = (action: QuickAction) => {
    setNewComment((prev: string) => {
      const content = signature ? `<p>${action.content}</p><br/><p>${signature}</p>` : `<p>${action.content}</p>`;
      return prev ? `${prev}<br/>${content}` : content;
    });
    setShowQuickActions(false);
  };

  const handleEmojiSelect = (emoji: string) => {
    setNewComment((prev: string) => `${prev}${emoji}`);
    setShowEmojiPicker(false);
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
      buttonText: scheduleFor ? 'Schedule Send' : priority === 'urgent' ? 'Send Urgent' : 'Send Email',
      buttonClass: priority === 'urgent' ? 'btn-danger' : 'btn-primary'
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
      {/* Quick Actions Bar */}
      {showQuickActions && !isInternalNote && (
        <div className="quick-actions-bar p-2 bg-white border-bottom">
          <div className="d-flex align-items-center justify-content-between">
            <div className="d-flex gap-1 flex-wrap">
              <small className="text-muted me-2 align-self-center">Quick replies:</small>
              {QUICK_ACTIONS.map(action => (
                <button
                  key={action.id}
                  type="button"
                  className={`btn btn-sm ${action.variant}`}
                  onClick={() => handleQuickAction(action)}
                  disabled={isSubmittingComment}
                >
                  <i className={`fas ${action.icon} me-1`}></i>
                  {action.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => setShowQuickActions(false)}
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleCommentSubmit} className="reply-form">
        <div className="reply-body p-3">
          {/* Enhanced Header with Priority and Scheduling */}
          {!isInternalNote && (
            <div className="d-flex align-items-center justify-content-between mb-2">
              <div className="input-group input-group-sm flex-grow-1 me-2">
                <span className="input-group-text bg-light border-0" id="to-addon">To:</span>
                <input type="text" className="form-control form-control-sm bg-white border-0" value={senderEmail || ''} readOnly />
                
                {/* Priority Selector */}
                <select
                  className={`form-select form-select-sm ${priority === 'urgent' ? 'text-danger' : priority === 'high' ? 'text-warning' : ''}`}
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as 'normal' | 'high' | 'urgent')}
                  disabled={isSubmittingComment}
                  style={{ maxWidth: '100px' }}
                >
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              
              <div className="d-flex gap-1">
                {/* Schedule Send */}
                <input
                  type="datetime-local"
                  className="form-control form-control-sm"
                  value={scheduleFor}
                  onChange={(e) => setScheduleFor(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                  disabled={isSubmittingComment}
                  title="Schedule send"
                  style={{ maxWidth: '150px' }}
                />
                
                {/* Template Selector */}
                <select
                  className="form-select form-select-sm"
                  onChange={handleCannedResponseSelect}
                  value=""
                  disabled={isLoadingCanned || isSubmittingComment}
                  title="Insert a pre-written response"
                  style={{ maxWidth: '120px' }}
                >
                  <option value="" disabled>
                    {isLoadingCanned ? 'Loading...' : 'Templates'}
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

          {/* Rich Text Editor with Enhanced Toolbar */}
          <div className="editor-wrapper mb-2 position-relative">
            <div className="editor-toolbar d-flex align-items-center gap-2 p-2 bg-white border-bottom">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                disabled={isSubmittingComment}
              >
                <i className="fas fa-smile"></i>
              </button>
              
              {insertSuggestedResponse && (
                <button 
                  type="button" 
                  className="btn btn-sm btn-outline-info" 
                  onClick={insertSuggestedResponse} 
                  disabled={isSubmittingComment}
                  title="Insert AI suggested reply"
                >
                  <i className="fas fa-magic me-1"></i> AI
                </button>
              )}
              
              {!showQuickActions && !isInternalNote && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary"
                  onClick={() => setShowQuickActions(true)}
                >
                  <i className="fas fa-bolt me-1"></i> Quick Actions
                </button>
              )}
            </div>
            
            {/* Emoji Picker */}
            {showEmojiPicker && (
              <div className="position-absolute bg-white border rounded shadow p-2" style={{ zIndex: 1000, top: '100%' }}>
                <div className="d-flex flex-wrap gap-1">
                  {['😊', '👍', '👎', '❤️', '😅', '🤔', '👋', '🙏', '✅', '❌', '⚠️', '🎉'].map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      className="btn btn-sm btn-outline-light"
                      onClick={() => handleEmojiSelect(emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}

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

        {/* Enhanced Footer */}
        <div className="reply-footer d-flex justify-content-between align-items-center p-3 border-top bg-light">
          <div className="d-flex align-items-center gap-3">
            <div className="form-check form-switch">
              <input
                className="form-check-input"
                type="checkbox"
                role="switch"
                id="internalNoteSwitch"
                checked={isInternalNote}
                onChange={(e) => {
                  setIsInternalNote(e.target.checked);
                  if(e.target.checked) setSendAsEmail(false);
                }}
                disabled={isSubmittingComment}
              />
              <label className="form-check-label" htmlFor="internalNoteSwitch">
                Internal Note
              </label>
            </div>
            
            {/* Status Indicators */}
            {scheduleFor && (
              <small className="text-info">
                <i className="fas fa-clock me-1"></i>
                Scheduled for {new Date(scheduleFor).toLocaleString()}
              </small>
            )}
            
            {priority !== 'normal' && (
              <small className={`text-${priority === 'urgent' ? 'danger' : 'warning'}`}>
                <i className="fas fa-exclamation-triangle me-1"></i>
                {priority.toUpperCase()} Priority
              </small>
            )}
          </div>

          <div className="d-flex align-items-center gap-2">
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