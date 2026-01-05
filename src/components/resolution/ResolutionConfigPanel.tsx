'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { Alert, Button, Card, Form, Spinner } from 'react-bootstrap';
import { toast } from 'sonner';

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
  const [config, setConfig] = useState<ResolutionConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function loadConfig() {
      setIsLoading(true);
      try {
        const res = await axios.get('/api/admin/resolution-config');
        setConfig(res.data);
      } catch (err: any) {
        toast.error(err.response?.data?.error || 'Failed to load configuration');
      } finally {
        setIsLoading(false);
      }
    }
    loadConfig();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;

    setIsSubmitting(true);
    const toastId = toast.loading('Saving configuration...');

    try {
      await axios.post('/api/admin/resolution-config', config);
      toast.success('Configuration saved successfully!', { id: toastId });
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save configuration', { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { id, value, type } = e.target;
    const isCheckbox = type === 'checkbox';

    setConfig(prevConfig => {
      if (!prevConfig) return null;
      return {
        ...prevConfig,
        [id]: isCheckbox ? (e.target as HTMLInputElement).checked : (type === 'number' ? parseInt(value) : value)
      };
    });
  };

  if (isLoading) {
    return (
      <Card className="shadow-sm mb-4">
        <Card.Body className="text-center py-5">
          <Spinner animation="border" role="status"><span className="visually-hidden">Loading...</span></Spinner>
        </Card.Body>
      </Card>
    );
  }

  if (!config) {
    return <Alert variant="danger">Could not load configuration.</Alert>
  }

  return (
    <Card className="shadow-sm">
      <Card.Header>
        <h5 className="mb-0">AI Resolution Settings</h5>
      </Card.Header>
      <Card.Body>
        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-3">
            <Form.Check
              type="switch"
              id="autoCloseEnabled"
              label="Enable Auto-Close"
              checked={config.autoCloseEnabled}
              onChange={handleFormChange}
            />
            <Form.Text>When enabled, tickets that meet criteria will be automatically closed.</Form.Text>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Confidence Threshold</Form.Label>
            <Form.Select id="confidenceThreshold" value={config.confidenceThreshold} onChange={handleFormChange}>
              <option value="high">High Only</option>
              <option value="medium">Medium or Higher</option>
              <option value="low">Any Confidence</option>
            </Form.Select>
            <Form.Text>Minimum AI confidence required to auto-close.</Form.Text>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>General Inactivity Days</Form.Label>
            <Form.Control type="number" id="inactivityDays" min="1" max="30" value={config.inactivityDays} onChange={handleFormChange as any} />
            <Form.Text>Days a ticket must be inactive before being checked.</Form.Text>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>High-Confidence Inactivity Days</Form.Label>
            <Form.Control type="number" id="inactivityDaysForConfidentClosure" min="1" max="14" value={config.inactivityDaysForConfidentClosure} onChange={handleFormChange as any}/>
            <Form.Text>Shorter inactivity period for tickets AI is highly confident about.</Form.Text>
          </Form.Group>

          <hr />

          <Form.Group className="mb-3">
            <Form.Label>Minimum Conversation Turns</Form.Label>
            <Form.Control type="number" id="minimumConversationTurnsForAI" min="1" max="10" value={config.minimumConversationTurnsForAI} onChange={handleFormChange as any}/>
            <Form.Text>AI will only analyze conversations with at least this many back-and-forth messages.</Form.Text>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Check
              type="switch"
              id="autoCloseOnlyIfAgentRespondedLast"
              label="Only Close if Agent Replied Last"
              checked={config.autoCloseOnlyIfAgentRespondedLast}
              onChange={handleFormChange}
            />
            <Form.Text>A safety measure to prevent closing on an open customer question.</Form.Text>
          </Form.Group>

          <hr/>

          <Form.Group className="mb-3">
            <Form.Check
              type="switch"
              id="sendCustomerNotification"
              label="Send Closure Notifications"
              checked={config.sendCustomerNotification}
              onChange={handleFormChange}
            />
          </Form.Group>
          
          <Form.Group className="mb-3">
            <Form.Check
              type="switch"
              id="enableAutoFollowUp"
              label="Enable Auto Follow-Up Questions"
              checked={config.enableAutoFollowUp}
              onChange={handleFormChange}
            />
            <Form.Text>Allow AI to automatically send clarifying questions to customers.</Form.Text>
          </Form.Group>

          <Button type="submit" variant="primary" className="w-100" disabled={isSubmitting}>
            {isSubmitting ? <Spinner as="span" animation="border" size="sm" /> : 'Save Configuration'}
          </Button>
        </Form>
      </Card.Body>
    </Card>
  );
} 