'use client';

import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';

interface DummyRequest {
  task_id: string;
  prompt: string;
}

interface TaskResponse {
  task_id: string;
  status?: string;
  message?: string;
}

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
function TaskItem({ task, onUpdate }: { 
  task: TaskInfo, 
  onUpdate: (taskId: string, updates: Partial<TaskInfo>) => void 
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
        <span className={`font-semibold ${getStatusColor(task.status)}`}>
          {task.status}
        </span>
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

const API_BASE_URL = 'http://localhost:8000/api';
const TASK_TYPE = 'dummy'; // Changed from 'test' to match your backend task type

export default function TaskManager() {
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [loading, setLoading] = useState(false);

  // Helper function to update a specific task
  const updateTask = (taskId: string, updates: Partial<TaskInfo>) => {
    setTasks(prev => prev.map(task => 
      task.id === taskId ? { ...task, ...updates } : task
    ));
  };

  // Promise-based function to subscribe to task updates
  async function waitForTaskCompletion(taskId: string): Promise<TaskInfo['result'] | null> {
    return new Promise((resolve, reject) => {
      console.log(`Starting waitForTaskCompletion for task ${taskId}`);
      const eventSource = new EventSource(`${API_BASE_URL}/subscribe/${taskId}`);
      
      // Handler for when the connection is opened
      eventSource.onopen = () => {
        console.log(`EventSource connection opened in waitForTaskCompletion for task ${taskId}`);
      };

      // Add specific event listeners for known event types
      eventSource.addEventListener('start', (event: Event) => {
        try {
          console.log(`Start event received in waitForTaskCompletion for task ${taskId}:`, event);
          updateTask(taskId, { status: 'started' });
        } catch (error) {
          console.error(`Error handling start event in waitForTaskCompletion for task ${taskId}:`, error);
        }
      });
      
      eventSource.addEventListener('complete', (event: Event) => {
        try {
          const messageEvent = event as MessageEvent;
          console.log(`Complete event received in waitForTaskCompletion for task ${taskId}:`, messageEvent);
          const eventData = JSON.parse(messageEvent.data);
          
          const result = {
            content: eventData.content,
            task_id: eventData.task_id
          };
          
          updateTask(taskId, {
            status: 'completed',
            result
          });
          
          // Resolve the promise with the result
          resolve(result);
          
          // Close connection on completion
          console.log(`Closing EventSource after completion in waitForTaskCompletion for task ${taskId}`);
          eventSource.close();
        } catch (error) {
          console.error(`Error handling complete event in waitForTaskCompletion for task ${taskId}:`, error);
          reject(error);
          eventSource.close();
        }
      });

      // General message handler as fallback
      eventSource.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          console.log(`Task update in waitForTaskCompletion for ${taskId}:`, data);
          
          // Update task in state
          updateTask(taskId, {
            status: data.status || 'pending',
            error: data.error,
            result: data.result || (data.content ? { content: data.content, task_id: data.task_id } : undefined)
          });
          
          // Check for completion or failure
          if (data.status === 'completed' || data.status === 'success') {
            const result = data.result || { content: data.content, task_id: data.task_id };
            resolve(result);
            eventSource.close();
          } else if (data.status === 'failed' || data.status === 'error') {
            reject(new Error(data.error || data.message || 'Task failed'));
            eventSource.close();
          }
        } catch (error) {
          console.error(`Error parsing event data in waitForTaskCompletion:`, error);
          updateTask(taskId, {
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          reject(error);
          eventSource.close();
        }
      };
      
      // Connection error handler
      eventSource.onerror = (error) => {
        console.error(`SSE connection error in waitForTaskCompletion for task ${taskId}:`, error);
        
        // Only update status if it's not already in an error state
        const taskStatus = tasks.find(t => t.id === taskId)?.status;
        if (taskStatus && ['pending', 'started'].includes(taskStatus.toLowerCase())) {
          updateTask(taskId, {
            status: 'error',
            error: 'Connection error - the task may still be processing'
          });
        }
        
        // Don't immediately close and reject on first error - browser might retry
        if (eventSource.readyState === EventSource.CLOSED) {
          console.log(`EventSource closed in waitForTaskCompletion for task ${taskId}`);
          reject(new Error('Error with SSE connection'));
        }
      };
      
      // Set a timeout in case the task takes too long
      const timeoutId = setTimeout(() => {
        if (eventSource.readyState !== EventSource.CLOSED) {
          console.warn(`Task timed out in waitForTaskCompletion, closing SSE connection for task ${taskId}`);
          updateTask(taskId, {
            status: 'error',
            error: 'Task timed out after 5 minutes'
          });
          eventSource.close();
          reject(new Error('Task timed out'));
        }
      }, 300000); // 5 minute timeout
      
      // Clean up timeout if event source closes
      eventSource.addEventListener('close', () => {
        clearTimeout(timeoutId);
      });
    });
  }

  const submitTask = async () => {
    try {
      setLoading(true);
      const taskId = uuidv4();
      const response = await fetch(`${API_BASE_URL}/queue/${TASK_TYPE}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          task_id: taskId,
          prompt: 'Test task',
        } as DummyRequest),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }
      
      const data: TaskResponse = await response.json();
      
      // Create new task
      const newTask: TaskInfo = {
        id: taskId,
        status: data.status ?? 'pending',
        createdAt: new Date(),
      };
      
      // Add the task to state
      setTasks(prev => [...prev, newTask]);
      
      // Start listening for updates in the background
      waitForTaskCompletion(taskId).catch(error => {
        console.error(`Background task processing error: ${error.message}`);
      });
      
    } catch (error) {
      console.error('Error submitting task:', error);
      // Add failed task to the list
      setTasks(prev => [...prev, {
        id: uuidv4(),
        status: 'error',
        createdAt: new Date(),
        error: error instanceof Error ? error.message : 'Failed to submit task',
      }]);
    } finally {
      setLoading(false);
    }
  };

  // Sort tasks by creation time (newest first)
  const sortedTasks = [...tasks].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <div className="max-w-2xl mx-auto mt-10 p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-6 text-center">Celery Task Manager</h2>
      
      <button
        onClick={submitTask}
        disabled={loading}
        className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded disabled:bg-blue-300 mb-6"
      >
        {loading ? 'Submitting...' : 'Submit New Task'}
      </button>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Task List</h3>
        {sortedTasks.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No tasks submitted yet</p>
        ) : (
          <div className="space-y-4">
            {sortedTasks.map((task) => (
              <TaskItem 
                key={task.id} 
                task={task} 
                onUpdate={updateTask} 
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
} 