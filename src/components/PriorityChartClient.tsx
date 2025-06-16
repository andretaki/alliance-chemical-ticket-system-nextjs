'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, TooltipModel, TooltipItem } from 'chart.js';
import { Bar } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

// Chart colors
const chartColors = [
  'rgba(255, 99, 132, 0.7)',  // Low - Red
  'rgba(255, 159, 64, 0.7)',  // Medium - Orange
  'rgba(255, 205, 86, 0.7)',  // High - Yellow
];

interface Ticket {
  priority: string;
}

const PriorityChartClient: React.FC = () => {
  const [chartData, setChartData] = useState<{
    labels: string[];
    datasets: {
      label: string;
      data: number[];
      backgroundColor: string[];
      borderColor: string[];
      borderWidth: number;
    }[];
  }>({
    labels: [],
    datasets: [
      {
        label: 'Tickets by Priority',
        data: [],
        backgroundColor: chartColors,
        borderColor: chartColors.map(color => color.replace('0.7', '1')),
        borderWidth: 1
      }
    ]
  });

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTickets = async () => {
      try {
        setIsLoading(true);
        const response = await axios.get('/api/tickets');
        const tickets: Ticket[] = response.data;

        // Count tickets by priority
        const priorityCounts: { [key: string]: number } = {};
        
        tickets.forEach(ticket => {
          const priority = ticket.priority;
          priorityCounts[priority] = (priorityCounts[priority] || 0) + 1;
        });

        // Ensure proper order (low, medium, high)
        const orderedPriorities = ['low', 'medium', 'high'].filter(p => 
          Object.keys(priorityCounts).includes(p)
        );
        
        // Add any other priorities that might exist but weren't in our predefined list
        Object.keys(priorityCounts).forEach(p => {
          if (!orderedPriorities.includes(p)) {
            orderedPriorities.push(p);
          }
        });

        const counts = orderedPriorities.map(priority => priorityCounts[priority]);

        setChartData({
          labels: orderedPriorities.map(p => p.charAt(0).toUpperCase() + p.slice(1)), // Capitalize
          datasets: [
            {
              label: 'Tickets by Priority',
              data: counts,
              backgroundColor: chartColors.slice(0, orderedPriorities.length),
              borderColor: chartColors.slice(0, orderedPriorities.length).map(color => color.replace('0.7', '1')),
              borderWidth: 1
            }
          ]
        });
      } catch (err) {
        console.error('Error fetching tickets for chart:', err);
        setError('Failed to load chart data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchTickets();
  }, []);

  if (isLoading) {
    return <div>Loading chart data...</div>;
  }

  if (error) {
    return <div className="alert alert-danger">{error}</div>;
  }

  return (
    <div className="card">
      <div className="card-header">
        <h5>Tickets by Priority</h5>
      </div>
      <div className="card-body">
        <div style={{ height: '300px', width: '100%' }}>
          <Bar
            data={chartData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  display: false
                },
                tooltip: {
                  callbacks: {
                    label: function(this: TooltipModel<'bar'>, tooltipItem: TooltipItem<'bar'>) {
                      const datasetLabel = tooltipItem.dataset.label || 'Tickets';
                      const value = tooltipItem.parsed.y || 0;
                      
                      // Ensure dataset.data exists and is an array before reducing
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
                    precision: 0 // Ensure only whole numbers are shown
                  }
                }
              }
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default PriorityChartClient; 