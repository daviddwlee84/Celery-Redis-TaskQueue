from pydantic import BaseModel, Field
from typing import Optional, Union


class DummyRequest(BaseModel):
    """Request model for dummy requests."""

    task_id: Optional[str] = Field(
        None,
        description="Custom task ID for tracking. If not provided, a UUID will be generated.",
    )
    prompt: str = Field(..., description="The prompt to send to dummy")


class DummyResponse(BaseModel):
    """Response model for dummy responses."""

    status: str = Field(..., description="Status of the response (success or error)")
    content: Optional[str] = Field(
        None, description="Content of the response if successful"
    )
    error: Optional[str] = Field(None, description="Error message if status is error")


class TaskResponse(BaseModel):
    """Response model for task submission."""

    task_id: str = Field(..., description="Task ID for tracking the request")
    status: str = Field("pending", description="Initial status of the task")
    message: str = Field(
        "Task submitted successfully", description="Message about the task status"
    )


class TaskStatusResponse(BaseModel):
    """Response model for task status."""

    task_id: str = Field(..., description="Task ID")
    status: str = Field(
        ..., description="Status of the task (pending, completed, failed)"
    )
    result: Optional[Union[DummyResponse]] = Field(
        None, description="Result of the task if completed"
    )
