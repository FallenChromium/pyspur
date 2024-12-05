import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  Input,
  Navbar,
  NavbarBrand,
  NavbarContent,
  NavbarItem,
  Link,
  Button,
  Spinner,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@nextui-org/react";
import { Icon } from "@iconify/react";
import SettingsCard from './modals/SettingsModal';
import { setProjectName, updateNodeData, resetRun } from '../store/flowSlice';
import RunModal from './modals/RunModal';
import { getRunStatus, startRun, getWorkflow } from '../utils/api';
import { Toaster, toast } from 'sonner'
import { getWorkflowRuns } from '../utils/api';
import { useRouter } from 'next/router';
import DeployModal from './modals/DeployModal';
import { formatDistanceStrict } from 'date-fns';
interface HeaderProps {
  activePage: 'home' | 'workflow' | 'evals';
}

interface Node {
  id: string;
  data: {
    run?: Record<string, any>;
  };
}

interface RootState {
  flow: {
    nodes: Node[];
    projectName: string;
    workflowInputVariables: Record<string, any>;
  };
}

interface RunStatusResponse {
  status: 'RUNNING' | 'FAILED' | string;
  outputs?: Record<string, any>;
  id: string;
}

interface WorkflowResponse {
  name: string;
  definition: any;
  description: string;
}

const Header: React.FC<HeaderProps> = ({ activePage }) => {
  const dispatch = useDispatch();
  const nodes = useSelector((state: RootState) => state.flow.nodes);
  const projectName = useSelector((state: RootState) => state.flow.projectName);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isDebugModalOpen, setIsDebugModalOpen] = useState<boolean>(false);
  const [isDeployModalOpen, setIsDeployModalOpen] = useState<boolean>(false);
  const [workflowRuns, setWorkflowRuns] = useState<any[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const workflowId = useSelector((state: RootState) => state.flow.workflowID);

  const router = useRouter();
  const { id } = router.query;
  const isRun = id && id[0] == 'R';

  let currentStatusInterval: NodeJS.Timeout | null = null;

  const fetchWorkflowRuns = async () => {
    try {
      const response = await getWorkflowRuns(workflowId);
      setWorkflowRuns(response);
    }
    catch (error) {
      console.error('Error fetching workflow runs:', error);
    }
  };

  useEffect(() => {
    if (workflowId) {
      fetchWorkflowRuns();
    }
  }, [workflowId]);

  const updateWorkflowStatus = async (runID: string): Promise<void> => {
    let pollCount = 0;
    if (currentStatusInterval) {
      clearInterval(currentStatusInterval);
    }
    currentStatusInterval = setInterval(async () => {
      try {
        const statusResponse: RunStatusResponse = await getRunStatus(runID);
        const outputs = statusResponse.outputs;

        if (statusResponse.status === 'FAILED') {
          setIsRunning(false);
          clearInterval(currentStatusInterval);
          toast.error('Workflow run failed.');
          return;
        }

        if (outputs) {
          Object.entries(outputs).forEach(([nodeId, output_values]) => {
            const node = nodes.find((node) => node.id === nodeId);
            if (output_values && node) {
              dispatch(updateNodeData({ id: nodeId, data: { run: { ...node.data.run, ...output_values } } }));
            }
          });
        }

        if (statusResponse.status !== 'RUNNING') {
          setIsRunning(false);
          clearInterval(currentStatusInterval);
          toast.success('Workflow run completed.');
        }

        pollCount += 1;
      } catch (error) {
        console.error('Error fetching workflow status:', error);
        clearInterval(currentStatusInterval);
      }
    }, 1000);
  };

  const workflowID = typeof window !== 'undefined' ? window.location.pathname.split('/').pop() : null;

  const executeWorkflow = async (inputValues: Record<string, any>): Promise<void> => {
    if (!workflowID) return;

    try {
      toast('Starting workflow run...');
      const result = await startRun(workflowId, inputValues, null, 'interactive');
      console.log('Workflow run started:', result);
      setIsRunning(true);
      fetchWorkflowRuns();
      dispatch(resetRun());
      updateWorkflowStatus(result.id);
    } catch (error) {
      console.error('Error starting workflow run:', error);
      toast.error('Error starting workflow run.');
    }
  };

  const handleRunWorkflow = async (): Promise<void> => {
    setIsDebugModalOpen(true);
  };

  const handleStopWorkflow = (): void => {
    setIsRunning(false);
    if (currentStatusInterval) {
      clearInterval(currentStatusInterval);
    }
    toast('Workflow run stopped.');
  };

  const handleProjectNameChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    dispatch(setProjectName(e.target.value));
  };

  const handleDownloadWorkflow = async (): Promise<void> => {
    if (!workflowID) return;

    try {
      const workflow: WorkflowResponse = await getWorkflow(workflowID);

      const workflowDetails = {
        name: workflow.name,
        definition: workflow.definition,
        description: workflow.description
      };

      const blob = new Blob([JSON.stringify(workflowDetails, null, 2)], {
        type: 'application/json'
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectName.replace(/\s+/g, '_')}.json`;

      document.body.appendChild(a);
      a.click();

      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading workflow:', error);
    }
  };

  const handleDeploy = (): void => {
    setIsDeployModalOpen(true);
  };

  const getApiEndpoint = (): string => {
    if (typeof window === 'undefined') {
      return '';
    }
    const baseUrl = window.location.origin;
    return `${baseUrl}/api/wf/${workflowId}/start_run/?run_type=non_blocking`;
  };

  const workflowInputVariables = useSelector((state: RootState) => state.flow.workflowInputVariables);

  return (
    <>
      <Toaster richColors position="bottom-right" />
      <Navbar
        classNames={{
          base: "lg:bg-background lg:backdrop-filter-none h-12 mt-1 shadow-sm",
          wrapper: "px-4 sm:px-6",
          item: [
            "flex",
            "relative",
            "h-full",
            "items-center",
            "data-[active=true]:after:content-['']",
            "data-[active=true]:after:absolute",
            "data-[active=true]:after:bottom-0",
            "data-[active=true]:after:left-0",
            "data-[active=true]:after:right-0",
            "data-[active=true]:after:h-[2px]",
            "data-[active=true]:after:rounded-[2px]",
            "data-[active=true]:after:bg-primary",
            "data-[active=true]:text-primary",
          ],
        }}
      >
        <NavbarBrand
          justify="start"
          className="h-12 max-w-fit"
        >
          {activePage === "home" ? (
            <p className="font-bold text-inherit cursor-pointer">PySpur</p>
          ) : (
            <Link href="/" className="cursor-pointer">
              <p className="font-bold text-inherit">PySpur</p>
            </Link>
          )}
        </NavbarBrand>

        {activePage === "workflow" && (
          <NavbarContent
            className="h-12 rounded-full bg-content2 dark:bg-content1 sm:flex"
            id="workflow-title"
            justify="start"
          >
            <Input
              className="px-4"
              type="text"
              placeholder="Project Name"
              value={projectName}
              onChange={handleProjectNameChange}
            />
          </NavbarContent>
        )}
        <NavbarContent
          className="h-12 gap-4 rounded-full bg-content2 px-4 dark:bg-content1 max-w-fit"
          justify="end"
          id="home-editor-nav"
        >
          <NavbarItem isActive={activePage === "home"}>
            <Link className="flex gap-2 text-inherit" href="/">
              Home
            </Link>
          </NavbarItem>
          {activePage === "workflow" && (
            <NavbarItem isActive={activePage === "workflow"}>
              Editor
            </NavbarItem>
          )}
          <NavbarItem isActive={activePage === "evals"}>
            <Link className="flex gap-2 text-inherit" href="/evals">
              Evals
            </Link>
          </NavbarItem>
        </NavbarContent>
        {activePage === "workflow" && (
          <NavbarContent
            className="ml-auto flex h-12 max-w-fit items-center gap-0 rounded-full p-0 lg:bg-content2 lg:px-1 lg:dark:bg-content1"
            justify="end"
            id="workflow-actions-buttons"
          >
            {!isRun && (
              <>
                {isRunning ? (
                  <>
                    <NavbarItem className="hidden sm:flex">
                      <Spinner size="sm" />
                    </NavbarItem>
                    <NavbarItem className="hidden sm:flex">
                      <Button isIconOnly radius="full" variant="light" onClick={handleStopWorkflow}>
                        <Icon className="text-default-500" icon="solar:stop-linear" width={22} />
                      </Button>
                    </NavbarItem>
                  </>
                ) : (
                  <NavbarItem className="hidden sm:flex">
                    <Button isIconOnly radius="full" variant="light" onClick={handleRunWorkflow}>
                      <Icon className="text-default-500" icon="solar:play-linear" width={22} />
                    </Button>
                  </NavbarItem>
                )}
              </>
            )}
            <NavbarItem className="hidden sm:flex">
              <Dropdown isOpen={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
                <DropdownTrigger>
                  <Button isIconOnly radius="full" variant="light">
                    <Icon className="text-default-500" icon="solar:history-linear" width={22} />
                  </Button>
                </DropdownTrigger>
                <DropdownMenu>
                  {workflowRuns.map((run, index) => (
                    <DropdownItem
                      key={index}
                      onClick={() => window.open(`/trace/${run.id}`, '_blank')}
                      textValue={`Version ${index + 1}`}
                    >
                      {`${run.id} | ${run.status.toLowerCase()} ${(run.status.toLowerCase() === 'running' || run.status.toLowerCase() === 'pending') && run.start_time
                        ? `for last ${formatDistanceStrict(Date.parse(run.start_time + 'Z'), new Date(), { addSuffix: false })}`
                        : (run.status.toLowerCase() === 'failed' || run.status.toLowerCase() === 'completed') && run.end_time
                          ? `${formatDistanceStrict(Date.parse(run.end_time + 'Z'), new Date(), { addSuffix: true })}`
                          : ''
                        }`}
                    </DropdownItem>
                  ))}
                </DropdownMenu>
              </Dropdown>
            </NavbarItem>
            <NavbarItem className="hidden sm:flex">
              <Button
                isIconOnly
                radius="full"
                variant="light"
                onClick={handleDownloadWorkflow}
              >
                <Icon
                  className="text-default-500"
                  icon="solar:download-linear"
                  width={24}
                />
              </Button>
            </NavbarItem>
            <NavbarItem className="hidden sm:flex">
              <Button
                isIconOnly
                radius="full"
                variant="light"
                onClick={handleDeploy}
              >
                <Icon
                  className="text-default-500"
                  icon="solar:cloud-upload-linear"
                  width={24}
                />
              </Button>
            </NavbarItem>
            <NavbarItem className="hidden sm:flex">
              <SettingsCard />
            </NavbarItem>
          </NavbarContent>
        )}
      </Navbar>
      <RunModal
        isOpen={isDebugModalOpen}
        onOpenChange={setIsDebugModalOpen}
        onRun={async (selectedInputs) => {
          await executeWorkflow(selectedInputs);
          setIsDebugModalOpen(false);
        }}
      />
      <DeployModal
        isOpen={isDeployModalOpen}
        onOpenChange={setIsDeployModalOpen}
        getApiEndpoint={getApiEndpoint}
      />
    </>
  );
};

export default Header;