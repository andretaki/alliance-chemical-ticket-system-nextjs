// src/components/EditTicketClient.tsx
'use client';

import React, { useState, useEffect } from 'react';
import axios, { AxiosError } from 'axios';
import { useRouter } from 'next/navigation';
import { ticketPriorityEnum, ticketStatusEnum } from '@/db/schema';

// interface Project { // REMOVED
//   id: number;
//   name: string;
// }

interface User {
  id: number;
  name: string;
  email: string;
}

interface Comment {
  id: number;
  commentText: string;
  createdAt: string;
  commenter: {
    id: number;
    name: string;
    email: string;
  };
}

interface Ticket {
  id: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  // project: Project; // REMOVED
  assignee: User | null;
  reporter: User;
  createdAt: string;
  updatedAt: string;
  comments: Comment[];
}

interface EditTicketClientProps {
  ticketId: number;
}

const EditTicketClient: React.FC<EditTicketClientProps> = ({ ticketId }) => {
  const router = useRouter();
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // const [projectName, setProjectName] = useState(''); // REMOVED
  const [assigneeEmail, setAssigneeEmail] = useState<string | null>(null);
  const [priority, setPriority] = useState<string>(ticketPriorityEnum.enumValues[1]);
  const [status, setStatus] = useState<string>(ticketStatusEnum.enumValues[0]);
  
  const [newComment, setNewComment] = useState('');
  const [comments, setComments] = useState<Comment[]>([]);
  const [isAddingComment, setIsAddingComment] = useState(false);
  
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // const [projects, setProjects] = useState<Project[]>([]); // REMOVED
  const [users, setUsers] = useState<User[]>([]);
  
  useEffect(() => {
    const loadData = async () => {
      try {
        const [ticketRes, usersRes] = await Promise.all([ // Removed projectsRes
          axios.get<Ticket>(`/api/tickets/${ticketId}`),
          // axios.get<Project[]>('/api/projects'), // REMOVED
          axios.get<User[]>('/api/users')
        ]);
        
        const ticket = ticketRes.data;
        
        setTitle(ticket.title);
        setDescription(ticket.description);
        // setProjectName(ticket.project.name); // REMOVED
        setAssigneeEmail(ticket.assignee?.email || null);
        setPriority(ticket.priority);
        setStatus(ticket.status);
        setComments(ticket.comments);
        
        // setProjects(projectsRes.data); // REMOVED
        setUsers(usersRes.data);
      } catch (err) {
        console.error('Error loading ticket:', err);
        setError('Failed to load ticket data. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };
    
    loadData();
  }, [ticketId]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setIsSubmitting(true);
    
    try {
      const response = await axios.put(`/api/tickets/${ticketId}`, {
        title,
        description,
        assigneeEmail,
        priority,
        status
        // No project data to send
      });
      
      console.log('Ticket updated:', response.data);
      router.push(`/tickets/${ticketId}`); // Navigate to view page after edit
      router.refresh();
    } catch (err: unknown) {
      console.error('Error updating ticket:', err);
      if (axios.isAxiosError(err)) {
        const axiosError = err as AxiosError<{ error?: string, details?: Record<string, string[]> }>;
        if (axiosError.response?.data?.details) {
          const details = axiosError.response.data.details;
          const newFieldErrors: Record<string, string> = {};
          Object.entries(details).forEach(([field, messages]) => {
            newFieldErrors[field] = Array.isArray(messages) ? messages[0] : String(messages);
          });
          setFieldErrors(newFieldErrors);
        } else {
          setError(axiosError.response?.data?.error || 'Failed to update ticket. Please try again.');
        }
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    setIsAddingComment(true);
    
    try {
      const response = await axios.post(`/api/tickets/${ticketId}/comments`, {
        commentText: newComment.trim()
      });
      
      // The API now returns the comment with commenter details, so use that
      const addedComment = response.data.comment; 
      setComments(prevComments => [...prevComments, addedComment]);
      setNewComment('');
    } catch (err) {
      console.error('Error adding comment:', err);
      setError('Failed to add comment. Please try again.');
    } finally {
      setIsAddingComment(false);
    }
  };
  
  if (isLoading) {
    return <div className="text-center py-5">Loading ticket...</div>;
  }
  
  return (
    <div className="row">
      <div className="col-md-8">
        <div className="card shadow-sm mb-4">
          <div className="card-header bg-light">
            <h3 className="mb-0 h5">Edit Ticket #{ticketId}</h3> {/* Added Ticket ID */}
          </div>
          <div className="card-body">
            {error && (
              <div className="alert alert-danger alert-dismissible fade show">
                {error}
                <button type="button" className="btn-close" onClick={() => setError(null)} aria-label="Close"></button>
              </div>
            )}
            
            <form onSubmit={handleSubmit}>
              <div className="mb-3">
                <label htmlFor="title" className="form-label">Title <span className="text-danger">*</span></label>
                <input
                  type="text"
                  className={`form-control ${fieldErrors.title ? 'is-invalid' : ''}`}
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
                {fieldErrors.title && <div className="invalid-feedback">{fieldErrors.title}</div>}
              </div>
              
              <div className="mb-3">
                <label htmlFor="description" className="form-label">Description <span className="text-danger">*</span></label>
                <textarea
                  className={`form-control ${fieldErrors.description ? 'is-invalid' : ''}`}
                  id="description"
                  rows={5}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                ></textarea>
                {fieldErrors.description && <div className="invalid-feedback">{fieldErrors.description}</div>}
              </div>
              
              {/* Project Name field REMOVED */}

              <div className="row">
                <div className="col-md-6 mb-3">
                  <label htmlFor="assignee" className="form-label">Assignee</label>
                  <select
                    className={`form-select ${fieldErrors.assigneeEmail ? 'is-invalid' : ''}`}
                    id="assignee"
                    value={assigneeEmail || ''}
                    onChange={(e) => setAssigneeEmail(e.target.value || null)}
                  >
                    <option value="">Unassigned</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.email}>{user.name} ({user.email})</option>
                    ))}
                  </select>
                  {fieldErrors.assigneeEmail && <div className="invalid-feedback">{fieldErrors.assigneeEmail}</div>}
                </div>
                
                <div className="col-md-6 mb-3">
                  <div className="row">
                    <div className="col-md-6">
                      <label htmlFor="priority" className="form-label">Priority</label>
                      <select
                        className="form-select"
                        id="priority"
                        value={priority}
                        onChange={(e) => setPriority(e.target.value)}
                      >
                        {ticketPriorityEnum.enumValues.map((p: string) => (
                          <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="col-md-6">
                      <label htmlFor="status" className="form-label">Status</label>
                      <select
                        className="form-select"
                        id="status"
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                      >
                        {ticketStatusEnum.enumValues.map((s: string) => (
                          <option key={s} value={s}>
                            {s.replace('_', ' ').charAt(0).toUpperCase() + s.replace('_', ' ').slice(1)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="d-flex gap-2 mt-4">
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                      Saving...
                    </>
                  ) : 'Save Changes'}
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => router.push(`/tickets/${ticketId}`)}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
      
      <div className="col-md-4">
        <div className="card shadow-sm">
          <div className="card-header bg-light">
            <h3 className="mb-0 h5">Comments</h3>
          </div>
          <div className="card-body">
            <div className="comments-list mb-4">
              {comments.length === 0 ? (
                <p className="text-muted">No comments yet.</p>
              ) : (
                <ul className="list-group list-group-flush">
                  {comments.map(comment => (
                    <li key={comment.id} className="list-group-item px-0">
                      <div className="d-flex justify-content-between mb-1">
                        <h6 className="mb-0 fw-bold">{comment.commenter?.name || 'User'}</h6>
                        <small className="text-muted">
                          {new Date(comment.createdAt).toLocaleString()}
                        </small>
                      </div>
                      <p className="mb-0">{comment.commentText}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            
            <form onSubmit={handleAddComment}>
              <div className="mb-3">
                <label htmlFor="newComment" className="form-label">Add a Comment</label>
                <textarea
                  className="form-control"
                  id="newComment"
                  rows={3}
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                ></textarea>
              </div>
              <button 
                type="submit" 
                className="btn btn-primary w-100" 
                disabled={isAddingComment || !newComment.trim()}
              >
                {isAddingComment ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                    Adding...
                  </>
                ) : 'Add Comment'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditTicketClient;