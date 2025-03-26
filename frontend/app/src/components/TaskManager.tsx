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
  eventSource?: EventSource;
}

// Define the MessageEvent type for SSE events
interface SSEMessageEvent extends Event {
  data: string;
}

const API_BASE_URL = 'http://localhost:8000/api';
const TASK_TYPE = 'dummy'; // Changed from 'test' to match your backend task type

export default function TaskManager() {
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [loading, setLoading] = useState(false);

  // Cleanup function to close all EventSources when component unmounts
  useEffect(() => {
    return () => {
      tasks.forEach(task => {
        task.eventSource?.close();
      });
    };
  }, [tasks]);

  const getStatusColor = (status: string) => {
    const statusLower = status?.toLowerCase() ?? '';
    switch (statusLower) {
      case 'pending':
      case 'started':
        return 'text-orange-500';
      case 'completed':
        return 'text-green-500';
      case 'error':
      case 'failed':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  const subscribeToTaskUpdates = (taskId: string) => {
    const eventSource = new EventSource(`${API_BASE_URL}/subscribe/${taskId}`);

    // Listen for specific event types instead of using onmessage
    eventSource.addEventListener('message', (event: Event) => {
      try {
        const sseEvent = event as SSEMessageEvent;
        console.log('SSE message received:', sseEvent);
        const eventData = JSON.parse(sseEvent.data);
        
        // Update task with the received data
        setTasks(prev => prev.map(task => {
          if (task.id === taskId) {
            return {
              ...task,
              status: eventData.status || task.status,
              result: eventData.result || task.result,
              error: eventData.error,
            };
          }
          return task;
        }));
      } catch (error) {
        console.error('Error parsing event data:', error);
      }
    });

    // Handle complete events
    eventSource.addEventListener('complete', (event: Event) => {
      try {
        const sseEvent = event as SSEMessageEvent;
        console.log('Task completed:', sseEvent);
        const eventData = JSON.parse(sseEvent.data);
        
        // Update task status to completed
        setTasks(prev => prev.map(task => {
          if (task.id === taskId) {
            return {
              ...task,
              status: 'completed',
              result: eventData,
            };
          }
          return task;
        }));
        
        // Close the EventSource
        eventSource.close();
        
        // Remove the eventSource reference
        setTasks(prev => prev.map(task => {
          if (task.id === taskId) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { eventSource: _, ...rest } = task;
            return rest;
          }
          return task;
        }));
      } catch (parseError) {
        console.error('Error handling completion event:', parseError);
      }
    });

    // Handle error events
    eventSource.addEventListener('error', (event: Event) => {
      console.error('SSE error event:', event);
      
      // Try to get error data if available
      try {
        const sseEvent = event as SSEMessageEvent;
        if (sseEvent.data) {
          const errorData = JSON.parse(sseEvent.data);
          setTasks(prev => prev.map(task => 
            task.id === taskId ? { 
              ...task, 
              status: 'error', 
              error: errorData.error || 'Task failed' 
            } : task
          ));
        } else {
          // No error data available
          setTasks(prev => prev.map(task => 
            task.id === taskId ? { 
              ...task, 
              status: 'error', 
              error: 'Connection error or task failed' 
            } : task
          ));
        }
      } catch (parseError) {
        // Default error handling
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        setTasks(prev => prev.map(task => 
          task.id === taskId ? { 
            ...task, 
            status: 'error', 
            error: 'Error in communication with server' 
          } : task
        ));
      }
      
      // Close the EventSource on error
      eventSource.close();
    });

    // General error handling for the EventSource
    eventSource.onerror = () => {
      console.error('EventSource connection error');
      
      // Update task status
      setTasks(prev => prev.map(task => 
        task.id === taskId ? { 
          ...task, 
          status: 'error', 
          error: 'Connection failed or server error' 
        } : task
      ));
      
      // Close the EventSource
      eventSource.close();
    };

    return eventSource;
  };

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
      
      // Create new task with EventSource
      const eventSource = subscribeToTaskUpdates(taskId);
      const newTask: TaskInfo = {
        id: taskId,
        status: data.status ?? 'pending',
        createdAt: new Date(),
        eventSource,
      };
      setTasks(prev => [...prev, newTask]);
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
              <div key={task.id} className="border rounded-lg p-4">
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
                
                {task.result && task.status.toLowerCase() === 'completed' && (
                  <div className="mt-2">
                    <p className="text-sm text-gray-600">Result:</p>
                    <pre className="mt-1 p-2 bg-gray-50 rounded text-sm overflow-x-auto">
                      {JSON.stringify(task.result, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
} 