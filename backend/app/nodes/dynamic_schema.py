from abc import ABC
from typing import Dict

from .base import BaseNode
from pydantic import BaseModel


class DynamicSchemaNodeConfig(BaseModel):
    """Configuration for nodes with dynamic input/output schemas."""

    input_schema: Dict[str, str] = {"input_field_1": "str"}
    output_schema: Dict[str, str] = {"response": "str"}


class DynamicSchemaNode(BaseNode, ABC):
    """Base class for nodes with dynamic input/output schemas."""

    def setup(self) -> None:
        """Set up dynamic input/output models based on configuration."""
        # check if the config is an instance of DynamicSchemaNodeConfig
        if not isinstance(self.config, DynamicSchemaNodeConfig):
            raise ValueError(f"Invalid configuration for {self.name}: {self.config}")
        self.input_model = self.get_model_for_schema_dict(
            schema=self.config.input_schema,
            schema_name=f"{self.name}Input",
        )

        self.output_model = self.get_model_for_schema_dict(
            schema=self.config.output_schema,
            schema_name=f"{self.name}Output",
        )


class DynamicInputFixedOutputNodeConfig(BaseModel):
    """Configuration for nodes with dynamic input schema and fixed output schema."""

    input_schema: Dict[str, str] = {"input_1": "str"}


class DynamicInputFixedOutputNode(DynamicSchemaNode):
    """Abstract base class for nodes with dynamic input schema and fixed output schema."""

    fixed_output_schema: Dict[str, str] = {}

    def setup(self) -> None:
        """Set up dynamic input model and fixed output model based on configuration."""
        if not isinstance(self.config, DynamicInputFixedOutputNodeConfig):
            raise ValueError(f"Invalid configuration for {self.name}: {self.config}")

        self.input_model = self.get_model_for_schema_dict(
            schema=self.config.input_schema,
            schema_name=f"{self.name}Input",
        )

        if not self.fixed_output_schema:
            raise ValueError(
                f"Fixed output schema must be defined in the child class for {self.name}"
            )

        self.output_model = self.get_model_for_schema_dict(
            schema=self.fixed_output_schema,
            schema_name=f"{self.name}Output",
        )


class FixedInputDynamicOutputNodeConfig(BaseModel):
    """Configuration for nodes with fixed input schema and dynamic output schema."""

    output_schema: Dict[str, str]


class FixedInputDynamicOutputNode(DynamicSchemaNode):
    """Abstract base class for nodes with fixed input schema and dynamic output schema."""

    fixed_input_schema: Dict[str, str] = {}

    def setup(self) -> None:
        """Set up fixed input model and dynamic output model based on configuration."""
        if not isinstance(self.config, FixedInputDynamicOutputNodeConfig):
            raise ValueError(f"Invalid configuration for {self.name}: {self.config}")

        if not self.fixed_input_schema:
            raise ValueError(
                f"Fixed input schema must be defined in the child class for {self.name}"
            )

        self.input_model = self.get_model_for_schema_dict(
            schema=self.fixed_input_schema,
            schema_name=f"{self.name}Input",
        )

        self.output_model = self.get_model_for_schema_dict(
            schema=self.config.output_schema,
            schema_name=f"{self.name}Output",
        )
