'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { Alert, Button, Card, Form, Spinner } from 'react-bootstrap';

interface ResolutionConfig {
  autoCloseEnabled: boolean;
  inactivityDays: number;
  confidenceThreshold: 'high' | 'medium' | 'low';
  maxTicketsPerBatch: number;
  sendCustomerNotification: boolean;
  includeSurveyLink: boolean;
  surveyUrl?: string;
  autoCloseOnlyIfAgentRespondedLast: boolean;
  minimumConversationTurnsForAI: number;
  inactivityDaysForConfidentClosure: number;
  enableAutoFollowUp: boolean;
  analyzeLowActivityTickets: boolean;
}

export default function ResolutionConfigPanel() {
  const [config, setConfig] = useState<ResolutionConfig>({
    autoCloseEnabled: true,
    inactivityDays: 5,
    confidenceThreshold: 'high',
    maxTicketsPerBatch: 50,
    sendCustomerNotification: true,
    includeSurveyLink: false,
    surveyUrl: '',
    autoCloseOnlyIfAgentRespondedLast: true,
    minimumConversationTurnsForAI: 2,
    inactivityDaysForConfidentClosure: 3,
    enableAutoFollowUp: false,
    analyzeLowActivityTickets: false
  });
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Load existing config on mount
  useEffect(() => {
    async function loadConfig() {
      try {
        setIsLoading(true);
        const res = await axios.get('/api/admin/resolution-config');
        setConfig(res.data);
        setError(null);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to load configuration');
        console.error('Failed to load resolution config', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadConfig();
  }, []);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    
    try {
      await axios.post('/api/admin/resolution-config', config);
      setSuccess('Configuration saved successfully');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save configuration');
      console.error('Failed to save resolution config', err);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  if (isLoading) {
    return (
      <Card className="shadow-sm mb-4">
        <Card.Header>
          <h5 className="mb-0">AI Sales Manager Configuration</h5>
        </Card.Header>
        <Card.Body className="text-center py-5">
          <Spinner animation="border" role="status">
            <span className="visually-hidden">Loading...</span>
          </Spinner>
        </Card.Body>
      </Card>
    );
  }
  
  return (
    <Card className="shadow-sm mb-4">
      <Card.Header>
        <h5 className="mb-0">AI Sales Manager Configuration</h5>
      </Card.Header>
      <Card.Body>
        {error && <Alert variant="danger">{error}</Alert>}
        {success && <Alert variant="success">{success}</Alert>}
        
        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-3">
            <Form.Check 
              type="switch"
              id="autoCloseEnabled"
              label="Enable Auto-Close"
              checked={config.autoCloseEnabled}
              onChange={(e) => setConfig({...config, autoCloseEnabled: e.target.checked})}
            />
            <Form.Text className="text-muted">
              When enabled, tickets that meet criteria will be automatically closed
            </Form.Text>
          </Form.Group>
          
          <Form.Group className="mb-3">
            <Form.Label>Days of Inactivity Before Check</Form.Label>
            <Form.Control
              type="number"
              id="inactivityDays"
              min="1"
              max="30"
              value={config.inactivityDays}
              onChange={(e) => setConfig({...config, inactivityDays: parseInt(e.target.value)})}
            />
            <Form.Text className="text-muted">
              How many days a ticket must be inactive before being eligible for auto-resolution
            </Form.Text>
          </Form.Group>
          
          <Form.Group className="mb-3">
            <Form.Label>Confidence Threshold</Form.Label>
            <Form.Select
              id="confidenceThreshold"
              value={config.confidenceThreshold}
              onChange={(e) => setConfig({
                ...config, 
                confidenceThreshold: e.target.value as 'high' | 'medium' | 'low'
              })}
            >
              <option value="high">High Only</option>
              <option value="medium">Medium or Higher</option>
              <option value="low">Any Confidence</option>
            </Form.Select>
            <Form.Text className="text-muted">
              AI confidence level required to consider a ticket resolved
            </Form.Text>
          </Form.Group>
          
          <Form.Group className="mb-3">
            <Form.Label>Max Tickets Per Batch</Form.Label>
            <Form.Control
              type="number"
              id="maxTicketsPerBatch"
              min="10"
              max="200"
              value={config.maxTicketsPerBatch}
              onChange={(e) => setConfig({...config, maxTicketsPerBatch: parseInt(e.target.value)})}
            />
            <Form.Text className="text-muted">
              Maximum number of tickets to process in a single batch
            </Form.Text>
          </Form.Group>
          
          <hr />
          <h6 className="text-muted mb-3">AI Analysis Configuration</h6>
          
          <Form.Group className="mb-3">
            <Form.Check 
              type="switch"
              id="autoCloseOnlyIfAgentRespondedLast"
              label="Only Auto-Close When Agent Responded Last"
              checked={config.autoCloseOnlyIfAgentRespondedLast}
              onChange={(e) => setConfig({...config, autoCloseOnlyIfAgentRespondedLast: e.target.checked})}
            />
            <Form.Text className="text-muted">
              Safety measure: Only auto-close tickets where the agent was the last to respond
            </Form.Text>
          </Form.Group>
          
          <Form.Group className="mb-3">
            <Form.Label>Minimum Conversation Turns for AI</Form.Label>
            <Form.Control
              type="number"
              id="minimumConversationTurnsForAI"
              min="1"
              max="10"
              value={config.minimumConversationTurnsForAI}
              onChange={(e) => setConfig({...config, minimumConversationTurnsForAI: parseInt(e.target.value)})}
            />
            <Form.Text className="text-muted">
              Minimum number of customer+agent messages before AI analysis is performed
            </Form.Text>
          </Form.Group>
          
          <Form.Group className="mb-3">
            <Form.Label>Inactivity Days for High Confidence Closure</Form.Label>
            <Form.Control
              type="number"
              id="inactivityDaysForConfidentClosure"
              min="1"
              max="14"
              value={config.inactivityDaysForConfidentClosure}
              onChange={(e) => setConfig({...config, inactivityDaysForConfidentClosure: parseInt(e.target.value)})}
            />
            <Form.Text className="text-muted">
              Days of inactivity required for high confidence AI closures (can be less than general inactivity days)
            </Form.Text>
          </Form.Group>
          
          <Form.Group className="mb-3">
            <Form.Check 
              type="switch"
              id="enableAutoFollowUp"
              label="Enable Auto Follow-Up Questions"
              checked={config.enableAutoFollowUp}
              onChange={(e) => setConfig({...config, enableAutoFollowUp: e.target.checked})}
            />
            <Form.Text className="text-muted">
              Allow AI to automatically send follow-up questions to customers when needed
            </Form.Text>
          </Form.Group>
          
          <Form.Group className="mb-3">
            <Form.Check 
              type="switch"
              id="analyzeLowActivityTickets"
              label="Analyze Low Activity Tickets"
              checked={config.analyzeLowActivityTickets}
              onChange={(e) => setConfig({...config, analyzeLowActivityTickets: e.target.checked})}
            />
            <Form.Text className="text-muted">
              Include tickets with minimal conversation in AI analysis (normally skipped)
            </Form.Text>
          </Form.Group>
          
          <hr />
          <h6 className="text-muted mb-3">Customer Notifications</h6>
          
          <Form.Group className="mb-3">
            <Form.Check 
              type="switch"
              id="sendCustomerNotification"
              label="Send Customer Notifications"
              checked={config.sendCustomerNotification}
              onChange={(e) => setConfig({...config, sendCustomerNotification: e.target.checked})}
            />
            <Form.Text className="text-muted">
              Notify customers when their tickets are auto-closed
            </Form.Text>
          </Form.Group>
          
          <Form.Group className="mb-3">
            <Form.Check 
              type="switch"
              id="includeSurveyLink"
              label="Include Survey Link"
              checked={config.includeSurveyLink}
              disabled={!config.sendCustomerNotification}
              onChange={(e) => setConfig({...config, includeSurveyLink: e.target.checked})}
            />
            <Form.Text className="text-muted">
              Include a customer satisfaction survey link in closure notifications
            </Form.Text>
          </Form.Group>
          
          {config.includeSurveyLink && config.sendCustomerNotification && (
            <Form.Group className="mb-3">
              <Form.Label>Survey URL</Form.Label>
              <Form.Control
                type="text"
                id="surveyUrl"
                placeholder="https://example.com/survey?ticket=[TICKET_ID]"
                value={config.surveyUrl || ''}
                onChange={(e) => setConfig({...config, surveyUrl: e.target.value})}
              />
              <Form.Text className="text-muted">
                Use [TICKET_ID] as a placeholder for the ticket ID
              </Form.Text>
            </Form.Group>
          )}
          
          <Button 
            type="submit" 
            variant="primary" 
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : 'Save Configuration'}
          </Button>
        </Form>
      </Card.Body>
    </Card>
  );
} 