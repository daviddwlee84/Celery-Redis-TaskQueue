'use client';

import { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import TaskItem from './TaskItem';

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

const API_BASE_URL = 'http://localhost:8000/api';
const TASK_TYPES = ['dummy']; // Available task types

export default function TaskManager() {
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [taskType, setTaskType] = useState(TASK_TYPES[0]);
  const [keepPrompt, setKeepPrompt] = useState(false);
  
  // Add a ref to track active SSE connections
  const activeConnections = useRef<{ [key: string]: EventSource }>({});

  // Clean up function for SSE connections
  useEffect(() => {
    return () => {
      // Clean up all active connections when component unmounts
      Object.values(activeConnections.current).forEach(connection => {
        connection.close();
      });
    };
  }, []);

  // Load tasks from localStorage on component mount
  useEffect(() => {
    try {
      const storedTasks = localStorage.getItem('tasks');
      if (storedTasks) {
        // Parse the JSON and convert string dates back to Date objects
        const parsedTasks = JSON.parse(storedTasks, (key, value) => {
          if (key === 'createdAt') {
            return new Date(value);
          }
          return value;
        });
        setTasks(parsedTasks);
      }
      
      // Load keep prompt preference
      const storedKeepPrompt = localStorage.getItem('keepPrompt');
      if (storedKeepPrompt) {
        setKeepPrompt(JSON.parse(storedKeepPrompt));
      }
    } catch (error) {
      console.error('Error loading data from localStorage:', error);
    }
  }, []);

  // Save tasks to localStorage whenever tasks change
  useEffect(() => {
    try {
      localStorage.setItem('tasks', JSON.stringify(tasks));
    } catch (error) {
      console.error('Error saving tasks to localStorage:', error);
    }
  }, [tasks]);
  
  // Save keepPrompt preference when it changes
  useEffect(() => {
    try {
      localStorage.setItem('keepPrompt', JSON.stringify(keepPrompt));
    } catch (error) {
      console.error('Error saving keepPrompt to localStorage:', error);
    }
  }, [keepPrompt]);

  // Helper function to update a specific task
  const updateTask = (taskId: string, updates: Partial<TaskInfo>) => {
    setTasks(prev => prev.map(task => 
      task.id === taskId ? { ...task, ...updates } : task
    ));
  };

  // Helper function to delete a task
  const deleteTask = (taskId: string) => {
    setTasks(prev => prev.filter(task => task.id !== taskId));
  };

  // Promise-based function to subscribe to task updates
  async function waitForTaskCompletion(taskId: string): Promise<TaskInfo['result'] | null> {
    // Check if there's already an active connection for this task
    if (activeConnections.current[taskId]) {
      console.log(`Already subscribed to task ${taskId}`);
      return null;
    }

    return new Promise((resolve, reject) => {
      console.log(`Starting waitForTaskCompletion for task ${taskId}`);
      const eventSource = new EventSource(`${API_BASE_URL}/subscribe/${taskId}`);
      
      // Store the connection
      activeConnections.current[taskId] = eventSource;

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
          
          // Close and remove connection on completion
          console.log(`Closing EventSource after completion in waitForTaskCompletion for task ${taskId}`);
          eventSource.close();
          delete activeConnections.current[taskId];
        } catch (error) {
          console.error(`Error handling complete event in waitForTaskCompletion for task ${taskId}:`, error);
          reject(error);
          eventSource.close();
          delete activeConnections.current[taskId];
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
      
      // Modify error handler to clean up connection
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
          delete activeConnections.current[taskId];
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
          delete activeConnections.current[taskId];
          reject(new Error('Task timed out'));
        }
      }, 300000); // 5 minute timeout
      
      // Clean up timeout if event source closes
      eventSource.addEventListener('close', () => {
        clearTimeout(timeoutId);
        delete activeConnections.current[taskId];
      });
    });
  }

  const submitTask = async () => {
    // Don't submit if prompt is empty
    if (!prompt.trim()) {
      alert('Please enter a task prompt');
      return;
    }

    try {
      setLoading(true);
      const taskId = uuidv4();
      
      // Add a timeout for the fetch request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        console.log('Request timeout, aborting');
      }, 10000); // 10 second timeout
      
      try {
        const response = await fetch(`${API_BASE_URL}/queue/${taskType}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            task_id: taskId,
            prompt: prompt,
          } as DummyRequest),
          signal: controller.signal
        });
        
        // Clear the timeout since the request completed
        clearTimeout(timeoutId);
  
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
        
        // Clear the prompt field only if keepPrompt is false
        if (!keepPrompt) {
          setPrompt('');
        }
        
        // Start listening for updates in the background
        waitForTaskCompletion(taskId).catch(error => {
          console.error(`Background task processing error: ${error.message}`);
          // Update task with error status to ensure UI reflects the error
          updateTask(taskId, {
            status: 'error',
            error: error.message || 'Error processing task'
          });
        });
      } catch (fetchError) {
        // Ensure we set loading to false in all error cases
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          throw new Error('Request timed out after 10 seconds. The server might be overloaded or unavailable.');
        } else {
          throw fetchError;
        }
      }
      
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
      // Ensure loading state is reset in all cases
      setLoading(false);
    }
  };

  // Sort tasks by creation time (newest first)
  const sortedTasks = [...tasks].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <div className="max-w-2xl mx-auto mt-10 p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">Celery Task Manager</h2>
      
      <div className="space-y-4 mb-6">
        <div>
          <label htmlFor="taskType" className="block text-base font-medium text-gray-700 mb-1">
            Task Type
          </label>
          <select
            id="taskType"
            value={taskType}
            onChange={(e) => setTaskType(e.target.value)}
            className="block w-full p-2.5 border border-gray-300 rounded-md shadow-sm text-gray-800 font-medium"
          >
            {TASK_TYPES.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
        
        <div>
          <label htmlFor="prompt" className="block text-base font-medium text-gray-700 mb-1">
            Task Prompt
          </label>
          <input
            id="prompt"
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !loading) {
                e.preventDefault();
                submitTask();
              }
            }}
            placeholder="Enter task prompt..."
            className="block w-full p-2.5 border border-gray-300 rounded-md shadow-sm text-gray-800 font-medium"
          />
        </div>
        
        <div className="flex items-center">
          <input
            id="keepPrompt"
            type="checkbox"
            checked={keepPrompt}
            onChange={(e) => setKeepPrompt(e.target.checked)}
            className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
          />
          <label htmlFor="keepPrompt" className="ml-2 block text-sm font-medium text-gray-700">
            Keep prompt after submission
          </label>
        </div>
        
        <button
          onClick={submitTask}
          disabled={loading}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2.5 px-4 rounded disabled:bg-blue-300 text-base"
        >
          {loading ? 'Submitting...' : 'Submit New Task'}
        </button>
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-800">Task List</h3>
        {sortedTasks.length === 0 ? (
          <p className="text-gray-600 text-center py-4 font-medium">No tasks submitted yet</p>
        ) : (
          <div className="space-y-4">
            {sortedTasks.map((task) => (
              <TaskItem 
                key={task.id} 
                task={task} 
                onUpdate={updateTask}
                onDelete={deleteTask}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
} 