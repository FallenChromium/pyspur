import { useCallback, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { updateWorkflow } from '../utils/api';
import { debounce } from 'lodash';

export const useSaveWorkflow = (trigger, delay = 2000) => {
  const nodes = useSelector((state) => state.flow.nodes);
  const edges = useSelector((state) => state.flow.edges);
  const workflowID = useSelector((state) => state.flow.workflowID);
  const workflowInputVariables = useSelector((state) => state.flow.workflowInputVariables);
  const workflowName = useSelector((state) => state.flow.projectName);
  const testInputs = useSelector((state) => state.flow.testInputs);

  const saveWorkflow = useCallback(async () => {
    try {
      const updatedNodes = nodes
        .filter((node) => node !== null && node !== undefined)
        .map((node) => {
          if (node.type === 'InputNode') {
            return {
              ...node,
              config: {
                ...node.data.config,
                input_schema: Object.fromEntries(Object.keys(workflowInputVariables).map((key) => [key, 'str'])),
              },
            };
          } else {
            return {
              ...node,
              config: node.data?.config,
              title: node.data?.title,
            };
          }
        });

      const updatedWorkflow = {
        name: workflowName,
        definition: {
          nodes: updatedNodes.map((node) => ({
            id: node.id,
            node_type: node.type,
            config: node.config,
            coordinates: node.position,
          })),
          links: edges.map((edge) => {
            const sourceNode = nodes.find((node) => node.id === edge.source);
            const targetNode = nodes.find((node) => node.id === edge.target);

            return {
              source_id: edge.source,
              source_output_key: edge.sourceHandle,
              source_output_type: sourceNode?.config?.data?.output_schema?.[edge.sourceHandle] || 'str',
              target_id: edge.target,
              target_input_key: edge.targetHandle,
              target_input_type: targetNode?.config?.data?.input_schema?.[edge.targetHandle] || 'str',
            };
          }),
          test_inputs: testInputs,
        },
      };

      console.log('send to b/e workflow:', updatedWorkflow);
      await updateWorkflow(workflowID, updatedWorkflow);
    } catch (error) {
      console.error('Error saving workflow:', error);
    }
  }, [workflowID, nodes, edges, workflowInputVariables, workflowName, testInputs]);

  const debouncedSave = useCallback(
    debounce(() => {
      if (nodes.length > 0 || edges.length > 0) {
        saveWorkflow();
      }
    }, delay),
    [nodes, edges, saveWorkflow, delay],
  );
  useEffect(() => {
    debouncedSave();

    return () => debouncedSave.cancel();
  }, [debouncedSave]);

  return saveWorkflow;
};
