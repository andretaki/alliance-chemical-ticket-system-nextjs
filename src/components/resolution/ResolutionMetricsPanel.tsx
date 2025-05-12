'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, Row, Col, Spinner } from 'react-bootstrap';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);

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
          <h5 className="mb-0">Resolution Metrics</h5>
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
    reopenRate: 0
  };
  
  const m = metrics || defaultMetrics;
  
  // Prepare chart data
  const autoCloseData = {
    labels: ['Auto-Closed', 'Manually Closed'],
    datasets: [
      {
        data: [
          m.totalAutoClosed,
          m.totalResolved - m.totalAutoClosed
        ],
        backgroundColor: ['rgba(54, 162, 235, 0.8)', 'rgba(255, 206, 86, 0.8)'],
        borderWidth: 1
      }
    ]
  };
  
  const reopenRateData = {
    labels: ['Reopened', 'Remained Closed'],
    datasets: [
      {
        data: [
          m.reopenedCount,
          m.totalAutoClosed - m.reopenedCount
        ],
        backgroundColor: ['rgba(255, 99, 132, 0.8)', 'rgba(75, 192, 192, 0.8)'],
        borderWidth: 1
      }
    ]
  };
  
  return (
    <Card className="shadow-sm mb-4">
      <Card.Header className="d-flex justify-content-between align-items-center">
        <h5 className="mb-0">Resolution Metrics</h5>
        {m.lastRunTime && (
          <small className="text-muted">Last run: {new Date(m.lastRunTime).toLocaleString()}</small>
        )}
      </Card.Header>
      <Card.Body>
        <Row>
          <Col md={4} className="text-center border-end mb-3 mb-md-0">
            <h3 className="text-primary">{m.totalResolved}</h3>
            <p className="text-muted mb-0">Total Resolved</p>
          </Col>
          <Col md={4} className="text-center border-end mb-3 mb-md-0">
            <h3 className="text-success">{m.totalAutoClosed}</h3>
            <p className="text-muted mb-0">Auto-Closed</p>
          </Col>
          <Col md={4} className="text-center mb-3 mb-md-0">
            <h3 className="text-info">{m.totalFollowUp}</h3>
            <p className="text-muted mb-0">Follow-ups Sent</p>
          </Col>
        </Row>
        
        <hr />
        
        <Row className="mt-3 mb-4">
          <Col md={4} className="text-center border-end mb-3 mb-md-0">
            <h4>
              {m.averageResolutionTime.toFixed(1)} <small className="text-muted">days</small>
            </h4>
            <p className="text-muted mb-0">Avg. Resolution Time</p>
          </Col>
          <Col md={4} className="text-center border-end mb-3 mb-md-0">
            <h4>
              {(m.autoCloseRate || (m.resolutionRate * 100)).toFixed(1)}% <small className="text-muted">rate</small>
            </h4>
            <p className="text-muted mb-0">Auto-Close Rate</p>
          </Col>
          <Col md={4} className="text-center">
            <h4 className="text-danger">
              {(m.reopenRate || 0).toFixed(1)}% <small className="text-muted">rate</small>
            </h4>
            <p className="text-muted mb-0">Reopen Rate</p>
          </Col>
        </Row>
        
        <Row className="mt-4">
          <Col md={6}>
            <div style={{ height: '200px' }}>
              <Doughnut 
                data={autoCloseData} 
                options={{ 
                  maintainAspectRatio: false,
                  plugins: {
                    title: {
                      display: true,
                      text: 'Auto vs. Manual Closures'
                    }
                  }
                }} 
              />
            </div>
          </Col>
          <Col md={6}>
            <div style={{ height: '200px' }}>
              <Doughnut 
                data={reopenRateData} 
                options={{ 
                  maintainAspectRatio: false,
                  plugins: {
                    title: {
                      display: true,
                      text: 'Auto-Closed Tickets Reopen Rate'
                    }
                  }
                }} 
              />
            </div>
          </Col>
        </Row>
      </Card.Body>
    </Card>
  );
} 