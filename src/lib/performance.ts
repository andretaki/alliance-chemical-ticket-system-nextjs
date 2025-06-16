/**
 * Performance Monitoring Utility
 * FAANG-level performance tracking and metrics collection
 */

interface PerformanceMetric {
  name: string;
  value: number;
  timestamp: number;
  tags?: Record<string, string | number>;
}

interface TimingResult {
  duration: number;
  startTime: number;
  endTime: number;
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private activeTimers: Map<string, number> = new Map();
  private readonly maxMetrics = 1000; // Prevent memory leaks

  /**
   * Start timing an operation
   */
  startTiming(operationName: string): void {
    this.activeTimers.set(operationName, performance.now());
  }

  /**
   * End timing an operation and record the metric
   */
  endTiming(operationName: string, tags?: Record<string, string | number>): TimingResult | null {
    const startTime = this.activeTimers.get(operationName);
    if (!startTime) {
      console.warn(`No start time found for operation: ${operationName}`);
      return null;
    }

    const endTime = performance.now();
    const duration = endTime - startTime;

    this.recordMetric({
      name: `timing.${operationName}`,
      value: duration,
      timestamp: Date.now(),
      tags,
    });

    this.activeTimers.delete(operationName);

    return {
      duration,
      startTime,
      endTime,
    };
  }

  /**
   * Record a custom metric
   */
  recordMetric(metric: PerformanceMetric): void {
    this.metrics.push(metric);

    // Prevent memory leaks by keeping only recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics / 2);
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Performance] ${metric.name}: ${metric.value}ms`, metric.tags);
    }
  }

  /**
   * Get all metrics
   */
  getMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }

  /**
   * Get metrics by name pattern
   */
  getMetricsByPattern(pattern: RegExp): PerformanceMetric[] {
    return this.metrics.filter(metric => pattern.test(metric.name));
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.metrics = [];
  }

  /**
   * Get performance summary
   */
  getSummary(): {
    totalMetrics: number;
    averageResponseTime: number;
    slowestOperations: Array<{ name: string; duration: number }>;
    memoryUsage?: NodeJS.MemoryUsage;
  } {
    const timingMetrics = this.getMetricsByPattern(/^timing\./);
    const averageResponseTime = timingMetrics.length > 0
      ? timingMetrics.reduce((sum, metric) => sum + metric.value, 0) / timingMetrics.length
      : 0;

    const slowestOperations = timingMetrics
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
      .map(metric => ({
        name: metric.name.replace('timing.', ''),
        duration: Math.round(metric.value * 100) / 100,
      }));

    const summary: any = {
      totalMetrics: this.metrics.length,
      averageResponseTime: Math.round(averageResponseTime * 100) / 100,
      slowestOperations,
    };

    // Add memory usage in Node.js environment
    if (typeof process !== 'undefined' && process.memoryUsage) {
      summary.memoryUsage = process.memoryUsage();
    }

    return summary;
  }

  /**
   * Measure execution time of a function
   */
  async measureAsync<T>(
    operationName: string,
    fn: () => Promise<T>,
    tags?: Record<string, string | number>
  ): Promise<T> {
    this.startTiming(operationName);
    try {
      const result = await fn();
      this.endTiming(operationName, { ...tags, status: 'success' });
      return result;
    } catch (error) {
      this.endTiming(operationName, { ...tags, status: 'error' });
      throw error;
    }
  }

  /**
   * Measure execution time of a synchronous function
   */
  measureSync<T>(
    operationName: string,
    fn: () => T,
    tags?: Record<string, string | number>
  ): T {
    this.startTiming(operationName);
    try {
      const result = fn();
      this.endTiming(operationName, { ...tags, status: 'success' });
      return result;
    } catch (error) {
      this.endTiming(operationName, { ...tags, status: 'error' });
      throw error;
    }
  }

  /**
   * Track API response times
   */
  trackApiCall(
    endpoint: string,
    method: string,
    statusCode: number,
    duration: number
  ): void {
    this.recordMetric({
      name: 'api.response_time',
      value: duration,
      timestamp: Date.now(),
      tags: {
        endpoint,
        method,
        statusCode,
        status: statusCode >= 200 && statusCode < 300 ? 'success' : 'error',
      },
    });
  }

  /**
   * Track user interactions
   */
  trackUserAction(action: string, duration?: number): void {
    this.recordMetric({
      name: 'user.action',
      value: duration || 0,
      timestamp: Date.now(),
      tags: { action },
    });
  }

  /**
   * Track errors
   */
  trackError(error: Error, context?: string): void {
    this.recordMetric({
      name: 'error',
      value: 1,
      timestamp: Date.now(),
      tags: {
        message: error.message,
        name: error.name,
        context: context || 'unknown',
      },
    });
  }
}

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor();

// Utility functions for common operations
export const perf = {
  /**
   * Start timing an operation
   */
  start: (operation: string) => performanceMonitor.startTiming(operation),

  /**
   * End timing an operation
   */
  end: (operation: string, tags?: Record<string, string | number>) => 
    performanceMonitor.endTiming(operation, tags),

  /**
   * Measure async operation
   */
  measure: <T>(operation: string, fn: () => Promise<T>, tags?: Record<string, string | number>) => 
    performanceMonitor.measureAsync(operation, fn, tags),

  /**
   * Measure sync operation
   */
  measureSync: <T>(operation: string, fn: () => T, tags?: Record<string, string | number>) => 
    performanceMonitor.measureSync(operation, fn, tags),

  /**
   * Track API call
   */
  api: (endpoint: string, method: string, statusCode: number, duration: number) => 
    performanceMonitor.trackApiCall(endpoint, method, statusCode, duration),

  /**
   * Track user action
   */
  action: (action: string, duration?: number) => 
    performanceMonitor.trackUserAction(action, duration),

  /**
   * Track error
   */
  error: (error: Error, context?: string) => 
    performanceMonitor.trackError(error, context),

  /**
   * Get performance summary
   */
  summary: () => performanceMonitor.getSummary(),

  /**
   * Clear all metrics
   */
  clear: () => performanceMonitor.clearMetrics(),
};

// Export types
export type { PerformanceMetric, TimingResult }; 