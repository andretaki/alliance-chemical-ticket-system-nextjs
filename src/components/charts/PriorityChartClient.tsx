'use client';

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, TooltipModel, TooltipItem } from 'chart.js';
import { ticketPriorityEnum } from '@/db/schema';

// Register necessary Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

// Define the ticket structure expected from the API
interface TicketSummary {
  priority: string;
  // Add other fields if needed for filtering, though only priority is used here
}

// Get priority values from our enum
const priorityValues = ticketPriorityEnum.enumValues;

// Define the standard priority order we want to display
const standardPriorities = ['low', 'medium', 'high', 'urgent'] as const;
type StandardPriority = typeof standardPriorities[number];

// Sort priorities in order of importance (low, medium, high)
const orderedPriorities = priorityValues.slice().sort((a, b) => {
  // Place standard priorities in their predefined order
  const aIndex = standardPriorities.indexOf(a as StandardPriority);
  const bIndex = standardPriorities.indexOf(b as StandardPriority);
  
  if (aIndex >= 0 && bIndex >= 0) {
    return aIndex - bIndex; // Both are standard priorities, sort by index
  } else if (aIndex >= 0) {
    return -1; // a is standard, put it first
  } else if (bIndex >= 0) {
    return 1; // b is standard, put it first
  } else {
    return a.localeCompare(b); // Neither is standard, sort alphabetically
  }
});

// Create labels with capitalized first letter
const labels = orderedPriorities.map(priority => 
  priority.charAt(0).toUpperCase() + priority.slice(1)
);

// Chart colors for different priorities
const backgroundColor = [
  'rgba(75, 192, 192, 0.7)',  // Low - Teal
  'rgba(255, 205, 86, 0.7)',  // Medium - Yellow
  'rgba(255, 99, 132, 0.7)',  // High - Red
  'rgba(153, 102, 255, 0.7)',  // Urgent
];

const options = {
  maintainAspectRatio: false,
  responsive: true,
  plugins: {
    legend: {
      display: false,
    },
    tooltip: {
      callbacks: {
        label: function(this: TooltipModel<'bar'>, tooltipItem: TooltipItem<'bar'>) {
          const datasetLabel = tooltipItem.dataset.label || 'Tickets';
          const value = tooltipItem.parsed.y || 0;
          const dataPoints = Array.isArray(tooltipItem.dataset.data) ? tooltipItem.dataset.data : [];
          const total = dataPoints.reduce((acc: number, dataValue: any) => {
            const numValue = Number(dataValue);
            return acc + (isNaN(numValue) ? 0 : numValue);
          }, 0);
          const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
          return `${datasetLabel}: ${value} (${percentage}%)`;
        }
      }
    }
  },
  scales: {
    y: {
      beginAtZero: true,
      ticks: {
        precision: 0 // Only show integers
      }
    }
  }
};

export default function PriorityChartClient() {
  const [chartData, setChartData] = useState({
    labels: labels,
    datasets: [{
      label: 'Tickets by Priority',
      data: Array(orderedPriorities.length).fill(0), // Initial zeros
      backgroundColor: backgroundColor.slice(0, orderedPriorities.length),
      borderWidth: 1,
    }],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTicketData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // API returns: { success, data: { tickets: [...], pagination } }
      const res = await axios.get('/api/tickets');
      const raw = res.data?.data?.tickets;
      const tickets: TicketSummary[] = Array.isArray(raw) ? raw : [];

      // Process data - count tickets by priority
      const counts: Record<string, number> = {};
      
      // Initialize all possible priorities with 0
      priorityValues.forEach(priority => {
        counts[priority] = 0;
      });

      // Count tickets by priority
      tickets.forEach(ticket => {
        const priority = ticket.priority;
        counts[priority] = (counts[priority] || 0) + 1;
      });

      // Update chart data with the new counts, ensuring order matches our orderedPriorities
      setChartData(prevData => ({
        ...prevData,
        datasets: [{
          ...prevData.datasets[0],
          data: orderedPriorities.map(priority => counts[priority] || 0)
        }]
      }));

    } catch (err) {
      console.error('Error fetching priority chart data:', err);
      setError('Could not load priority chart data.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTicketData();
  }, [fetchTicketData]);

  if (isLoading) return <div className="card-body text-center py-5">Loading Priority Chart...</div>;
  if (error) return <div className="card-body alert alert-warning">{error}</div>;

  // Conditional rendering if no data
  const hasData = chartData.datasets[0].data.some(count => count > 0);

  return (
    <div className="card">
      <div className="card-header">
        <h5>Tickets by Priority</h5>
      </div>
      <div className="card-body">
        <div style={{ height: '300px', position: 'relative' }}>
          {hasData ? (
            <Bar data={chartData} options={options} />
          ) : (
            <p className="text-center">No ticket data available for priority chart.</p>
          )}
        </div>
      </div>
    </div>
  );
} 