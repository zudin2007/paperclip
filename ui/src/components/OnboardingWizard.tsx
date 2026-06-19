import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdapterEnvironmentTestResult } from "@paperclipai/shared";
import { useLocation, useNavigate, useParams } from "@/lib/router";
import { useDialog } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { companiesApi } from "../api/companies";
import { goalsApi } from "../api/goals";
import { agentsApi } from "../api/agents";
import { approvalsApi } from "../api/approvals";
import { issuesApi } from "../api/issues";
import { projectsApi } from "../api/projects";
import { queryKeys } from "../lib/queryKeys";
import { Dialog, DialogPortal } from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "../lib/utils";
import {
  extractModelName,
  extractProviderIdWithFallback
} from "../lib/model-utils";
import { getUIAdapter } from "../adapters";
import { listUIAdapters } from "../adapters";
import { isVisualAdapterChoice } from "../adapters/metadata";
import { useDisabledAdaptersSync } from "../adapters/use-disabled-adapters";
import { useAdapterCapabilities } from "../adapters/use-adapter-capabilities";
import { getAdapterDisplay } from "../adapters/adapter-display-registry";
import { defaultCreateValues } from "./agent-config-defaults";
import { parseOnboardingGoalInput } from "../lib/onboarding-goal";
import {
  buildOnboardingIssuePayload,
  buildOnboardingProjectPayload,
  selectDefaultCompanyGoalId
} from "../lib/onboarding-launch";
import { buildNewAgentRuntimeConfig } from "../lib/new-agent-runtime-config";
import {
  DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX,
  DEFAULT_CODEX_LOCAL_MODEL
} from "@paperclipai/adapter-codex-local";
import { DEFAULT_CURSOR_LOCAL_MODEL } from "@paperclipai/adapter-cursor-local";
import { DEFAULT_GEMINI_LOCAL_MODEL } from "@paperclipai/adapter-gemini-local";
import { DEFAULT_OPENCODE_LOCAL_MODEL, isValidOpenCodeModelId } from "@paperclipai/adapter-opencode-local";
import { resolveRouteOnboardingOptions } from "../lib/onboarding-route";
import { AsciiArtAnimation } from "./AsciiArtAnimation";
import {
  Building2,
  Bot,
  ListTodo,
  Rocket,
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  ChevronDown,
  X,
  HelpCircle
} from "lucide-react";


type Step = 1 | 2 | 3 | 4;
type AdapterType = string;
type OnboardingTemplate = "startup" | "research" | "custom";

const DEFAULT_TASK_DESCRIPTION = `You are the CEO. You set the direction for the company.

- hire a founding engineer
- write a hiring plan
- break the roadmap into concrete tasks and start delegating work`;

// Adapter descriptions for tooltips
const ADAPTER_DESCRIPTIONS: Record<string, string> = {
  claude_local: "Run Claude locally via the Claude Code CLI. Best for development and testing.",
  codex_local: "Run Anthropic Codex locally. Specialized for code generation.",
  gemini_local: "Run Google Gemini locally. Good for multimodal tasks.",
  cursor: "Integrate with Cursor IDE for editor-based development.",
  opencode_local: "Run OpenCode locally. Open-source AI model for coding.",
  http: "Webhook endpoint for custom integrations and HTTP-based agents.",
  openclaw_gateway: "Connect to OpenClaw gateway for remote agent execution.",
  process: "Run shell commands and scripts directly (system integration).",
};

// Onboarding templates for quick start
const ONBOARDING_TEMPLATES: Record<OnboardingTemplate, { name: string; company: string; goal: string; task: string }> = {
  startup: {
    name: "Startup",
    company: "TechStart Inc",
    goal: "Build an MVP for a SaaS product and acquire first 100 users",
    task: "Conduct market research and create a product roadmap",
  },
  research: {
    name: "Research Team",
    company: "Research Labs",
    goal: "Accelerate scientific research through AI-assisted analysis",
    task: "Analyze latest papers in your research area and create a summary",
  },
  custom: {
    name: "Custom",
    company: "",
    goal: "",
    task: "",
  },
};

export function OnboardingWizard() {
  const { onboardingOpen, onboardingOptions, closeOnboarding } = useDialog();
  const { companies, setSelectedCompanyId, loading: companiesLoading } = useCompany();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { companyPrefix } = useParams<{ companyPrefix?: string }>();
  const [routeDismissed, setRouteDismissed] = useState(false);

  // Sync disabled adapter types from server so adapter grid filters them out
  const disabledTypes = useDisabledAdaptersSync();

  const routeOnboardingOptions =
    companyPrefix && companiesLoading
      ? null
      : resolveRouteOnboardingOptions({
          pathname: location.pathname,
          companyPrefix,
          companies,
        });
  const effectiveOnboardingOpen =
    onboardingOpen || (routeOnboardingOptions !== null && !routeDismissed);
  const effectiveOnboardingOptions = onboardingOpen
    ? onboardingOptions
    : routeOnboardingOptions ?? {};

  const initialStep = effectiveOnboardingOptions.initialStep ?? 1;
  const existingCompanyId = effectiveOnboardingOptions.companyId;

  const [step, setStep] = useState<Step>(initialStep);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelOpen, setModelOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [skipOptionalFields, setSkipOptionalFields] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<OnboardingTemplate>("custom");

  // Step 1
  const [companyName, setCompanyName] = useState("");
  const [companyGoal, setCompanyGoal] = useState("");

  // Step 2
  const [agentName, setAgentName] = useState("CEO");
  const [adapterType, setAdapterType] = useState<AdapterType>("claude_local");
  const [model, setModel] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [url, setUrl] = useState("");
  const [adapterEnvResult, setAdapterEnvResult] =
    useState<AdapterEnvironmentTestResult | null>(null);
  const [adapterEnvError, setAdapterEnvError] = useState<string | null>(null);
  const [adapterEnvLoading, setAdapterEnvLoading] = useState(false);
  const [forceUnsetAnthropicApiKey, setForceUnsetAnthropicApiKey] =
    useState(false);
  const [unsetAnthropicLoading, setUnsetAnthropicLoading] = useState(false);
  const [showMoreAdapters, setShowMoreAdapters] = useState(false);

  // Step 3
  const [taskTitle, setTaskTitle] = useState(
    "Hire your first engineer and create a hiring plan"
  );
  const [taskDescription, setTaskDescription] = useState(
    DEFAULT_TASK_DESCRIPTION
  );

  // Auto-grow textarea for task description
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoResizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, []);

  // Created entity IDs — pre-populate from existing company when skipping step 1
  const [createdCompanyId, setCreatedCompanyId] = useState<string | null>(
    existingCompanyId ?? null
  );
  const [createdCompanyPrefix, setCreatedCompanyPrefix] = useState<
    string | null
  >(null);
  const [createdCompanyGoalId, setCreatedCompanyGoalId] = useState<string | null>(
    null
  );
  const [createdAgentId, setCreatedAgentId] = useState<string | null>(null);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [createdIssueRef, setCreatedIssueRef] = useState<string | null>(null);

  const STORAGE_KEY = "onboarding_form_state";

  // Load form state from localStorage on mount
  useEffect(() => {
    if (!effectiveOnboardingOpen) return;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const state = JSON.parse(saved);
        setCompanyName(state.companyName || "");
        setCompanyGoal(state.companyGoal || "");
        setAgentName(state.agentName || "CEO");
        setAdapterType(state.adapterType || "claude_local");
        setModel(state.model || "");
        setCommand(state.command || "");
        setArgs(state.args || "");
        setUrl(state.url || "");
        setTaskTitle(state.taskTitle || "Hire your first engineer and create a hiring plan");
        setTaskDescription(state.taskDescription || DEFAULT_TASK_DESCRIPTION);
      }
    } catch (err) {
      // Silently ignore parse errors
    }
  }, [effectiveOnboardingOpen]);

  // Auto-save form state to localStorage whenever it changes
  useEffect(() => {
    if (!effectiveOnboardingOpen) return;
    const state = {
      companyName,
      companyGoal,
      agentName,
      adapterType,
      model,
      command,
      args,
      url,
      taskTitle,
      taskDescription,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      // Silently ignore storage errors
    }
  }, [effectiveOnboardingOpen, companyName, companyGoal, agentName, adapterType, model, command, args, url, taskTitle, taskDescription]);

  // Clear saved state after successful launch
  const clearSavedState = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      // Silently ignore
    }
  }, []);

  useEffect(() => {
    setRouteDismissed(false);
  }, [location.pathname]);

  // Sync step and company when onboarding opens with options.
  // Keep this independent from company-list refreshes so Step 1 completion
  // doesn't get reset after creating a company.
  useEffect(() => {
    if (!effectiveOnboardingOpen) return;
    const cId = effectiveOnboardingOptions.companyId ?? null;
    setStep(effectiveOnboardingOptions.initialStep ?? 1);
    setCreatedCompanyId(cId);
    setCreatedCompanyPrefix(null);
    setCreatedCompanyGoalId(null);
    setCreatedProjectId(null);
    setCreatedAgentId(null);
    setCreatedIssueRef(null);
  }, [
    effectiveOnboardingOpen,
    effectiveOnboardingOptions.companyId,
    effectiveOnboardingOptions.initialStep
  ]);

  // Backfill issue prefix for an existing company once companies are loaded.
  useEffect(() => {
    if (!effectiveOnboardingOpen || !createdCompanyId || createdCompanyPrefix) return;
    const company = companies.find((c) => c.id === createdCompanyId);
    if (company) setCreatedCompanyPrefix(company.issuePrefix);
  }, [effectiveOnboardingOpen, createdCompanyId, createdCompanyPrefix, companies]);

  // Resize textarea when step 3 is shown or description changes
  useEffect(() => {
    if (step === 3) autoResizeTextarea();
  }, [step, taskDescription, autoResizeTextarea]);

  const { data: adapterModels } = useQuery({
    // The wizard doesn't expose an environment selector, so models always
    // resolve against the local Paperclip host (environmentId = null).
    queryKey: createdCompanyId
      ? queryKeys.agents.adapterModels(createdCompanyId, adapterType, null)
      : ["agents", "none", "adapter-models", adapterType, null],
    queryFn: () => agentsApi.adapterModels(createdCompanyId!, adapterType, { environmentId: null }),
    enabled: Boolean(createdCompanyId) && effectiveOnboardingOpen && step === 2
  });
  const getCapabilities = useAdapterCapabilities();
  const adapterCaps = getCapabilities(adapterType);
  const isLocalAdapter = adapterCaps.supportsInstructionsBundle || adapterCaps.supportsSkills || adapterCaps.supportsLocalAgentJwt;

  // Build adapter grids dynamically from the UI registry + display metadata.
  // External/plugin adapters automatically appear with generic defaults.
  const { recommendedAdapters, moreAdapters } = useMemo(() => {
    const SYSTEM_ADAPTER_TYPES = new Set(["process", "http"]);
    const all = listUIAdapters()
      .filter((a) =>
        !SYSTEM_ADAPTER_TYPES.has(a.type) &&
        !disabledTypes.has(a.type) &&
        isVisualAdapterChoice(a.type)
      )
      .map((a) => ({ ...getAdapterDisplay(a.type), type: a.type }));

    return {
      recommendedAdapters: all.filter((a) => a.recommended),
      moreAdapters: all.filter((a) => !a.recommended),
    };
  }, [disabledTypes]);
  const COMMAND_PLACEHOLDERS: Record<string, string> = {
    claude_local: "claude",
    codex_local: "codex",
    gemini_local: "gemini",
    pi_local: "pi",
    cursor: "agent",
    opencode_local: "opencode",
  };
  const effectiveAdapterCommand =
    command.trim() ||
    (COMMAND_PLACEHOLDERS[adapterType] ?? adapterType.replace(/_local$/, ""));

  useEffect(() => {
    if (step !== 2) return;
    setAdapterEnvResult(null);
    setAdapterEnvError(null);
  }, [step, adapterType, model, command, args, url]);

  const selectedModel = (adapterModels ?? []).find((m) => m.id === model);
  const hasAnthropicApiKeyOverrideCheck =
    adapterEnvResult?.checks.some(
      (check) =>
        check.code === "claude_anthropic_api_key_overrides_subscription"
    ) ?? false;
  const shouldSuggestUnsetAnthropicApiKey =
    adapterType === "claude_local" &&
    adapterEnvResult?.status === "fail" &&
    hasAnthropicApiKeyOverrideCheck;
  const filteredModels = useMemo(() => {
    const query = modelSearch.trim().toLowerCase();
    return (adapterModels ?? []).filter((entry) => {
      if (!query) return true;
      const provider = extractProviderIdWithFallback(entry.id, "");
      return (
        entry.id.toLowerCase().includes(query) ||
        entry.label.toLowerCase().includes(query) ||
        provider.toLowerCase().includes(query)
      );
    });
  }, [adapterModels, modelSearch]);
  const groupedModels = useMemo(() => {
    if (adapterType !== "opencode_local") {
      return [
        {
          provider: "models",
          entries: [...filteredModels].sort((a, b) => a.id.localeCompare(b.id))
        }
      ];
    }
    const groups = new Map<string, Array<{ id: string; label: string }>>();
    for (const entry of filteredModels) {
      const provider = extractProviderIdWithFallback(entry.id);
      const bucket = groups.get(provider) ?? [];
      bucket.push(entry);
      groups.set(provider, bucket);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([provider, entries]) => ({
        provider,
        entries: [...entries].sort((a, b) => a.id.localeCompare(b.id))
      }));
  }, [filteredModels, adapterType]);

  function applyTemplate(template: OnboardingTemplate) {
    const templateData = ONBOARDING_TEMPLATES[template];
    setSelectedTemplate(template);
    setCompanyName(templateData.company);
    setCompanyGoal(templateData.goal);
    setTaskTitle(templateData.task);
    if (template !== "custom") {
      setTaskDescription(DEFAULT_TASK_DESCRIPTION);
    }
  }

  function reset() {
    setStep(1);
    setLoading(false);
    setError(null);
    setCompanyName("");
    setCompanyGoal("");
    setAgentName("CEO");
    setAdapterType("claude_local");
    setModel("");
    setCommand("");
    setArgs("");
    setUrl("");
    setAdapterEnvResult(null);
    setAdapterEnvError(null);
    setAdapterEnvLoading(false);
    setForceUnsetAnthropicApiKey(false);
    setUnsetAnthropicLoading(false);
    setTaskTitle("Hire your first engineer and create a hiring plan");
    setTaskDescription(DEFAULT_TASK_DESCRIPTION);
    setCreatedCompanyId(null);
    setCreatedCompanyPrefix(null);
    setCreatedCompanyGoalId(null);
    setCreatedAgentId(null);
    setCreatedProjectId(null);
    setCreatedIssueRef(null);
    setSkipOptionalFields(false);
    setSelectedTemplate("custom");
  }

  function handleClose() {
    reset();
    closeOnboarding();
  }

  function buildAdapterConfig(): Record<string, unknown> {
    const adapter = getUIAdapter(adapterType);
    const config = adapter.buildAdapterConfig({
      ...defaultCreateValues,
      adapterType,
      model:
        adapterType === "codex_local"
          ? model || DEFAULT_CODEX_LOCAL_MODEL
          : adapterType === "gemini_local"
            ? model || DEFAULT_GEMINI_LOCAL_MODEL
          : adapterType === "cursor"
            ? model || DEFAULT_CURSOR_LOCAL_MODEL
            : adapterType === "opencode_local"
              ? model || DEFAULT_OPENCODE_LOCAL_MODEL
              : model,
      command,
      args,
      url,
      dangerouslySkipPermissions:
        adapterType === "claude_local" || adapterType === "opencode_local",
      dangerouslyBypassSandbox:
        adapterType === "codex_local"
          ? DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX
          : defaultCreateValues.dangerouslyBypassSandbox
    });
    if (adapterType === "claude_local" && forceUnsetAnthropicApiKey) {
      const env =
        typeof config.env === "object" &&
        config.env !== null &&
        !Array.isArray(config.env)
          ? { ...(config.env as Record<string, unknown>) }
          : {};
      env.ANTHROPIC_API_KEY = { type: "plain", value: "" };
      config.env = env;
    }
    return config;
  }

  async function runAdapterEnvironmentTest(
    adapterConfigOverride?: Record<string, unknown>
  ): Promise<AdapterEnvironmentTestResult | null> {
    if (!createdCompanyId) {
      setAdapterEnvError(
        "Create or select a company before testing adapter environment."
      );
      return null;
    }
    setAdapterEnvLoading(true);
    setAdapterEnvError(null);
    try {
      const result = await agentsApi.testEnvironment(
        createdCompanyId,
        adapterType,
        {
          adapterConfig: adapterConfigOverride ?? buildAdapterConfig()
        }
      );
      setAdapterEnvResult(result);
      return result;
    } catch (err) {
      setAdapterEnvError(
        err instanceof Error ? err.message : "Adapter environment test failed"
      );
      return null;
    } finally {
      setAdapterEnvLoading(false);
    }
  }

  async function handleStep1Next() {
    setLoading(true);
    setError(null);
    try {
      const company = await companiesApi.create({ name: companyName.trim() });
      setCreatedCompanyId(company.id);
      setCreatedCompanyPrefix(company.issuePrefix);
      setSelectedCompanyId(company.id);
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });

      if (companyGoal.trim()) {
        const parsedGoal = parseOnboardingGoalInput(companyGoal);
        const goal = await goalsApi.create(company.id, {
          title: parsedGoal.title,
          ...(parsedGoal.description
            ? { description: parsedGoal.description }
            : {}),
          level: "company",
          status: "active"
        });
        setCreatedCompanyGoalId(goal.id);
        queryClient.invalidateQueries({
          queryKey: queryKeys.goals.list(company.id)
        });
      } else {
        setCreatedCompanyGoalId(null);
      }

      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create company");
    } finally {
      setLoading(false);
    }
  }

  async function handleStep2Next() {
    if (!createdCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      if (adapterType === "opencode_local") {
        if (!isValidOpenCodeModelId(model)) {
          setError(
            "OpenCode requires an explicit model in provider/model format."
          );
          return;
        }
      }

      if (isLocalAdapter) {
        const result = adapterEnvResult ?? (await runAdapterEnvironmentTest());
        if (!result) return;
      }

      const hire = await agentsApi.hire(createdCompanyId, {
        name: agentName.trim(),
        role: "ceo",
        adapterType,
        adapterConfig: buildAdapterConfig(),
        runtimeConfig: buildNewAgentRuntimeConfig()
      });
      if (hire.approval) {
        await approvalsApi.approve(
          hire.approval.id,
          "Approved during onboarding first-agent setup."
        );
        queryClient.invalidateQueries({
          queryKey: queryKeys.approvals.list(createdCompanyId)
        });
      }
      const agent = hire.agent;
      setCreatedAgentId(agent.id);
      queryClient.invalidateQueries({
        queryKey: queryKeys.agents.list(createdCompanyId)
      });
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create agent");
    } finally {
      setLoading(false);
    }
  }

  async function handleUnsetAnthropicApiKey() {
    if (!createdCompanyId || unsetAnthropicLoading) return;
    setUnsetAnthropicLoading(true);
    setError(null);
    setAdapterEnvError(null);
    setForceUnsetAnthropicApiKey(true);

    const configWithUnset = (() => {
      const config = buildAdapterConfig();
      const env =
        typeof config.env === "object" &&
        config.env !== null &&
        !Array.isArray(config.env)
          ? { ...(config.env as Record<string, unknown>) }
          : {};
      env.ANTHROPIC_API_KEY = { type: "plain", value: "" };
      config.env = env;
      return config;
    })();

    try {
      if (createdAgentId) {
        await agentsApi.update(
          createdAgentId,
          { adapterConfig: configWithUnset },
          createdCompanyId
        );
        queryClient.invalidateQueries({
          queryKey: queryKeys.agents.list(createdCompanyId)
        });
      }

      const result = await runAdapterEnvironmentTest(configWithUnset);
      if (result?.status === "fail") {
        setError(
          "Retried with ANTHROPIC_API_KEY unset in adapter config, but the environment test is still failing."
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to unset ANTHROPIC_API_KEY and retry."
      );
    } finally {
      setUnsetAnthropicLoading(false);
    }
  }

  async function handleStep3Next() {
    if (!createdCompanyId || !createdAgentId) return;
    setError(null);
    setStep(4);
  }

  async function handleLaunch() {
    if (!createdCompanyId || !createdAgentId) return;
    setLoading(true);
    setError(null);
    try {
      let goalId = createdCompanyGoalId;
      if (!goalId) {
        const goals = await goalsApi.list(createdCompanyId);
        goalId = selectDefaultCompanyGoalId(goals);
        setCreatedCompanyGoalId(goalId);
      }

      let projectId = createdProjectId;
      if (!projectId) {
        const project = await projectsApi.create(
          createdCompanyId,
          buildOnboardingProjectPayload(goalId)
        );
        projectId = project.id;
        setCreatedProjectId(projectId);
        queryClient.invalidateQueries({
          queryKey: queryKeys.projects.list(createdCompanyId)
        });
      }

      let issueRef = createdIssueRef;
      if (!issueRef) {
        const issue = await issuesApi.create(
          createdCompanyId,
          buildOnboardingIssuePayload({
            title: taskTitle,
            description: taskDescription,
            assigneeAgentId: createdAgentId,
            projectId,
            goalId
          })
        );
        issueRef = issue.identifier ?? issue.id;
        setCreatedIssueRef(issueRef);
        queryClient.invalidateQueries({
          queryKey: queryKeys.issues.list(createdCompanyId)
        });
      }

      setSelectedCompanyId(createdCompanyId);
      clearSavedState();
      reset();
      closeOnboarding();
      navigate(
        createdCompanyPrefix
          ? `/${createdCompanyPrefix}/issues/${issueRef}`
          : `/issues/${issueRef}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    // Navigate between steps with arrow keys
    if ((e.key === "ArrowRight" || e.key === "ArrowDown") && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      if (step < 4) setStep((step + 1) as Step);
    } else if ((e.key === "ArrowLeft" || e.key === "ArrowUp") && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      if (step > 1 && step > (onboardingOptions.initialStep ?? 1)) {
        setStep((step - 1) as Step);
      }
    }
    // Submit form with Enter or Cmd/Ctrl+Enter
    else if (e.key === "Enter" && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
      // Only handle if not in a textarea
      if ((e.target as HTMLElement).tagName !== "TEXTAREA" || e.metaKey || e.ctrlKey) {
        e.preventDefault();
        if (step === 1 && companyName.trim()) handleStep1Next();
        else if (step === 2 && agentName.trim()) handleStep2Next();
        else if (step === 3 && taskTitle.trim()) handleStep3Next();
        else if (step === 4) handleLaunch();
      }
    }
    // Close dialog with Escape
    else if (e.key === "Escape") {
      e.preventDefault();
      handleClose();
    }
  }

  if (!effectiveOnboardingOpen) return null;

  return (
    <Dialog
      open={effectiveOnboardingOpen}
      onOpenChange={(open) => {
        if (!open) {
          setRouteDismissed(true);
          handleClose();
        }
      }}
      data-testid="onboarding-wizard"
    >
      <DialogPortal>
        {/* Plain div instead of DialogOverlay — Radix's overlay wraps in
            RemoveScroll which blocks wheel events on our custom (non-DialogContent)
            scroll container. A plain div preserves the background without scroll-locking. */}
        <div className="fixed inset-0 z-50 bg-background" />
        <div className="fixed inset-0 z-50 flex" onKeyDown={handleKeyDown}>
          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute top-4 left-4 z-10 rounded-sm p-1.5 text-muted-foreground/60 hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            aria-label="Close onboarding wizard (press Escape)"
            title="Close (Esc)"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>

          {/* Left half — form */}
          <div
            className={cn(
              "w-full flex flex-col overflow-y-auto transition-[width] duration-500 ease-in-out",
              step === 1 ? "md:w-1/2" : "md:w-full"
            )}
          >
            <div className="w-full max-w-md mx-auto my-auto px-4 py-8 sm:px-6 sm:py-10 md:px-8 md:py-12 shrink-0">
              {/* Progress bar */}
              <div className="mb-5 sm:mb-6">
                <div
                  className="h-1.5 bg-border rounded-full overflow-hidden"
                  role="progressbar"
                  aria-valuenow={step}
                  aria-valuemin={1}
                  aria-valuemax={4}
                  aria-label={`Onboarding progress: Step ${step} of 4`}
                >
                  <div
                    className="h-full bg-foreground transition-all duration-500 ease-out"
                    style={{ width: `${(step / 4) * 100}%` }}
                  />
                </div>
              </div>

              {/* Progress tabs */}
              <div className="flex items-center gap-0 mb-6 sm:mb-8 border-b border-border overflow-x-auto" role="tablist" aria-label="Onboarding steps">
                {(
                  [
                    { step: 1 as Step, label: "Company", icon: Building2 },
                    { step: 2 as Step, label: "Agent", icon: Bot },
                    { step: 3 as Step, label: "Task", icon: ListTodo },
                    { step: 4 as Step, label: "Launch", icon: Rocket }
                  ] as const
                ).map(({ step: s, label, icon: Icon }) => {
                  const isCompleted = s < step || (s === 1 && createdCompanyId) || (s === 2 && createdAgentId) || (s === 3 && taskTitle.trim());
                  const isCurrent = s === step;
                  const completedLabel = isCompleted && !isCurrent ? `${label} (completed)` : label;
                  return (
                    <button
                      key={s}
                      type="button"
                      role="tab"
                      aria-selected={isCurrent}
                      aria-label={completedLabel}
                      aria-controls={`step-${s}`}
                      onClick={() => setStep(s)}
                      title={`${completedLabel}. Use arrow keys to navigate.`}
                      className={cn(
                        "flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 text-[10px] sm:text-xs font-medium border-b-2 -mb-px transition-colors cursor-pointer relative shrink-0 whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                        isCurrent
                          ? "border-foreground text-foreground"
                          : isCompleted
                            ? "border-transparent text-foreground hover:border-border"
                            : "border-transparent text-muted-foreground hover:text-foreground/70 hover:border-border"
                      )}
                    >
                      {isCompleted && !isCurrent ? (
                        <Check className="h-3 sm:h-3.5 w-3 sm:w-3.5 text-green-500 shrink-0" aria-hidden="true" />
                      ) : (
                        <Icon className="h-3 sm:h-3.5 w-3 sm:w-3.5 shrink-0" aria-hidden="true" />
                      )}
                      <span className="hidden sm:inline">{label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Step content */}
              {step === 1 && (
                <section id="step-1" className="space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3 mb-1">
                    <div className="flex items-center gap-3">
                      <div className="bg-muted/50 p-2 rounded shrink-0">
                        <Building2 className="h-4 sm:h-5 w-4 sm:w-5 text-muted-foreground" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="font-medium text-sm sm:text-base">Name your company</h2>
                        <p className="text-xs text-muted-foreground">
                          This is the organization your agents will work for.
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-medium text-muted-foreground bg-muted/50 px-2 py-1 rounded shrink-0 sm:mt-0.5" aria-live="polite">
                      Step 1/4
                    </span>
                  </div>

                  {/* Template selection */}
                  <div className="rounded-md border border-border/50 bg-muted/20 p-3">
                    <label className="text-xs font-medium block mb-2">Quick templates</label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      {Object.entries(ONBOARDING_TEMPLATES).map(([key, template]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => applyTemplate(key as OnboardingTemplate)}
                          className={cn(
                            "flex-1 text-xs px-2 py-1.5 rounded transition-colors",
                            selectedTemplate === key
                              ? "bg-foreground text-background font-medium"
                              : "bg-background border border-border/50 hover:bg-accent/50"
                          )}
                        >
                          {template.name}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2">
                      Select a template to auto-fill common use cases
                    </p>
                  </div>
                  <div className="mt-3 group">
                    <label
                      htmlFor="company-name-input"
                      className={cn(
                        "text-xs mb-1 block font-medium transition-colors",
                        companyName.trim()
                          ? "text-foreground"
                          : "text-muted-foreground group-focus-within:text-foreground"
                      )}
                    >
                      Company name <span className="text-destructive" aria-label="required">*</span>
                    </label>
                    <input
                      id="company-name-input"
                      type="text"
                      className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
                      placeholder="Acme Corp"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      aria-required="true"
                      aria-invalid={companyName.trim() === ""}
                      aria-describedby="company-name-hint"
                      autoFocus
                    />
                    <div id="company-name-hint" className="text-xs text-muted-foreground mt-1">
                      Choose a name for your organization
                    </div>
                  </div>
                  {!skipOptionalFields && (
                    <div className="group">
                      <label
                        htmlFor="company-goal-input"
                        className={cn(
                          "text-xs mb-1 block font-medium transition-colors",
                          companyGoal.trim()
                            ? "text-foreground"
                            : "text-muted-foreground group-focus-within:text-foreground"
                        )}
                      >
                        Mission / goal (optional)
                      </label>
                      <textarea
                        id="company-goal-input"
                        className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50 resize-none min-h-[60px]"
                        placeholder="What is this company trying to achieve?"
                        value={companyGoal}
                        onChange={(e) => setCompanyGoal(e.target.value)}
                        aria-describedby="company-goal-hint"
                      />
                      <div id="company-goal-hint" className="text-xs text-muted-foreground mt-1">
                        Describe your company's mission or long-term goals (you can leave this blank)
                      </div>
                    </div>
                  )}

                  {/* Skip optional fields toggle */}
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-border/50 bg-muted/20">
                    <input
                      id="skip-optional-toggle"
                      type="checkbox"
                      checked={skipOptionalFields}
                      onChange={(e) => setSkipOptionalFields(e.target.checked)}
                      className="rounded"
                    />
                    <label htmlFor="skip-optional-toggle" className="text-xs cursor-pointer flex-1">
                      Skip optional fields (mission/goal, description)
                    </label>
                  </div>
                </section>
              )}

              {step === 2 && (
                <section id="step-2" className="space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3 mb-1">
                    <div className="flex items-center gap-3">
                      <div className="bg-muted/50 p-2 rounded shrink-0">
                        <Bot className="h-4 sm:h-5 w-4 sm:w-5 text-muted-foreground" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="font-medium text-sm sm:text-base">Create your first agent</h2>
                        <p className="text-xs text-muted-foreground">
                          Choose how this agent will run tasks.
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-medium text-muted-foreground bg-muted/50 px-2 py-1 rounded shrink-0 sm:mt-0.5" aria-live="polite">
                      Step 2/4
                    </span>
                  </div>
                  <div>
                    <label htmlFor="agent-name-input" className="text-xs text-muted-foreground mb-1 block font-medium">
                      Agent name <span className="text-destructive" aria-label="required">*</span>
                    </label>
                    <input
                      id="agent-name-input"
                      type="text"
                      className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
                      placeholder="CEO"
                      value={agentName}
                      onChange={(e) => setAgentName(e.target.value)}
                      aria-required="true"
                      aria-invalid={agentName.trim() === ""}
                      aria-describedby="agent-name-hint"
                      autoFocus
                    />
                    <div id="agent-name-hint" className="text-xs text-muted-foreground mt-1">
                      Give your agent a name that reflects its role
                    </div>
                  </div>

                  {/* Adapter type radio cards */}
                  <fieldset>
                    <legend className="text-xs text-muted-foreground mb-2 block font-medium">
                      Adapter type <span className="text-destructive" aria-label="required">*</span>
                    </legend>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {recommendedAdapters.map((opt) => (
                        <Popover key={opt.type}>
                          <button
                            className={cn(
                              "flex flex-col items-center gap-1.5 rounded-md border p-3 text-xs transition-colors relative w-full",
                              adapterType === opt.type
                                ? "border-foreground bg-accent"
                                : "border-border hover:bg-accent/50"
                            )}
                            onClick={() => {
                              const nextType = opt.type;
                              setAdapterType(nextType);
                              if (nextType === "codex_local") {
                                if (!model) {
                                  setModel(DEFAULT_CODEX_LOCAL_MODEL);
                                }
                                return;
                              }
                              if (nextType === "opencode_local") {
                                setModel(DEFAULT_OPENCODE_LOCAL_MODEL);
                                return;
                              }
                              setModel("");
                            }}
                          >
                            {opt.recommended && (
                              <span className="absolute -top-1.5 right-1.5 bg-green-500 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded-full leading-none">
                                Recommended
                              </span>
                            )}
                            <div className="flex items-center gap-1">
                              <opt.icon className="h-4 w-4" />
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  className="p-0 hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring rounded"
                                  onClick={(e) => e.stopPropagation()}
                                  aria-label={`Learn more about ${opt.label}`}
                                >
                                  <HelpCircle className="h-3 w-3 text-muted-foreground opacity-60 hover:opacity-100" />
                                </button>
                              </PopoverTrigger>
                            </div>
                            <span className="font-medium">{opt.label}</span>
                            <span className="text-muted-foreground text-[10px] text-center leading-snug">
                              {opt.description}
                            </span>
                          </button>
                          <PopoverContent className="w-56 text-sm" side="right">
                            <div className="space-y-2">
                              <p className="font-medium">{opt.label}</p>
                              <p className="text-xs text-muted-foreground">
                                {ADAPTER_DESCRIPTIONS[opt.type] || opt.description}
                              </p>
                            </div>
                          </PopoverContent>
                        </Popover>
                      ))}
                    </div>

                    <button
                      className="flex items-center gap-1.5 mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setShowMoreAdapters((v) => !v)}
                    >
                      <ChevronDown
                        className={cn(
                          "h-3 w-3 transition-transform",
                          showMoreAdapters ? "rotate-0" : "-rotate-90"
                        )}
                      />
                      More Agent Adapter Types
                    </button>

                    {showMoreAdapters && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                        {moreAdapters.map((opt) => (
                          <Popover key={opt.type}>
                            <button
                              disabled={!!opt.comingSoon}
                              className={cn(
                                "flex flex-col items-center gap-1.5 rounded-md border p-3 text-xs transition-colors relative w-full",
                                opt.comingSoon
                                  ? "border-border opacity-40 cursor-not-allowed"
                                  : adapterType === opt.type
                                  ? "border-foreground bg-accent"
                                  : "border-border hover:bg-accent/50"
                              )}
                              onClick={() => {
                                if (opt.comingSoon) return;
                                const nextType = opt.type;
                               setAdapterType(nextType);
                               if (nextType === "gemini_local" && !model) {
                                 setModel(DEFAULT_GEMINI_LOCAL_MODEL);
                                 return;
                               }
                               if (nextType === "cursor" && !model) {
                                 setModel(DEFAULT_CURSOR_LOCAL_MODEL);
                                 return;
                               }
                               if (nextType === "opencode_local") {
                                 setModel(DEFAULT_OPENCODE_LOCAL_MODEL);
                                 return;
                               }
                               setModel("");
                             }}
                            >
                              <div className="flex items-center gap-1">
                                <opt.icon className="h-4 w-4" />
                                {!opt.comingSoon && (
                                  <PopoverTrigger asChild>
                                    <button
                                      type="button"
                                      className="p-0 hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring rounded"
                                      onClick={(e) => e.stopPropagation()}
                                      aria-label={`Learn more about ${opt.label}`}
                                    >
                                      <HelpCircle className="h-3 w-3 text-muted-foreground opacity-60 hover:opacity-100" />
                                    </button>
                                  </PopoverTrigger>
                                )}
                              </div>
                              <span className="font-medium">{opt.label}</span>
                              <span className="text-muted-foreground text-[10px] text-center leading-snug">
                                {opt.comingSoon
                                  ? opt.disabledLabel ?? "Coming soon"
                                  : opt.description}
                              </span>
                            </button>
                            {!opt.comingSoon && (
                              <PopoverContent className="w-56 text-sm" side="right">
                                <div className="space-y-2">
                                  <p className="font-medium">{opt.label}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {ADAPTER_DESCRIPTIONS[opt.type] || opt.description}
                                  </p>
                                </div>
                              </PopoverContent>
                            )}
                          </Popover>
                        ))}
                      </div>
                    )}
                  </fieldset>

                  {/* Conditional adapter fields */}
                  {isLocalAdapter && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block font-medium">
                          Model
                        </label>
                        <Popover
                          open={modelOpen}
                          onOpenChange={(next) => {
                            setModelOpen(next);
                            if (!next) setModelSearch("");
                          }}
                        >
                          <PopoverTrigger asChild>
                            <button className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 sm:px-2.5 py-1.5 text-xs sm:text-sm hover:bg-accent/50 transition-colors w-full justify-between">
                              <span
                                className={cn(
                                  "truncate",
                                  !model && "text-muted-foreground"
                                )}
                              >
                                {selectedModel
                                  ? selectedModel.label
                                  : model ||
                                    (adapterType === "opencode_local"
                                      ? "Select model (required)"
                                      : "Default")}
                              </span>
                              <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent
                            className="w-[var(--radix-popover-trigger-width)] p-1"
                            align="start"
                          >
                            <input
                              className="w-full px-2 py-1.5 text-xs bg-transparent outline-none border-b border-border mb-1 placeholder:text-muted-foreground/50"
                              placeholder="Search models..."
                              value={modelSearch}
                              onChange={(e) => setModelSearch(e.target.value)}
                              autoFocus
                            />
                            {adapterType !== "opencode_local" && (
                              <button
                                className={cn(
                                  "flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-accent/50",
                                  !model && "bg-accent"
                                )}
                                onClick={() => {
                                  setModel("");
                                  setModelOpen(false);
                                }}
                              >
                                Default
                              </button>
                            )}
                            <div className="max-h-[240px] overflow-y-auto">
                              {groupedModels.map((group) => (
                                <div
                                  key={group.provider}
                                  className="mb-1 last:mb-0"
                                >
                                  {adapterType === "opencode_local" && (
                                    <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                                      {group.provider} ({group.entries.length})
                                    </div>
                                  )}
                                  {group.entries.map((m) => (
                                    <button
                                      key={m.id}
                                      className={cn(
                                        "flex items-center w-full px-2 py-1.5 text-sm rounded hover:bg-accent/50",
                                        m.id === model && "bg-accent"
                                      )}
                                      onClick={() => {
                                        setModel(m.id);
                                        setModelOpen(false);
                                      }}
                                    >
                                      <span
                                        className="block w-full text-left truncate"
                                        title={m.id}
                                      >
                                        {adapterType === "opencode_local"
                                          ? extractModelName(m.id)
                                          : m.label}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              ))}
                            </div>
                            {filteredModels.length === 0 && (
                              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                                No models discovered.
                              </p>
                            )}
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                  )}

                  {isLocalAdapter && (
                    <div className="space-y-2 rounded-md border border-border p-3">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-medium">
                            Adapter environment check
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Runs a live probe that asks the adapter CLI to
                            respond with hello.
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2.5 text-xs shrink-0"
                          disabled={adapterEnvLoading}
                          onClick={() => void runAdapterEnvironmentTest()}
                        >
                          {adapterEnvLoading ? "Testing..." : "Test now"}
                        </Button>
                      </div>

                      {adapterEnvError && (
                        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-[11px] text-destructive">
                          {adapterEnvError}
                        </div>
                      )}

                      {adapterEnvResult &&
                      adapterEnvResult.status === "pass" ? (
                        <div className="flex items-center gap-2 rounded-md border border-green-300 dark:border-green-500/40 bg-green-50 dark:bg-green-500/10 px-3 py-2 text-xs text-green-700 dark:text-green-300 animate-in fade-in slide-in-from-bottom-1 duration-300">
                          <Check className="h-3.5 w-3.5 shrink-0" />
                          <span className="font-medium">Passed</span>
                        </div>
                      ) : adapterEnvResult ? (
                        <AdapterEnvironmentResult result={adapterEnvResult} />
                      ) : null}

                      {shouldSuggestUnsetAnthropicApiKey && (
                        <div className="rounded-md border border-amber-300/60 bg-amber-50/40 px-2.5 py-2 space-y-2">
                          <p className="text-[11px] text-amber-900/90 leading-relaxed">
                            Claude failed while{" "}
                            <span className="font-mono">ANTHROPIC_API_KEY</span>{" "}
                            is set. You can clear it in this CEO adapter config
                            and retry the probe.
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2.5 text-xs"
                            disabled={
                              adapterEnvLoading || unsetAnthropicLoading
                            }
                            onClick={() => void handleUnsetAnthropicApiKey()}
                          >
                            {unsetAnthropicLoading
                              ? "Retrying..."
                              : "Unset ANTHROPIC_API_KEY"}
                          </Button>
                        </div>
                      )}

                      {adapterEnvResult && adapterEnvResult.status === "fail" && (
                        <div className="rounded-md border border-border/70 bg-muted/20 px-2.5 py-2 text-[11px] space-y-1.5">
                          <p className="font-medium">Manual debug</p>
                          <p className="text-muted-foreground font-mono break-all">
                            {adapterType === "cursor"
                              ? `${effectiveAdapterCommand} -p --mode ask --output-format json \"Respond with hello.\"`
                              : adapterType === "codex_local"
                              ? `${effectiveAdapterCommand} exec --json -`
                              : adapterType === "gemini_local"
                                ? `${effectiveAdapterCommand} --output-format json "Respond with hello."`
                              : adapterType === "opencode_local"
                                ? `${effectiveAdapterCommand} run --format json "Respond with hello."`
                              : `${effectiveAdapterCommand} --print - --output-format stream-json --verbose`}
                          </p>
                          <p className="text-muted-foreground">
                            Prompt:{" "}
                            <span className="font-mono">Respond with hello.</span>
                          </p>
                          {adapterType === "cursor" ||
                          adapterType === "codex_local" ||
                          adapterType === "gemini_local" ||
                          adapterType === "opencode_local" ? (
                            <p className="text-muted-foreground">
                              If auth fails, set{" "}
                              <span className="font-mono">
                                {adapterType === "cursor"
                                  ? "CURSOR_API_KEY"
                                  : adapterType === "gemini_local"
                                    ? "GEMINI_API_KEY"
                                    : "OPENAI_API_KEY"}
                              </span>{" "}
                              in env or run{" "}
                              <span className="font-mono">
                                {adapterType === "cursor"
                                  ? "agent login"
                                  : adapterType === "codex_local"
                                    ? "codex login"
                                    : adapterType === "gemini_local"
                                      ? "gemini auth"
                                      : "opencode auth login"}
                              </span>
                              .
                            </p>
                          ) : (
                            <p className="text-muted-foreground">
                              If login is required, run{" "}
                              <span className="font-mono">claude login</span>{" "}
                              and retry.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {(adapterType === "http" ||
                    adapterType === "openclaw_gateway") && (
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">
                        {adapterType === "openclaw_gateway"
                          ? "Gateway URL"
                          : "Webhook URL"}
                      </label>
                      <input
                        className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm font-mono outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
                        placeholder={
                          adapterType === "openclaw_gateway"
                            ? "ws://127.0.0.1:18789"
                            : "https://..."
                        }
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                      />
                    </div>
                  )}
                </section>
              )}

              {step === 3 && (
                <section id="step-3" className="space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3 mb-1">
                    <div className="flex items-center gap-3">
                      <div className="bg-muted/50 p-2 rounded shrink-0">
                        <ListTodo className="h-4 sm:h-5 w-4 sm:w-5 text-muted-foreground" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="font-medium text-sm sm:text-base">Give it something to do</h2>
                        <p className="text-xs text-muted-foreground">
                          Give your agent a small task to start with — a bug fix,
                          a research question, writing a script.
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-medium text-muted-foreground bg-muted/50 px-2 py-1 rounded shrink-0 sm:mt-0.5" aria-live="polite">
                      Step 3/4
                    </span>
                  </div>
                  <div className="group">
                    <label
                      htmlFor="task-title-input"
                      className={cn(
                        "text-xs mb-1.5 block font-medium transition-colors",
                        taskTitle.trim()
                          ? "text-foreground"
                          : "text-muted-foreground group-focus-within:text-foreground"
                      )}
                    >
                      Task title <span className="text-destructive" aria-label="required">*</span>
                    </label>
                    <input
                      id="task-title-input"
                      type="text"
                      className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50 transition-colors"
                      placeholder="e.g. Research competitor pricing"
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      aria-required="true"
                      aria-invalid={taskTitle.trim() === ""}
                      autoFocus
                    />
                  </div>
                  {!skipOptionalFields && (
                    <div className="group">
                      <label
                        htmlFor="task-description-input"
                        className={cn(
                          "text-xs mb-1.5 block font-medium transition-colors",
                          taskDescription.trim()
                            ? "text-foreground"
                            : "text-muted-foreground group-focus-within:text-foreground"
                        )}
                      >
                        Description (optional)
                      </label>
                      <textarea
                        ref={textareaRef}
                        id="task-description-input"
                        className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50 resize-none min-h-[120px] max-h-[300px] overflow-y-auto transition-colors"
                        placeholder="Add more detail about what the agent should do..."
                        value={taskDescription}
                        onChange={(e) => setTaskDescription(e.target.value)}
                      />
                    </div>
                  )}
                </section>
              )}

              {step === 4 && (
                <section id="step-4" className="space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3 mb-1">
                    <div className="flex items-center gap-3">
                      <div className="bg-muted/50 p-2 rounded shrink-0">
                        <Rocket className="h-4 sm:h-5 w-4 sm:w-5 text-muted-foreground" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="font-medium text-sm sm:text-base">Ready to launch</h2>
                        <p className="text-xs text-muted-foreground">
                          Everything is set up. Launching now will create the
                          starter task, wake the agent, and open the issue.
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-medium text-muted-foreground bg-muted/50 px-2 py-1 rounded shrink-0 sm:mt-0.5" aria-live="polite">
                      Step 4/4
                    </span>
                  </div>
                  <div className="border border-border/50 divide-y divide-border/50 bg-muted/30 rounded-md overflow-hidden">
                    <div className="flex items-start gap-3 px-3.5 py-3">
                      <Building2 className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {companyName}
                        </p>
                        <p className="text-xs text-muted-foreground">Company organization</p>
                      </div>
                      <Check className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                    </div>
                    <div className="flex items-start gap-3 px-3.5 py-3">
                      <Bot className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {agentName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {getUIAdapter(adapterType).label} · CEO role
                        </p>
                      </div>
                      <Check className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                    </div>
                    <div className="flex items-start gap-3 px-3.5 py-3">
                      <ListTodo className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {taskTitle}
                        </p>
                        <p className="text-xs text-muted-foreground">Initial task</p>
                      </div>
                      <Check className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                    </div>
                  </div>

                  <div className="rounded-md border border-blue-300/50 dark:border-blue-500/30 bg-blue-50/50 dark:bg-blue-500/5 px-3 py-2.5">
                    <p className="text-xs text-blue-900 dark:text-blue-300 leading-relaxed">
                      <span className="font-medium">On launch:</span> We'll create the company, set up your CEO agent, and open the task so they can start working immediately.
                    </p>
                  </div>
                </section>
              )}

              {/* Error */}
              {error && (
                <div className="mt-5 sm:mt-6 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
                  <p className="text-xs text-destructive font-medium leading-relaxed break-words">{error}</p>
                </div>
              )}

              {/* Footer navigation */}
              <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 mt-6 sm:mt-8">
                <div>
                  {step > 1 && step > (onboardingOptions.initialStep ?? 1) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full sm:w-auto"
                      onClick={() => setStep((step - 1) as Step)}
                      disabled={loading}
                    >
                      <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                      <span className="hidden xs:inline">Back</span>
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  {step === 1 && (
                    <Button
                      size="sm"
                      className="flex-1 sm:flex-none"
                      disabled={!companyName.trim() || loading}
                      onClick={handleStep1Next}
                    >
                      {loading ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <ArrowRight className="h-3.5 w-3.5 mr-1" />
                      )}
                      {loading ? "Creating..." : "Next"}
                    </Button>
                  )}
                  {step === 2 && (
                    <Button
                      size="sm"
                      className="flex-1 sm:flex-none"
                      disabled={
                        !agentName.trim() || loading || adapterEnvLoading
                      }
                      onClick={handleStep2Next}
                    >
                      {loading ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <ArrowRight className="h-3.5 w-3.5 mr-1" />
                      )}
                      {loading ? "Creating..." : "Next"}
                    </Button>
                  )}
                  {step === 3 && (
                    <Button
                      size="sm"
                      className="flex-1 sm:flex-none"
                      disabled={!taskTitle.trim() || loading}
                      onClick={handleStep3Next}
                    >
                      {loading ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <ArrowRight className="h-3.5 w-3.5 mr-1" />
                      )}
                      {loading ? "Creating..." : "Next"}
                    </Button>
                  )}
                  {step === 4 && (
                    <Button
                      size="sm"
                      className="flex-1 sm:flex-none"
                      disabled={loading}
                      onClick={handleLaunch}
                    >
                      {loading ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <Rocket className="h-3.5 w-3.5 mr-1" />
                      )}
                      {loading ? "Launching..." : "Launch"}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right half — ASCII art (hidden on mobile) */}
          <div
            className={cn(
              "hidden md:block overflow-hidden bg-[#1d1d1d] transition-[width,opacity] duration-500 ease-in-out",
              step === 1 ? "w-1/2 opacity-100" : "w-0 opacity-0"
            )}
          >
            <AsciiArtAnimation />
          </div>
        </div>
      </DialogPortal>
    </Dialog>
  );
}

function AdapterEnvironmentResult({
  result
}: {
  result: AdapterEnvironmentTestResult;
}) {
  const statusLabel =
    result.status === "pass"
      ? "Passed"
      : result.status === "warn"
      ? "Warnings"
      : "Failed";
  const statusClass =
    result.status === "pass"
      ? "text-green-700 dark:text-green-300 border-green-300 dark:border-green-500/40 bg-green-50 dark:bg-green-500/10"
      : result.status === "warn"
      ? "text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10"
      : "text-red-700 dark:text-red-300 border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10";

  return (
    <div className={`rounded-md border px-2.5 py-2 text-[11px] ${statusClass}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{statusLabel}</span>
        <span className="opacity-80">
          {new Date(result.testedAt).toLocaleTimeString()}
        </span>
      </div>
      <div className="mt-1.5 space-y-1">
        {result.checks.map((check, idx) => (
          <div
            key={`${check.code}-${idx}`}
            className="leading-relaxed break-words"
          >
            <span className="font-medium uppercase tracking-wide opacity-80">
              {check.level}
            </span>
            <span className="mx-1 opacity-60">·</span>
            <span>{check.message}</span>
            {check.detail && (
              <span className="block opacity-75 break-all">
                ({check.detail})
              </span>
            )}
            {check.hint && (
              <span className="block opacity-90 break-words">
                Hint: {check.hint}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
