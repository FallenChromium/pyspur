import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { ReactFlow, Background, ReactFlowProvider, useViewport, Panel } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useSelector, useDispatch } from 'react-redux';
import Operator from './footer/operator/Operator';
import {
  nodesChange,
  edgesChange,
  connect,
  setHoveredNode,
  setSelectedNode,
  deleteNode,
  setWorkflowInputVariable,
} from '../../store/flowSlice';
// import ConnectionLine from './ConnectionLine';
import NodeSidebar from '../nodes/nodeSidebar/NodeSidebar';
import { Dropdown, DropdownMenu, DropdownSection, DropdownItem } from '@nextui-org/react';
import DynamicNode from '../nodes/DynamicNode';
import { v4 as uuidv4 } from 'uuid';
import { addNodeBetweenNodes } from './AddNodePopoverCanvas';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'; // Import the new hook
import CustomEdge from './edges/CustomEdge';
import { getHelperLines } from '../../utils/helperLines';
import HelperLinesRenderer from '../HelperLines';
import useCopyPaste from '../../utils/useCopyPaste';
import { useModeStore } from '../../store/modeStore';
import { initializeFlow } from '../../store/flowSlice'; // Import the new action
// Import the new API function
import InputNode from '../nodes/InputNode';
import { useSaveWorkflow } from '../../hooks/useSaveWorkflow';
import LoadingSpinner from '../LoadingSpinner'; // Updated import
import GroupNode from '../nodes/GroupNode';
import { useGroupNodes } from '../../hooks/useGroupNodes';
import { Button } from '@nextui-org/react';
import { Icon } from "@iconify/react";

const useNodeTypes = ({ nodeTypesConfig }) => {
  const nodeTypes = useMemo(() => {
    if (!nodeTypesConfig) return {};
    console.log('nodeTypesConfig', nodeTypesConfig);
    return Object.keys(nodeTypesConfig).reduce((acc, category) => {
      nodeTypesConfig[category].forEach(node => {
        if (node.name === 'InputNode') {
          acc[node.name] = InputNode;
        } else {
          acc[node.name] = (props) => {
            return <DynamicNode {...props} type={node.name} />;
          };
        }
      });
      return acc;
    }, {});
  }, [nodeTypesConfig]);

  const isLoading = !nodeTypesConfig;
  return { nodeTypes, isLoading };
};

const edgeTypes = {
  custom: CustomEdge,
};

// Create a wrapper component that includes ReactFlow logic
const FlowCanvasContent = (props) => {
  const { workflowData, workflowID } = props;

  const dispatch = useDispatch();

  const nodeTypesConfig = useSelector((state) => state.nodeTypes.data);

  useEffect(() => {
    if (workflowData) {
      console.log('workflowData', workflowData);
      // if the input node already has a schema add it to the workflowInputVariables
      if (workflowData.definition.nodes) {
        const inputNode = workflowData.definition.nodes.filter(node => node.node_type === 'InputNode');
        if (inputNode.length > 0) {
          const inputSchema = inputNode[0].config.input_schema;
          if (inputSchema) {
            const workflowInputVariables = Object.entries(inputSchema).map(([key, type]) => {
              return { key, value: '' };
            });
            workflowInputVariables.forEach(variable => {
              dispatch(setWorkflowInputVariable(variable));
            });
          }
        }
      }
      dispatch(initializeFlow({ nodeTypes: nodeTypesConfig, ...workflowData, workflowID }));
    }

  }, [dispatch, workflowData, workflowID]);

  const { nodeTypes, isLoading } = useNodeTypes({ nodeTypesConfig });

  const nodes = useSelector((state) => state.flow.nodes);
  const edges = useSelector((state) => state.flow.edges);
  const hoveredNode = useSelector((state) => state.flow.hoveredNode);
  const selectedNodeID = useSelector((state) => state.flow.selectedNode);

  const saveWorkflow = useSaveWorkflow([nodes, edges], 10000); // 10 second delay

  // Manage reactFlowInstance locally
  const [reactFlowInstance, setReactFlowInstance] = useState(null);

  const [helperLines, setHelperLines] = useState({ horizontal: null, vertical: null });

  // Add a flag to control the visibility of helper lines
  const showHelperLines = false; // Set to false for now

  const onNodesChange = useCallback(
    (changes) => {
      if (!changes.some((c) => c.type === 'position')) {
        setHelperLines({ horizontal: null, vertical: null });
        dispatch(nodesChange({ changes }));
        return;
      }

      const positionChange = changes.find(
        (c) => c.type === 'position' && c.position
      );

      if (positionChange && showHelperLines) {
        const { horizontal, vertical } = getHelperLines(positionChange, nodes);
        setHelperLines({ horizontal, vertical });

        if (horizontal || vertical) {
          const snapPosition = { x: positionChange.position.x, y: positionChange.position.y };
          if (horizontal) snapPosition.y = horizontal;
          if (vertical) snapPosition.x = vertical;
          positionChange.position = snapPosition;
        }
      }

      dispatch(nodesChange({ changes }));
    },
    [dispatch, nodes, showHelperLines]
  );

  const onEdgesChange = useCallback(
    (changes) => dispatch(edgesChange({ changes })),
    [dispatch]
  );
  const onConnect = useCallback(
    (connection) => {
      const newEdge = {
        ...connection,
        id: uuidv4(),
        key: uuidv4(),
      };
      dispatch(connect({ connection: newEdge }));
    },
    [dispatch] // Add nodes to the dependency array
  );



  const [hoveredEdge, setHoveredEdge] = useState(null); // Add state for hoveredEdge

  // State to manage the visibility of the PopoverContent and the selected edge
  const [isPopoverContentVisible, setPopoverContentVisible] = useState(false);
  const [selectedEdge, setSelectedEdge] = useState(null);

  const [popoverPosition, setPopoverPosition] = useState({ x: 0, y: 0 });

  const handlePopoverOpen = useCallback(({ sourceNode, targetNode, edgeId }) => {
    // Calculate center position between nodes in flow coordinates
    const centerX = (sourceNode.position.x + targetNode.position.x) / 2;
    const centerY = (sourceNode.position.y + targetNode.position.y) / 2;

    // Convert flow coordinates to screen coordinates
    const screenPos = reactFlowInstance.flowToScreenPosition({
      x: centerX,
      y: centerY,
    });

    setPopoverPosition({
      x: screenPos.x,
      y: screenPos.y
    });
    setSelectedEdge({ sourceNode, targetNode, edgeId });
    setPopoverContentVisible(true);
  }, [reactFlowInstance]);

  const styledEdges = useMemo(() => {
    return edges.map((edge) => ({
      ...edge,
      type: 'custom',
      style: {
        stroke: edge.id === hoveredEdge
          ? 'black'
          : edge.source === hoveredNode || edge.target === hoveredNode
            ? 'black'
            : '#555',
        strokeWidth: edge.id === hoveredEdge
          ? 4
          : edge.source === hoveredNode || edge.target === hoveredNode
            ? 4
            : 2,
      },
      data: {
        ...edge.data,
        showPlusButton: edge.id === hoveredEdge,
        onPopoverOpen: handlePopoverOpen,
      },
      key: edge.id,
    }));
  }, [edges, hoveredNode, hoveredEdge, handlePopoverOpen]);

  const onEdgeMouseEnter = useCallback(
    (event, edge) => {
      setHoveredEdge(edge.id);
    },
    []
  );

  const onEdgeMouseLeave = useCallback(() => {
    setHoveredEdge(null);
  }, []);

  const onNodeMouseEnter = useCallback(
    (event, node) => {
      dispatch(setHoveredNode({ nodeId: node.id }));
    },
    [dispatch]
  );

  const onNodeMouseLeave = useCallback(() => {
    dispatch(setHoveredNode({ nodeId: null }));
  }, [dispatch]);

  const onInit = useCallback((instance) => {
    setReactFlowInstance(instance);
    instance.setViewport({ x: 0, y: 0, zoom: 0.8 }); // Set zoom to 100%
  }, []);

  const onNodeClick = useCallback(
    (event, node) => {
      dispatch(setSelectedNode({ nodeId: node.id }));
    },
    [dispatch]
  );

  const onPaneClick = useCallback(() => {
    if (selectedNodeID) {
      dispatch(setSelectedNode({ nodeId: null }));
    }
  }, [dispatch, selectedNodeID]);

  const onNodesDelete = useCallback(
    (deletedNodes) => {
      deletedNodes.forEach((node) => {
        dispatch(deleteNode({ nodeId: node.id }));

        if (selectedNodeID === node.id) {
          dispatch(setSelectedNode({ nodeId: null }));
        }
      });
    },
    [dispatch, selectedNodeID]
  );

  // Add this new keyboard handler
  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        const selectedNodes = nodes.filter(node => node.selected);
        if (selectedNodes.length > 0) {
          onNodesDelete(selectedNodes);
        }
      }
    },
    [nodes, onNodesDelete]
  );

  // Add effect to handle keyboard events
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  // Use the custom hook for keyboard shortcuts
  useKeyboardShortcuts(selectedNodeID, nodes, dispatch);

  const { cut, copy, paste, bufferedNodes } = useCopyPaste();

  // const canCopy = nodes.some(({ selected }) => selected);
  // const canPaste = bufferedNodes.length > 0;

  // Add this hook - it will handle the keyboard shortcuts automatically
  useCopyPaste();

  // Add proOptions configuration
  const proOptions = {
    hideAttribution: true
  };


  const mode = useModeStore((state) => state.mode);


  // Add this memoized nodes with mode
  const nodesWithMode = useMemo(() => {
    return nodes
      .filter(Boolean) // Filters out null or undefined nodes
      .map(node => ({
        ...node,
        draggable: true,
        selectable: mode === 'pointer',
        position: node?.position,
        type: node?.type,
        data: node?.data,
      }));
  }, [nodes, mode]);

  // Add a local state to track edge updates
  const [edgeUpdateTrigger, setEdgeUpdateTrigger] = useState(0);

  const prevConnectionsRef = useRef('');

  // Only trigger re-render when edge connections change
  useEffect(() => {
    const newConnections = edges.map(edge =>
      `${edge.source}-${edge.sourceHandle}-${edge.target}-${edge.targetHandle}`
    ).join('|');

    const hasChanged = prevConnectionsRef.current !== newConnections;
    if (hasChanged) {
      prevConnectionsRef.current = newConnections;
      setEdgeUpdateTrigger(prev => prev + 1);
    }
  }, [edges]);

  const { onGroup } = useGroupNodes();

  const getGroupButtonPosition = useCallback(() => {
    const selectedNodes = nodes.filter(node => node.selected && !node.parentNode);
    if (selectedNodes.length <= 1) return null;

    // Calculate the bounding box of selected nodes
    const bounds = selectedNodes.reduce(
      (acc, node) => {
        const nodeWidth = node.width || 150;
        const nodeHeight = node.height || 40;

        return {
          minX: Math.min(acc.minX, node.position.x),
          maxX: Math.max(acc.maxX, node.position.x + nodeWidth),
          minY: Math.min(acc.minY, node.position.y),
          maxY: Math.max(acc.maxY, node.position.y + nodeHeight),
        };
      },
      {
        minX: Infinity,
        maxX: -Infinity,
        minY: Infinity,
        maxY: -Infinity,
      }
    );

    // Get viewport from ReactFlow
    const { x: viewportX, y: viewportY, zoom } = reactFlowInstance.getViewport();

    // Apply viewport transform to get the correct screen position
    return {
      x: (bounds.maxX + 20) * zoom + viewportX,
      y: (bounds.minY - 20) * zoom + viewportY,
    };
  }, [nodes, reactFlowInstance]);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      {isPopoverContentVisible && selectedEdge && (
        <div
          style={{
            position: 'absolute',
            left: `${popoverPosition.x}px`,
            top: `${popoverPosition.y}px`,
            transform: 'translate(-50%, -50%)',
            zIndex: 1000,
          }}
        >
          <Dropdown
            isOpen={isPopoverContentVisible}
            onOpenChange={setPopoverContentVisible}
            placement="bottom"
          >
            <DropdownMenu>
              {Object.keys(nodeTypesConfig).map((category) => (
                <DropdownSection key={category} title={category} showDivider>
                  {nodeTypesConfig[category].map((node) => (
                    <DropdownItem
                      key={node.name}
                      onClick={() =>
                        addNodeBetweenNodes(
                          nodeTypesConfig,
                          node.name,
                          selectedEdge.sourceNode,
                          selectedEdge.targetNode,
                          selectedEdge.edgeId,
                          reactFlowInstance,
                          dispatch,
                          setPopoverContentVisible
                        )
                      }
                    >
                      {node.name}
                    </DropdownItem>
                  ))}
                </DropdownSection>
              ))}
            </DropdownMenu>
          </Dropdown>
        </div>
      )}

      <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
        <div
          style={{
            height: `100%`,
            overflow: 'auto',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <ReactFlow
            nodes={nodesWithMode}
            edges={styledEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            onInit={onInit}
            onNodeMouseEnter={onNodeMouseEnter}
            onNodeMouseLeave={onNodeMouseLeave}
            snapToGrid={true}
            snapGrid={[15, 15]}
            onPaneClick={onPaneClick}
            onNodeClick={onNodeClick}
            onEdgeMouseEnter={onEdgeMouseEnter}
            onEdgeMouseLeave={onEdgeMouseLeave}
            onNodesDelete={onNodesDelete}
            proOptions={proOptions}
            panOnDrag={mode === 'hand' && !nodes.filter(Boolean).some(n => n.selected)}
            panOnScroll={true}
            zoomOnScroll={true}
            minZoom={0.1}
            maxZoom={2}
            selectionMode={mode === 'pointer' ? 1 : 0}
            selectNodesOnDrag={mode === 'pointer'}
            selectionOnDrag={mode === 'pointer'}
            selectionKeyCode={mode === 'pointer' ? null : false}
            multiSelectionKeyCode={mode === 'pointer' ? null : false}
            deleteKeyCode="Delete"
            nodesConnectable={true}
            connectionMode="loose"
            key={edgeUpdateTrigger}            >
            <Background />

            {/* Conditionally render HelperLinesRenderer based on the flag */}
            {showHelperLines && (
              <HelperLinesRenderer
                horizontal={helperLines.horizontal}
                vertical={helperLines.vertical}
              />
            )}



            <Operator />
          </ReactFlow>
        </div>
        {selectedNodeID && (
          <div
            className="absolute top-0 right-0 h-full bg-white border-l border-gray-200"
            style={{ zIndex: 2 }}
          >
            <NodeSidebar nodeID={selectedNodeID} />
          </div>
        )}
      </div>
      {mode === 'pointer' && reactFlowInstance && getGroupButtonPosition() && (
        <Panel
          className="absolute"
          style={{
            left: getGroupButtonPosition().x,
            top: getGroupButtonPosition().y,
            transform: 'none',
            background: 'transparent',
            border: 'none',
            pointerEvents: 'all'
          }}
        >
          <Button
            size="sm"
            onClick={onGroup}
            className="bg-white hover:bg-default-100 border-1 shadow-lg"
            startContent={<Icon icon="solar:box-bold" />}
            disabled={nodes.filter(node => node.selected && !node.parentNode).length <= 1}
          >
            Group
          </Button>
        </Panel>
      )}
    </div>
  );
};

// Main component that provides the ReactFlow context
const FlowCanvas = ({ workflowData, workflowID }) => {
  return (
    <ReactFlowProvider>
      <FlowCanvasContent workflowData={workflowData} workflowID={workflowID} />
    </ReactFlowProvider>
  );
};

export default FlowCanvas;
