from abc import ABC, abstractmethod
from hashlib import md5
from typing import Any, Dict, Optional, Type

from pydantic import BaseModel, Field, create_model
from ..execution.workflow_execution_context import WorkflowExecutionContext
from ..schemas.workflow_schemas import WorkflowDefinitionSchema


class VisualTag(BaseModel):
    """
    Pydantic model for visual tag properties.
    """

    acronym: str = Field(...)
    color: str = Field(
        ..., pattern=r"^#(?:[0-9a-fA-F]{3}){1,2}$"
    )  # Hex color code validation using regex


class NodeConfigModel(BaseModel):
    """
    Base class for node configuration models.
    Each node must define its output_schema.
    """

    output_schema: Dict[str, str] = {"response": "str"}

    pass


class NodeOutputModel(BaseModel):
    """
    Base class for all node outputs.
    Each node type will define its own output model that inherits from this.
    """

    pass


class NodeInputModel(BaseModel):
    """
    Base class for node inputs.
    Each node's input model will be dynamically created based on its predecessor nodes,
    with fields named after node IDs and types being the corresponding NodeOutputModels.
    """

    pass


class BaseNode(ABC):
    """
    Base class for all nodes.
    Each node receives inputs as a Pydantic model where:
    - Field names are predecessor node IDs
    - Field types are the corresponding NodeOutputModels
    """

    name: str
    config_model: Type[BaseModel]
    output_model: Type[NodeOutputModel]
    input_model: Type[NodeInputModel]
    _config: NodeConfigModel
    _input: NodeInputModel
    _output: NodeOutputModel
    visual_tag: VisualTag
    subworkflow: Optional[WorkflowDefinitionSchema]
    subworkflow_output: Optional[Dict[str, Any]]

    def __init__(
        self,
        config: NodeConfigModel,
        context: Optional[WorkflowExecutionContext] = None,
    ) -> None:
        self._config = config
        self.context = context
        self.output_model = self.create_output_model_class(config.output_schema)
        self.subworkflow = None
        self.subworkflow_output = None
        if not hasattr(self, "visual_tag"):
            self.visual_tag = self.get_default_visual_tag()
        self.setup()

    @abstractmethod
    def setup(self) -> None:
        """
        Setup method to define output_model and any other initialization.
        For dynamic schema nodes, these can be created based on self.config.
        """

    def create_input_model_class(
        self, input: Dict[str, NodeOutputModel]
    ) -> Type[NodeInputModel]:
        """
        Dynamically creates an input model based on predecessor nodes.

        Args:
            predecessor_outputs: Dictionary mapping predecessor node IDs to their output model types

        Returns:
            A new Pydantic model type with fields for each predecessor node.
        """
        return create_model(
            f"{self.name}Input",
            **{
                node_id: (type(output), ...)
                for node_id, output in input.items()  # type: ignore
            },
            __base__=NodeInputModel,
        )

    def create_output_model_class(
        self, output_schema: Dict[str, str]
    ) -> Type[NodeOutputModel]:
        """
        Dynamically creates an output model based on the node's output schema.
        """
        return create_model(
            f"{self.name}Output",
            **{field_name: (field_type, ...) for field_name, field_type in output_schema.items()},  # type: ignore
            __base__=NodeOutputModel,
        )

    async def __call__(
        self, inputs: Dict[str, NodeOutputModel] | NodeInputModel
    ) -> NodeOutputModel:
        """
        Validates inputs and runs the node's logic.

        Args:
            inputs: Pydantic model containing predecessor outputs or a dictionary of node_id : NodeOutputModels

        Returns:
            The node's output model
        """
        if isinstance(inputs, dict):
            input_model_class = self.create_input_model_class(inputs)
            inputs = input_model_class.model_validate(inputs)

        result = await self.run(inputs)

        try:
            output_validated = self.output_model.model_validate(result.model_dump())
        except AttributeError:
            output_validated = self.output_model.model_validate(result)
        except Exception as e:
            raise ValueError(f"Output validation error in {self.name}: {e}")

        return output_validated

    @abstractmethod
    async def run(self, inputs: NodeInputModel) -> NodeOutputModel:
        """
        Abstract method where the node's core logic is implemented.

        Args:
            inputs: Pydantic model containing predecessor outputs

        Returns:
            An instance compatible with output_model
        """
        pass

    @property
    def config(self) -> Any:
        """
        Return the node's configuration.
        """
        return self.config_model.model_validate(self._config.model_dump())

    @property
    def input(self) -> Any:
        """
        Return the node's input.
        """
        return self.input_model.model_validate(self._input.model_dump())

    @property
    def output(self) -> Any:
        """
        Return the node's output.
        """
        return self.output_model.model_validate(self._output.model_dump())

    @classmethod
    def get_default_visual_tag(cls) -> VisualTag:
        """
        Set a default visual tag for the node.
        """
        # default acronym is the first letter of each word in the node name
        acronym = "".join([word[0] for word in cls.name.split("_")]).upper()

        # default color is randomly picked from a list of pastel colors
        colors = [
            "#007BFF",  # Electric Blue
            "#28A745",  # Emerald Green
            "#FFC107",  # Sunflower Yellow
            "#DC3545",  # Crimson Red
            "#6F42C1",  # Royal Purple
            "#FD7E14",  # Bright Orange
            "#20C997",  # Teal
            "#E83E8C",  # Hot Pink
            "#17A2B8",  # Cyan
            "#6610F2",  # Indigo
            "#8CC63F",  # Lime Green
            "#FF00FF",  # Magenta
            "#FFD700",  # Gold
            "#FF7F50",  # Coral
            "#40E0D0",  # Turquoise
            "#00BFFF",  # Deep Sky Blue
            "#FF5522",  # Orange
            "#FA8072",  # Salmon
            "#8A2BE2",  # Violet
        ]
        color = colors[int(md5(cls.__name__.encode()).hexdigest(), 16) % len(colors)]

        return VisualTag(acronym=acronym, color=color)
