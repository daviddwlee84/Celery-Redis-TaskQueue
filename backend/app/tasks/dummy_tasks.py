from typing import Dict, Any
from app.core.celery_app import celery_app
from app.tasks.tasks import (
    AsyncAITask,
    GenericTask,
)


class DummyClient:
    """Dummy client for testing."""

    def __init__(self):
        pass

    async def send_message(self, message: str) -> Any:
        import time

        time.sleep(10)

        # NOTE: just to simulate an error
        if "error" in message:
            raise Exception("Error")

        # Generate a random response based on the message
        responses = [
            f"Random response to: {message}",
            f"Here's a dummy reply for: {message}",
            f"Generated response about: {message}",
        ]
        return responses[hash(message) % len(responses)]


# Create Gemini client
async def get_dummy_client():
    client = DummyClient()
    return client


class AsyncDummyTask(AsyncAITask):
    """Base class for Gemini Celery tasks that use async functions."""

    _client = None

    @property
    async def client(self):
        if self._client is None:
            self._client = await get_dummy_client()
        return self._client


class DummyTask(GenericTask, AsyncDummyTask):
    """Task to stream a prompt with Gemini 2.0 Flash."""

    async def send_message(
        self, client: DummyClient, message_params: Dict[str, Any]
    ) -> Any:
        """Send the message."""
        return await client.send_message(message_params)


# Register the tasks properly with Celery
DummyTask = celery_app.register_task(DummyTask())
