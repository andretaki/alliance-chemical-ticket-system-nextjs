'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { Alert, Card, Spinner } from 'react-bootstrap';

interface ResolutionMetrics {
  totalResolved: number;
  totalAutoClosed: number;
  totalFollowUp: number;
  averageResolutionTime: number;
  resolutionRate: number;
  lastRunTime: string | null;
  reopenedCount: number;
  autoCloseRate: number;
  reopenRate: number;
  confidenceDistribution: { high: number; medium: number; low: number };
  averageConversationTurns: number;
  autoFollowUpsSent: number;
  aiRecommendationAccuracy: number;
}

export default function ResolutionMetricsPanel() {
  const [metrics, setMetrics] = useState<ResolutionMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    async function loadMetrics() {
      try {
        setIsLoading(true);
        const res = await axios.get('/api/admin/resolution-metrics');
        setMetrics(res.data);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to load metrics');
        console.error('Failed to load resolution metrics', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadMetrics();
  }, []);
  
  if (isLoading) {
    return (
      <Card className="shadow-sm mb-4">
        <Card.Header>
          <h5 className="mb-0">AI Sales Manager Metrics</h5>
        </Card.Header>
        <Card.Body className="text-center py-5">
          <Spinner animation="border" role="status">
            <span className="visually-hidden">Loading...</span>
          </Spinner>
        </Card.Body>
      </Card>
    );
  }
  
  if (error) {
    return (
      <Card className="shadow-sm mb-4 border-danger">
        <Card.Header className="bg-danger text-white">
          <h5 className="mb-0">Resolution Metrics</h5>
        </Card.Header>
        <Card.Body>
          <p className="text-danger mb-0">Error loading metrics: {error}</p>
        </Card.Body>
      </Card>
    );
  }
  
  // Default metrics if none are available
  const defaultMetrics: ResolutionMetrics = {
    totalResolved: 0,
    totalAutoClosed: 0,
    totalFollowUp: 0,
    averageResolutionTime: 0,
    resolutionRate: 0,
    lastRunTime: null,
    reopenedCount: 0,
    autoCloseRate: 0,
    reopenRate: 0,
    confidenceDistribution: { high: 0, medium: 0, low: 0 },
    averageConversationTurns: 0,
    autoFollowUpsSent: 0,
    aiRecommendationAccuracy: 0
  };
  
  const m = metrics || defaultMetrics;
  
  // Format last run time
  const lastRun = m.lastRunTime ? new Date(m.lastRunTime).toLocaleString() : 'Never';
  
  return (
    <Card className="shadow-sm mb-4">
      <Card.Header className="d-flex justify-content-between align-items-center">
        <h5 className="mb-0">AI Sales Manager Metrics</h5>
        <small className="text-muted">Last 30 days</small>
      </Card.Header>
      <Card.Body>
        <div className="row">
          {/* Core Metrics */}
          <div className="col-md-6 col-lg-3 mb-3">
            <div className="text-center p-3 border rounded bg-light">
              <h4 className="text-primary mb-1">{m.totalResolved}</h4>
              <small className="text-muted">Total Resolved</small>
            </div>
          </div>
          
          <div className="col-md-6 col-lg-3 mb-3">
            <div className="text-center p-3 border rounded bg-light">
              <h4 className="text-success mb-1">{m.totalAutoClosed}</h4>
              <small className="text-muted">AI Auto-Closed</small>
            </div>
          </div>
          
          <div className="col-md-6 col-lg-3 mb-3">
            <div className="text-center p-3 border rounded bg-light">
              <h4 className="text-info mb-1">{m.totalFollowUp}</h4>
              <small className="text-muted">Follow-Up Recommendations</small>
            </div>
          </div>
          
          <div className="col-md-6 col-lg-3 mb-3">
            <div className="text-center p-3 border rounded bg-light">
              <h4 className="text-warning mb-1">{m.reopenedCount}</h4>
              <small className="text-muted">Reopened Tickets</small>
            </div>
          </div>
        </div>
        
        <hr />
        
        {/* AI Performance Metrics */}
        <div className="row">
          <div className="col-md-4 mb-3">
            <h6 className="text-muted mb-2">AI Confidence Distribution</h6>
            <div className="mb-2">
              <div className="d-flex justify-content-between">
                <span>High Confidence</span>
                <strong className="text-success">{m.confidenceDistribution.high}</strong>
              </div>
              <div className="progress mb-1" style={{height: '6px'}}>
                <div 
                  className="progress-bar bg-success" 
                  style={{width: `${m.totalAutoClosed > 0 ? (m.confidenceDistribution.high / m.totalAutoClosed) * 100 : 0}%`}}
                ></div>
              </div>
            </div>
            <div className="mb-2">
              <div className="d-flex justify-content-between">
                <span>Medium Confidence</span>
                <strong className="text-warning">{m.confidenceDistribution.medium}</strong>
              </div>
              <div className="progress mb-1" style={{height: '6px'}}>
                <div 
                  className="progress-bar bg-warning" 
                  style={{width: `${m.totalAutoClosed > 0 ? (m.confidenceDistribution.medium / m.totalAutoClosed) * 100 : 0}%`}}
                ></div>
              </div>
            </div>
            <div className="mb-2">
              <div className="d-flex justify-content-between">
                <span>Low Confidence</span>
                <strong className="text-danger">{m.confidenceDistribution.low}</strong>
              </div>
              <div className="progress mb-1" style={{height: '6px'}}>
                <div 
                  className="progress-bar bg-danger" 
                  style={{width: `${m.totalAutoClosed > 0 ? (m.confidenceDistribution.low / m.totalAutoClosed) * 100 : 0}%`}}
                ></div>
              </div>
            </div>
          </div>
          
          <div className="col-md-4 mb-3">
            <h6 className="text-muted mb-2">Performance Metrics</h6>
            <div className="mb-2">
              <div className="d-flex justify-content-between">
                <span>AI Accuracy</span>
                <strong className="text-success">{m.aiRecommendationAccuracy.toFixed(1)}%</strong>
              </div>
              <small className="text-muted">Auto-closed tickets not reopened</small>
            </div>
            <div className="mb-2 mt-3">
              <div className="d-flex justify-content-between">
                <span>Avg Conversation Turns</span>
                <strong>{m.averageConversationTurns.toFixed(1)}</strong>
              </div>
              <small className="text-muted">Before AI closure</small>
            </div>
            <div className="mb-2 mt-3">
              <div className="d-flex justify-content-between">
                <span>Auto Follow-Ups Sent</span>
                <strong className="text-info">{m.autoFollowUpsSent}</strong>
              </div>
              <small className="text-muted">AI-generated follow-up questions</small>
            </div>
          </div>
          
          <div className="col-md-4 mb-3">
            <h6 className="text-muted mb-2">System Metrics</h6>
            <div className="mb-2">
              <div className="d-flex justify-content-between">
                <span>Resolution Rate</span>
                <strong>{(m.resolutionRate * 100).toFixed(1)}%</strong>
              </div>
              <small className="text-muted">All tickets closed</small>
            </div>
            <div className="mb-2 mt-3">
              <div className="d-flex justify-content-between">
                <span>Auto-Close Rate</span>
                <strong>{m.autoCloseRate.toFixed(1)}%</strong>
              </div>
              <small className="text-muted">Of all closed tickets</small>
            </div>
            <div className="mb-2 mt-3">
              <div className="d-flex justify-content-between">
                <span>Avg Resolution Time</span>
                <strong>{m.averageResolutionTime.toFixed(1)} days</strong>
              </div>
              <small className="text-muted">From creation to closure</small>
            </div>
          </div>
        </div>
        
        <hr />
        
        <div className="d-flex justify-content-between align-items-center">
          <small className="text-muted">
            <strong>Last AI Analysis Run:</strong> {lastRun}
          </small>
          {m.aiRecommendationAccuracy >= 90 && (
            <span className="badge bg-success">High AI Performance</span>
          )}
          {m.aiRecommendationAccuracy >= 75 && m.aiRecommendationAccuracy < 90 && (
            <span className="badge bg-warning">Good AI Performance</span>
          )}
          {m.aiRecommendationAccuracy < 75 && (
            <span className="badge bg-danger">Review AI Settings</span>
          )}
        </div>
      </Card.Body>
    </Card>
  );
} 