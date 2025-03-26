from fastapi import (
    APIRouter,
    HTTPException,
    Request,
)
from sse_starlette.sse import EventSourceResponse
from app.api.models import (
    DummyRequest,
    DummyResponse,
    TaskResponse,
    TaskStatusResponse,
)
from app.tasks.dummy_tasks import DummyTask
from app.core.redis import redis_service
import json
import uuid
import asyncio
from typing import Dict, Any
from celery.result import AsyncResult

# Create the router
router = APIRouter()


async def get_task_result(task_id: str) -> Dict[str, Any]:
    """Get the result of a task from Redis or Celery."""
    # Try to get the result from Redis
    result_json = redis_service.get_value(f"task_response:{task_id}")

    if result_json:
        # Parse the result from Redis
        return json.loads(result_json)

    # Check if the task exists in Celery
    task_result = AsyncResult(task_id)

    if task_result.state == "PENDING":
        return {"status": "pending"}
    elif task_result.state == "FAILURE":
        return {
            "status": "error",
            "error": str(task_result.result),
            "error_type": type(task_result.result).__name__,
        }
    elif task_result.state == "SUCCESS":
        # The task completed but the result wasn't in Redis
        return task_result.result
    else:
        return {"status": task_result.state.lower()}


@router.get("/task/{task_id}", response_model=TaskStatusResponse)
async def get_task_status(task_id: str):
    """Get the status of an asynchronous task."""
    result = await get_task_result(task_id)

    status = (
        "completed"
        if result.get("status") not in ["pending", "failed"]
        else result.get("status")
    )

    # Determine response type based on result content
    response_model = None
    if status == "completed":
        response_model = DummyResponse(**result)

    return TaskStatusResponse(task_id=task_id, status=status, result=response_model)


@router.post("/queue/{type}", response_model=TaskResponse)
async def queue_task(type: str, request: DummyRequest):
    """Start a task based on the specified type."""
    # Generate a task ID if not provided
    task_id = request.task_id or str(uuid.uuid4())

    # Handle different task types
    match type:
        case None:
            # NOTE: this is dummy
            raise HTTPException(
                status_code=400, detail=f"Unsupported task type: {type}"
            )

        case _:
            DummyTask.apply_async(
                args=[
                    task_id,
                    request.prompt,
                ],
                task_id=task_id,
            )

    # Return the task ID for SSE subscription
    return TaskResponse(task_id=task_id)


async def event_generator(task_id: str, request: Request):
    """Generate SSE events from Redis pub/sub."""
    # Subscribe to the Redis channel
    pubsub = redis_service.subscribe(f"task_stream:{task_id}")

    try:
        # Check if the client is still connected
        while not await request.is_disconnected():
            # Get message from Redis pub/sub
            message = pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)

            if message:
                data = json.loads(message["data"])
                event_type = data.get("event")
                event_data = data.get("data")

                # Yield the event
                yield {"event": event_type, "data": json.dumps(event_data)}

                # If this is the completion event, exit the loop
                if event_type in ["complete", "error"]:
                    break

            # Small sleep to prevent CPU spinning
            await asyncio.sleep(0.01)

    except Exception as e:
        # Yield an error event
        yield {
            "event": "error",
            "data": json.dumps(
                {
                    "status": "error",
                    "error": str(e),
                    "error_type": type(e).__name__,
                    "task_id": task_id,
                }
            ),
        }
    finally:
        # Always unsubscribe from the channel
        pubsub.unsubscribe(f"task_stream:{task_id}")
        pubsub.close()


@router.get("/subscribe/{task_id}")
async def subscribe_task_events(task_id: str, request: Request):
    """Stream events from a task."""
    # Return an event source response
    return EventSourceResponse(event_generator(task_id, request))
