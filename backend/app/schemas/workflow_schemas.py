from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, field_validator

from ..nodes.node_types import is_valid_node_type


class WorkflowNodeCoordinatesSchema(BaseModel):
    """
    Coordinates for a node in a workflow.
    """

    x: float
    y: float


class WorkflowNodeSchema(BaseModel):
    """
    A node represents a single step in a workflow.
    """

    id: str  # ID in the workflow
    parent_id: Optional[str] = None  # ID of the parent node
    title: Optional[str] = ""  # Display name
    node_type: str  # Name of the node type
    config: Dict[str, Any] = {}  # Configuration parameters
    coordinates: Optional[WorkflowNodeCoordinatesSchema] = (
        None  # Position of the node in the workflow
    )
    subworkflow: Optional["WorkflowDefinitionSchema"] = None  # Sub-workflow definition

    @field_validator("node_type")
    def type_must_be_in_factory(cls, v: str):
        if not is_valid_node_type(v):
            raise ValueError(f"Node type '{v}' is not valid.")
        return v


class WorkflowLinkSchema(BaseModel):
    """
    A link connects an output key of a source node to an input key of a target node.
    """

    source_id: str
    source_output_key: str
    target_id: str
    target_input_key: str


class WorkflowDefinitionSchema(BaseModel):
    """
    A workflow is a DAG of nodes.
    """

    nodes: List[WorkflowNodeSchema]
    links: List[WorkflowLinkSchema]
    test_inputs: List[Dict[str, Any]] = []

    @field_validator("nodes")
    def nodes_must_have_unique_ids(cls, v: List[WorkflowNodeSchema]):
        node_ids = [node.id for node in v]
        if len(node_ids) != len(set(node_ids)):
            raise ValueError("Node IDs must be unique.")
        return v

    @field_validator("nodes")
    def must_have_one_and_only_one_input_node(cls, v: List[WorkflowNodeSchema]):
        input_nodes = [
            node
            for node in v
            if node.node_type == "InputNode" and node.parent_id is None
        ]
        if len(input_nodes) != 1:
            raise ValueError("Workflow must have exactly one input node.")
        return v

    @field_validator("nodes")
    def must_have_at_most_one_output_node(cls, v: List[WorkflowNodeSchema]):
        output_nodes = [node for node in v if node.node_type == "OutputNode"]
        if len(output_nodes) > 1:
            raise ValueError("Workflow must have at most one output node.")
        return v

    class Config:
        from_attributes = True


class WorkflowCreateRequestSchema(BaseModel):
    """
    A request to create a new workflow.
    """

    name: str
    description: str = ""
    definition: Optional[WorkflowDefinitionSchema] = None


class WorkflowResponseSchema(BaseModel):
    """
    A response containing the details of a workflow.
    """

    id: str
    name: str
    description: Optional[str]
    definition: WorkflowDefinitionSchema
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class WorkflowVersionResponseSchema(BaseModel):
    """
    A response containing the details of a workflow version.
    """

    version: int
    name: str
    description: Optional[str]
    definition: Any
    definition_hash: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
