'use client';

import { useState, useEffect } from 'react';

interface TaskStatus {
  task_id: string;
  status: string;
  result?: {
    message?: string;
    [key: string]: string | number | boolean | null | undefined;
  };
}

interface TaskInfo {
  id: string;
  status: string;
  result?: TaskStatus['result'];
  createdAt: Date;
  error?: string;
}

type TaskEventData = {
  status?: string;
  result?: TaskStatus['result'];
  error?: string;
  content?: string;
  task_id?: string;
  timestamp?: number;
  event?: string;
  message?: string;
  [key: string]: string | number | boolean | undefined | null | object;
};

// TaskItem component to handle individual task state and EventSource
export default function TaskItem({ 
  task, 
  onUpdate,
  onDelete 
}: { 
  task: TaskInfo, 
  onUpdate: (taskId: string, updates: Partial<TaskInfo>) => void,
  onDelete: (taskId: string) => void
}) {
  const [eventSource, setEventSource] = useState<EventSource | null>(null);
  
  // Connect to EventSource when component mounts
  useEffect(() => {
    // Only create the connection if task is in pending state
    if (task.status.toLowerCase() === 'pending') {
      const es = subscribeToTaskUpdates(task.id);
      setEventSource(es);
    }
    
    // Cleanup function
    return () => {
      if (eventSource && eventSource.readyState !== EventSource.CLOSED) {
        console.log(`Closing event source for task ${task.id}`);
        eventSource.close();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]); // Only run on mount or if task.id changes
  
  function subscribeToTaskUpdates(taskId: string): EventSource {
    const API_BASE_URL = 'http://localhost:8000/api';
    console.log(`Opening EventSource connection for task ${taskId}`);
    
    // Create EventSource with proper params
    const eventSource = new EventSource(`${API_BASE_URL}/subscribe/${taskId}`);
    
    // Handler for when the connection is opened
    eventSource.onopen = () => {
      console.log(`EventSource connection opened for task ${taskId}`);
    };
  
    // Add specific event listeners for known event types
    eventSource.addEventListener('start', (event: Event) => {
      try {
        console.log(`Start event received for task ${taskId}:`, event);
        onUpdate(taskId, { status: 'started' });
      } catch (error) {
        console.error(`Error handling start event for task ${taskId}:`, error);
      }
    });
    
    eventSource.addEventListener('complete', (event: Event) => {
      try {
        const messageEvent = event as MessageEvent;
        console.log(`Complete event received for task ${taskId}:`, messageEvent);
        const eventData = JSON.parse(messageEvent.data);
        
        onUpdate(taskId, {
          status: 'completed',
          result: {
            content: eventData.content,
            task_id: eventData.task_id
          }
        });
        
        // Close connection on completion
        console.log(`Closing EventSource after completion for task ${taskId}`);
        eventSource.close();
      } catch (error) {
        console.error(`Error handling complete event for task ${taskId}:`, error);
      }
    });
    
    eventSource.addEventListener('error', (event: Event) => {
      try {
        const messageEvent = event as MessageEvent;
        console.log(`Error event received for task ${taskId}:`, messageEvent);
        
        // Try to parse error data if available
        if (messageEvent.data) {
          const eventData = JSON.parse(messageEvent.data);
          onUpdate(taskId, {
            status: 'error',
            error: eventData.error || eventData.message || 'Task failed'
          });
        } else {
          onUpdate(taskId, {
            status: 'error',
            error: 'Task error with no details'
          });
        }
      } catch (error) {
        console.error(`Error handling error event for task ${taskId}:`, error);
        onUpdate(taskId, {
          status: 'error',
          error: 'Error processing server error response'
        });
      } finally {
        // Close connection on error event
        console.log(`Closing EventSource after error event for task ${taskId}`);
        eventSource.close();
      }
    });
  
    // General message handler as fallback
    eventSource.onmessage = (event: MessageEvent) => {
      try {
        console.log(`General message received for task ${taskId}:`, event);
        const eventData: TaskEventData = JSON.parse(event.data);
        
        // Handle different event types based on the data
        if (eventData.status === 'success' || eventData.status === 'completed') {
          onUpdate(taskId, {
            status: 'completed',
            result: {
              content: eventData.content,
              task_id: eventData.task_id
            }
          });
          
          // Close connection on completion
          console.log(`Closing EventSource after completion (from onmessage) for task ${taskId}`);
          eventSource.close();
        } else if (eventData.status === 'failed' || eventData.status === 'error') {
          onUpdate(taskId, {
            status: 'error',
            error: eventData.error || eventData.message || 'Task failed'
          });
          
          // Close connection on error
          console.log(`Closing EventSource after error (from onmessage) for task ${taskId}`);
          eventSource.close();
        } else if (eventData.event === 'start' || eventData.status === 'started') {
          onUpdate(taskId, { status: 'started' });
        }
      } catch (error) {
        console.error(`Error handling message for task ${taskId}:`, error);
        onUpdate(taskId, {
          status: 'error',
          error: 'Error processing server response'
        });
        
        // Close connection on error
        console.log(`Closing EventSource after message error for task ${taskId}`);
        eventSource.close();
      }
    };
  
    // Connection error handler
    eventSource.onerror = (error) => {
      console.error(`EventSource connection error for task ${taskId}`, error);
      
      // Only update status if the task is still pending or started
      if (['pending', 'started'].includes(task.status.toLowerCase())) {
        onUpdate(taskId, {
          status: 'error',
          error: 'Connection error - the task may still be processing'
        });
      }
      
      // Don't automatically close on first error - let browser retry
      // Only close if connection is failed (not connecting)
      if (eventSource.readyState === EventSource.CLOSED) {
        console.log(`EventSource already closed for task ${taskId}`);
      }
    };
  
    return eventSource;
  }
  
  const getStatusColor = (status: string) => {
    const statusLower = status.toLowerCase();
    switch (statusLower) {
      case 'pending':
      case 'started':
        return 'text-orange-500';
      case 'completed':
      case 'success':
        return 'text-green-500';
      case 'error':
      case 'failed':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };
  
  return (
    <div className="border rounded-lg p-4">
      <div className="flex justify-between items-start mb-2">
        <div>
          <p className="text-sm text-gray-600">Task ID:</p>
          <p className="font-mono text-sm break-all">{task.id}</p>
          <p className="text-xs text-gray-400 mt-1">
            Created: {task.createdAt.toLocaleString()}
          </p>
        </div>
        <div className="flex flex-col items-end">
          <span className={`font-semibold ${getStatusColor(task.status)}`}>
            {task.status}
          </span>
          <button
            onClick={() => onDelete(task.id)}
            className="mt-2 text-red-500 hover:text-red-700 text-sm"
          >
            Delete
          </button>
        </div>
      </div>
      
      {task.error && (
        <div className="mt-2 text-red-500 text-sm">
          Error: {task.error}
        </div>
      )}
      
      {task.result && (task.status.toLowerCase() === 'completed' || task.status.toLowerCase() === 'success') && (
        <div className="mt-2">
          <p className="text-sm text-gray-600">Result:</p>
          <pre className="mt-1 p-2 bg-gray-50 rounded text-sm overflow-x-auto">
            {JSON.stringify(task.result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
} 