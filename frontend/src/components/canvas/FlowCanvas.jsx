import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { ReactFlow, Background, ReactFlowProvider, useViewport } from '@xyflow/react';
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
  groupNodes,
  clearSelections,
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
import { Button } from "@nextui-org/react";
import { Icon } from "@iconify/react";

const useNodeTypes = ({ nodeTypesConfig }) => {
  const nodeTypes = useMemo(() => {
    if (!nodeTypesConfig) return {};

    const types = {
      group: GroupNode, // Add GroupNode type
    };

    Object.keys(nodeTypesConfig).forEach(category => {
      nodeTypesConfig[category].forEach(node => {
        if (node.name === 'InputNode') {
          types[node.name] = InputNode;
        } else {
          types[node.name] = (props) => {
            return <DynamicNode {...props} type={node.name} />;
          };
        }
      });
    });

    return types;
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
  const selectedNodes = useSelector((state) => state.flow.selectedNodes);

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
      const isMultiSelect = event.ctrlKey || event.metaKey;
      dispatch(setSelectedNode({ nodeId: node.id, isMultiSelect }));
    },
    [dispatch]
  );

  const onPaneClick = useCallback(() => {
    dispatch(clearSelections());
  }, [dispatch]);

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

  const handleGroupNodes = useCallback(() => {
    if (selectedNodes.length < 2) return;

    // Calculate the bounding box of selected nodes
    const selectedNodeObjects = nodes.filter(node => selectedNodes.includes(node.id));
    const positions = selectedNodeObjects.map(node => node.position);

    const minX = Math.min(...positions.map(p => p.x));
    const minY = Math.min(...positions.map(p => p.y));
    const maxX = Math.max(...positions.map(p => p.x));
    const maxY = Math.max(...positions.map(p => p.y));

    // Create group slightly larger than the bounding box
    const padding = 50;
    const groupPosition = {
      x: minX - padding,
      y: minY - padding
    };

    dispatch(groupNodes({
      nodeIds: selectedNodes,
      groupId: 'group-' + uuidv4(),
      position: groupPosition
    }));

    // Clear selections after grouping
    dispatch(clearSelections());
  }, [dispatch, selectedNodes, nodes]);

  // Update the GroupButton component
  const GroupButton = useMemo(() => {
    // Only show button in pointer mode with multiple selections
    if (selectedNodes.length < 2 || mode !== 'pointer') return null;

    return (
      <div
        style={{
          position: 'absolute',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 5,
          backgroundColor: 'white',
          padding: '4px',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}
      >
        <Button
          color="primary"
          variant="flat"
          startContent={<Icon icon="solar:box-linear" />}
          onClick={handleGroupNodes}
          size="sm"
        >
          Group {selectedNodes.length} Nodes
        </Button>
      </div>
    );
  }, [selectedNodes.length, handleGroupNodes, mode]);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      {GroupButton}
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
