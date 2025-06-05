'use client';

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Pie } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { ticketTypeEcommerceEnum } from '@/db/schema';

// Register necessary Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend);

// Define the ticket structure expected from the API
interface TicketSummary {
  type?: typeof ticketTypeEcommerceEnum.enumValues[number] | null; // Properly type the ticket type
}

// Use the actual ticket types from the schema
const typeValues = ticketTypeEcommerceEnum.enumValues;

// Chart colors for different types - using a more professional color palette
const backgroundColor = [
  'rgba(54, 162, 235, 0.6)',   // Blue
  'rgba(255, 99, 132, 0.6)',   // Red
  'rgba(75, 192, 192, 0.6)',   // Teal
  'rgba(255, 206, 86, 0.6)',   // Yellow
  'rgba(153, 102, 255, 0.6)',  // Purple
  'rgba(255, 159, 64, 0.6)',   // Orange
  'rgba(199, 199, 199, 0.6)',  // Gray
  'rgba(83, 102, 255, 0.6)',   // Indigo
  'rgba(40, 159, 64, 0.6)',    // Green
  'rgba(210, 199, 199, 0.6)',  // Light Gray
  'rgba(78, 205, 196, 0.6)',   // Turquoise
  'rgba(255, 99, 255, 0.6)',   // Pink
  'rgba(255, 159, 64, 0.6)',   // Orange
];

const options = {
  maintainAspectRatio: false,
  responsive: true,
  plugins: {
    legend: {
      position: 'right' as const,
      labels: {
        boxWidth: 15,
        padding: 15,
        font: {
          size: 11
        }
      }
    },
    tooltip: {
      callbacks: {
        label: function(context: any) {
          const label = context.label || '';
          const value = context.raw || 0;
          const total = context.dataset.data.reduce((acc: number, data: number) => acc + data, 0);
          const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
          return `${label}: ${value} (${percentage}%)`;
        }
      }
    }
  }
};

export default function TypeChartClient() {
  const [chartData, setChartData] = useState({
    labels: typeValues,
    datasets: [{
      data: Array(typeValues.length).fill(0), // Initial zeros for all types
      backgroundColor: backgroundColor.slice(0, typeValues.length),
      borderWidth: 1,
      hoverOffset: 4,
    }],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTicketData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await axios.get<{ data: TicketSummary[] }>('/api/tickets');
      const tickets = res.data.data;

      // Process data
      const counts: Record<string, number> = {};
      
      // Initialize all possible types with 0
      typeValues.forEach(type => {
        counts[type] = 0;
      });

      // Count tickets by type
      tickets.forEach(ticket => {
        const type = ticket.type || 'General Inquiry';
        if (counts.hasOwnProperty(type)) {
          counts[type]++;
        }
      });

      // Update chart data state with the new counts
      setChartData(prevData => ({
        ...prevData,
        datasets: [{
          ...prevData.datasets[0],
          data: typeValues.map(type => counts[type] || 0)
        }]
      }));

    } catch (err) {
      console.error('Error fetching type chart data:', err);
      setError('Could not load type chart data.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTicketData();
  }, [fetchTicketData]);

  if (isLoading) return <div className="card-body text-center py-5">Loading Type Chart...</div>;
  if (error) return <div className="card-body text-center py-5 text-danger">{error}</div>;

  // Conditional rendering if no data
  const hasData = chartData.datasets[0].data.some(count => count > 0);

  return (
    <div className="card">
      <div className="card-header">
        <h5>Tickets by Type</h5>
      </div>
      <div className="card-body">
        <div style={{ height: '250px', position: 'relative' }}>
          {hasData ? (
            <Pie data={chartData} options={options} />
          ) : (
            <p className="text-center text-muted mt-5">No ticket data available.</p>
          )}
        </div>
      </div>
    </div>
  );
} 