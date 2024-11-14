import cloneDeep from 'lodash/cloneDeep';
import { v4 as uuidv4 } from 'uuid';

// Function to create a node based on its type
export const createNode = (nodeTypes, type, id, position, additionalData = {}) => {
  let nodeType = null;

  for (const category in nodeTypes) {
    const found = nodeTypes[category].find((node) => node.name === type);
    if (found) {
      nodeType = found;
      break;
    }
  }
  if (!nodeType) {
    return null;
  }

  const inputProperties = cloneDeep(nodeType.input?.properties) || {};
  const outputProperties = cloneDeep(nodeType.output?.properties) || {};

  let processedAdditionalData = cloneDeep(additionalData);

  // If the additional data has input/output properties, merge them with the default properties
  if (additionalData.input?.properties) {
    processedAdditionalData.input = {
      ...processedAdditionalData.input,
      properties: {
        ...inputProperties,
        ...additionalData.input.properties,
      },
    };
  }

  if (additionalData.output?.properties) {
    processedAdditionalData.output = {
      ...processedAdditionalData.output,
      properties: {
        ...outputProperties,
        ...additionalData.output.properties,
      },
    };
  }

  // Add special handling for group nodes
  if (type === 'group') {
    return {
      id: id || uuidv4(),
      type: 'group',
      position,
      data: {
        title: 'Group',
        ...additionalData
      },
      style: {
        width: 300,
        height: 300,
      }
    };
  }

  const node = {
    id,
    type: nodeType.name,
    position,
    data: {
      title: nodeType.name,
      acronym: nodeType.visual_tag.acronym,
      color: nodeType.visual_tag.color,
      config: cloneDeep(nodeType.config),
      input: {
        properties: inputProperties,
        ...processedAdditionalData.input,
      },
      output: {
        properties: outputProperties,
        ...processedAdditionalData.output,
      },
      ...processedAdditionalData,
    },
  };
  return node;
};
