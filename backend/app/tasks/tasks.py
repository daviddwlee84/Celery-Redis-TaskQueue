import asyncio
from celery import Task
from app.core.redis import redis_service
from typing import Any, Protocol


class AsyncClient(Protocol):
    """Protocol defining the interface that AI client implementations must satisfy."""

    async def send_message(self, message: str) -> Any:
        """Send a message to the AI service and return the response."""
        ...


class AsyncAITask(Task):
    """Base class for AI Celery tasks that use async functions."""

    _client = None

    @property
    async def client(self) -> AsyncClient:
        """Get the AI client. This should be implemented by subclasses."""
        raise NotImplementedError

    def run(self, *args, **kwargs):
        """Run the coroutine in an event loop."""
        return asyncio.run(self._run_async(*args, **kwargs))

    async def _run_async(self, *args, **kwargs):
        """This should be implemented by subclasses."""
        raise NotImplementedError


class GenericTask(AsyncAITask):
    """Generic task"""

    async def _run_async(
        self,
        task_id: str,
        message: str,
    ):
        """Process a prompt with an AI model and stream the response to Redis."""
        try:
            # Publish start event
            redis_service.publish_start_event(task_id)

            # Get client
            client = await self.client

            # Send the message to the AI service
            response = await self.send_message(client, message)

            # Prepare the final response
            final_response = {
                "status": "success",
                "content": response,
                "task_id": task_id,
            }

            # Publish completion event
            redis_service.publish_complete_event(task_id, final_response)

            # Store the final response in Redis for retrieval
            redis_service.store_response(task_id, final_response)

            return response

        except Exception as e:
            # Prepare error response
            error_response = {
                "status": "error",
                "error": str(e),
                "error_type": type(e).__name__,
                "task_id": task_id,
            }

            try:
                # Publish error event and store the error response
                redis_service.publish_error_event(task_id, e)
                redis_service.store_response(task_id, error_response)
            except Exception:
                pass  # Ignore Redis errors at this point

            return error_response

    async def send_message(self, client: Any, message: str) -> Any:
        """Send the message to the AI service.

        This should be implemented by subclasses to handle the specific API call.
        """
        raise NotImplementedError
