export const SUBSCRIPTION = "REPLACE_ME_WITH_YOUR_SUBSCRIPTION_ID";
// Workspace subscriptions may differ from the Arc inventory subscription.
export const DEFAULT_WORKSPACE = "/subscriptions/REPLACE_ME_WITH_AZURE_MONITOR_WORKSPACE_SUBSCRIPTION_ID/resourceGroups/REPLACE_ME_WITH_AZURE_MONITOR_WORKSPACE_RESOURCE_GROUP/providers/Microsoft.Monitor/accounts/REPLACE_ME_WITH_AZURE_MONITOR_WORKSPACE_NAME";
export const LOG_ANALYTICS_WORKSPACE = "/subscriptions/REPLACE_ME_WITH_LOG_ANALYTICS_WORKSPACE_SUBSCRIPTION_ID/resourceGroups/REPLACE_ME_WITH_LOG_ANALYTICS_WORKSPACE_RESOURCE_GROUP/providers/Microsoft.OperationalInsights/workspaces/REPLACE_ME_WITH_LOG_ANALYTICS_WORKSPACE_NAME";
const LEGACY_DEFAULT_WORKSPACE = "/subscriptions/REPLACE_ME_WITH_LEGACY_LOG_ANALYTICS_WORKSPACE_SUBSCRIPTION_ID/resourceGroups/REPLACE_ME_WITH_LEGACY_LOG_ANALYTICS_WORKSPACE_RESOURCE_GROUP/providers/microsoft.operationalinsights/workspaces/REPLACE_ME_WITH_LEGACY_LOG_ANALYTICS_WORKSPACE_NAME";
export const ARC_TYPES = [
    "microsoft.hybridcompute/machines",
    "microsoft.kubernetes/connectedclusters",
    "microsoft.azurearcdata/sqlserverinstances",
    "microsoft.connectedvmwarevsphere/virtualmachines",
    "microsoft.scvmm/virtualmachines",
];
export const CHECKLIST = [
    "Review performance monitoring for deviations",
    "Check EMM dashboard for failures or policy deviations",
    "Review Arc-enabled Kubernetes Upgrade Insights to prepare for K8s upgrades",
    "Check App Deployments (Azure VM Apps)",
    "Check TPM configuration and Auto Agent Upgrades",
    "Check Machine Configuration (Linux CIS benchmarks)",
    "Check Defender posture",
];
export const EMM_URL = "https://ms.portal.azure.com/?feature.EMMOverviewRedesign=true&feature.canmodifystamps=true&microsoft_azure_computehub=flight21#view/Microsoft_Azure_ComputeHub/ComputeHubMenuBlade/~/machineenrollment";
export const UPGRADE_ASSESSMENTS_QUERY = `KubernetesConfigurationResources
| where subscriptionId == '${SUBSCRIPTION}'
| where type =~ 'microsoft.kubernetesconfiguration/upgradeAssessments'
| project id,name,type,properties`;
export const APPLICATION_RESOURCE_GROUP = "REPLACE_ME_WITH_APPLICATION_GALLERY_RESOURCE_GROUP";
const applicationScope = `/subscriptions/${SUBSCRIPTION}/resourceGroups/${APPLICATION_RESOURCE_GROUP}/providers/Microsoft.Compute/galleries/`;
export const APP_DEPLOYMENTS_QUERY = `Resources
| where subscriptionId == '${SUBSCRIPTION}'
| where (resourceGroup =~ '${APPLICATION_RESOURCE_GROUP}' and type in~ ('microsoft.compute/galleries/applications','microsoft.compute/galleries/applications/versions'))
    or (type =~ 'microsoft.hybridcompute/machines/applications' and tolower(tostring(properties.packageReferenceId)) startswith '${applicationScope.toLowerCase()}')
| project id,name,type,provisioningState=tostring(properties.provisioningState),supportedOSType=tostring(properties.supportedOSType),packageReferenceId=tostring(properties.packageReferenceId),reportedVersion=tostring(properties.instanceView.version),installationResult=tostring(properties.instanceView.result)`;
export const EMM_RESOURCE_GROUP = "REPLACE_ME_WITH_ARC_SERVERS_RESOURCE_GROUP";
const emmMachineScope = `/subscriptions/${SUBSCRIPTION}/resourceGroups/${EMM_RESOURCE_GROUP}/providers/Microsoft.HybridCompute/machines/`;
const scopedMachine = id => typeof id === "string" && id.toLowerCase().startsWith(emmMachineScope.toLowerCase()) &&
    !id.slice(emmMachineScope.length).includes("/") && id.length > emmMachineScope.length;
export const EMM_ASSIGNMENT_ID = `/subscriptions/${SUBSCRIPTION}/providers/Microsoft.Authorization/policyAssignments/Managedops-Policy-${SUBSCRIPTION}`;
export const EMM_PLAN = {
    resourceGroup: EMM_RESOURCE_GROUP,
    configurationResourceId: `/subscriptions/${SUBSCRIPTION}/providers/Microsoft.ManagedOps/ManagedOps/default`,
    configurationApiVersion: "2026-01-06-preview",
    assignmentId: EMM_ASSIGNMENT_ID,
    policySetDefinitionId: "/providers/Microsoft.Authorization/policySetDefinitions/2dde6d38-95d9-46cd-bb7c-18dabd06b923",
    resourcesQuery: `Resources
| where subscriptionId == '${SUBSCRIPTION}' and resourceGroup =~ '${EMM_RESOURCE_GROUP}'
| where type in~ ('microsoft.hybridcompute/machines','microsoft.hybridcompute/machines/extensions')
| project id,name,type,status=coalesce(tostring(properties.status),tostring(properties.connectivityStatus)),os=tostring(properties.osType),publisher=tostring(properties.publisher),extensionType=tostring(properties.type),provisioningState=tostring(properties.provisioningState)`,
    policiesQuery: `PolicyResources
| where type =~ 'microsoft.policyinsights/policystates'
| where tostring(properties.policyAssignmentId) =~ '${EMM_ASSIGNMENT_ID}'
| where tolower(tostring(properties.resourceId)) startswith '${emmMachineScope.toLowerCase()}'
| project id,resourceId=tostring(properties.resourceId),referenceId=tostring(properties.policyDefinitionReferenceId),state=tostring(properties.complianceState),timestamp=todatetime(properties.timestamp),assignmentId=tostring(properties.policyAssignmentId),definitionId=tostring(properties.policyDefinitionId)`,
};
const emmServices = [
    { key: "monitoring", label: "Monitoring", references: ["azuremonitorforarc", "azuremonitordatacollectionruleassociationforarc"] },
    { key: "updates", label: "Update Manager", references: ["azureupdatemanagerarc"] },
    { key: "configuration", label: "Machine Configuration", references: ["guestconfigurationsecuritybaseline"] },
    { key: "tracking", label: "Change Tracking and Inventory", references: ["changetrackingforarc", "changetrackingdatacollectionruleassociationforarc"] },
];
const emmGuidance = `Read EMM policy compliance and agent extension status for Arc machines in ${EMM_RESOURCE_GROUP}, independent of overview filters. Use get_refresh_plan.emm. Verify the ManagedOps configuration still references the plan assignment and that its initiative has the expected Arc service reference IDs; report an emm error if the mapping changed. Read both resourcesQuery and policiesQuery with ARM MCP, follow every skipToken, and publish section emm with result {resources: <complete ARG result>, policies: <complete ARG result>}. Use only the EMM assignment's policy states, not unrelated assignments or extension presence as proof of policy compliance. Missing evaluations are unknown, exemptions are separate, and pending extensions are not failures. Do not copy subscription-wide portal counts into this resource-group view. Preserve old evidence and report an emm error on retrieval failure.`;
export const MACHINE_SECURITY_QUERY = `Resources
| where subscriptionId == '${SUBSCRIPTION}' and type =~ 'microsoft.hybridcompute/machines'
| project id,name,type,resourceGroup,status=tostring(properties.status),os=tostring(properties.osType),tpmPresent=tostring(properties.detectedProperties.tpm_Present),tpmReady=tostring(properties.detectedProperties.tpm_Ready),tpmVersion=tostring(properties.detectedProperties.tpm_SpecVersion),identityKeyStore=tostring(properties.identityKeyStore),automaticUpgrade=properties.agentUpgrade.enableAutomaticUpgrade`;
export const MACHINE_CONFIGURATION_PLAN = {
    resourceGroup: EMM_RESOURCE_GROUP,
    resourcesQuery: `Resources
| where subscriptionId == '${SUBSCRIPTION}' and resourceGroup =~ '${EMM_RESOURCE_GROUP}' and type =~ 'microsoft.hybridcompute/machines'
| project id,name,type,status=tostring(properties.status),os=tostring(properties.osType)`,
    policiesQuery: `PolicyResources
| where type =~ 'microsoft.policyinsights/policystates'
| extend resourceId=tostring(properties.resourceId), definitionId=tolower(tostring(properties.policyDefinitionId))
| where tolower(resourceId) startswith '${emmMachineScope.toLowerCase()}'
| where array_length(split(resourceId, '/')) == 9
| join kind=inner (PolicyResources
    | where type =~ 'microsoft.authorization/policydefinitions'
    | where tostring(properties.metadata.category) in~ ('Guest Configuration','Machine Configuration')
    | project definitionId=tolower(id),displayName=tostring(properties.displayName),category=tostring(properties.metadata.category)) on definitionId
| project id,resourceId,definitionId,displayName,category,assignmentId=tostring(properties.policyAssignmentId),referenceId=tostring(properties.policyDefinitionReferenceId),state=tostring(properties.complianceState),timestamp=todatetime(properties.timestamp)`,
};
const securityGuidance = `Read all Arc servers in the configured subscription using get_refresh_plan.machineSecurityQuery and publish the complete ARG result as machineSecurity. Follow every skipToken. Only properties.identityKeyStore equal to Tpm confirms TPM-backed Arc identity is enabled; TPM presence/readiness alone does not. Keep unknown reports separate from false, show disconnected status, and distinguish automatic-upgrade settings from successful upgrades. Do not enable TPM, reconnect machines or change upgrade settings.`;
const configurationGuidance = `Read get_refresh_plan.machineConfiguration resourcesQuery and policiesQuery, following every skipToken in both. Publish section machineConfiguration with result {resources: <complete ARG result>, policies: <complete ARG result>}. Scope is Arc servers in ${EMM_RESOURCE_GROUP}, independent of overview filters. Only policy definitions categorized Guest Configuration or Machine Configuration qualify; do not include all Azure Policy assignments or use EMM's prerequisite policy as proof of guest compliance. Aggregate latest evaluations per machine/assignment/definition/reference. Missing evaluations are unassessed, unknown states and exemptions are separate, and all reported checks compliant does not prove complete assignment coverage or fresh guest health. Identify Linux CIS evidence specifically; other security baselines are not proof of CIS compliance. Never trigger evaluations or remediation.`;
export const DATA_SECTIONS = ["inventory", "advisor", "metrics", "upgradeAssessments", "appDeployments", "emm", "machineSecurity", "machineConfiguration"];
export const REFRESH_INTERVALS = [0, 5, 30, 60];

const subscriptionPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const groupPattern = /^\/subscriptions\/([0-9a-f-]{36})\/resourceGroups\/([\p{L}\p{N}_.()-]{1,90})$/iu;
const hasScope = settings => Array.isArray(settings?.subscriptionIds);
const quote = value => `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;

export function validateScope(settings) {
    if (!Array.isArray(settings.subscriptionIds) || !settings.subscriptionIds.length ||
        settings.subscriptionIds.some(id => typeof id !== "string" || !subscriptionPattern.test(id)) ||
        new Set(settings.subscriptionIds.map(id => id.toLowerCase())).size !== settings.subscriptionIds.length) {
        throw new Error("Select at least one accessible subscription.");
    }
    if (settings.resourceGroupIds !== null && (!Array.isArray(settings.resourceGroupIds) || !settings.resourceGroupIds.length ||
        settings.resourceGroupIds.some(id => typeof id !== "string" || !groupPattern.test(id) ||
            !settings.subscriptionIds.some(sub => sub.toLowerCase() === id.match(groupPattern)[1].toLowerCase())) ||
        new Set(settings.resourceGroupIds.map(id => id.toLowerCase())).size !== settings.resourceGroupIds.length)) {
        throw new Error("Select resource groups within the selected subscriptions, or all resource groups.");
    }
    return settings;
}

export function effectiveSettings(state) {
    return validateScope({
        ...state.settings,
        subscriptionIds: state.settings.subscriptionIds ?? state.scopeOptions.subscriptions.map(item => item.id),
    });
}

export function scopeLabel(settings) {
    return `${settings.subscriptionIds === null ? "All accessible subscriptions" : `${settings.subscriptionIds.length} subscription(s)`} / ${settings.resourceGroupIds === null ? "All resource groups" : `${settings.resourceGroupIds.length} resource group(s)`}`;
}

function scopePredicate(settings, field = "id") {
    validateScope(settings);
    const subscriptions = `tostring(split(${field}, '/')[2]) in~ (${settings.subscriptionIds.map(quote).join(",")})`;
    return settings.resourceGroupIds === null ? subscriptions :
        `${subscriptions} and (${settings.resourceGroupIds.map(id => `tolower(${field}) startswith ${quote(`${id.toLowerCase()}/`)}`).join(" or ")})`;
}

function scopedPlans(settings) {
    if (!hasScope(settings)) return {
        emm: EMM_PLAN, machineConfiguration: MACHINE_CONFIGURATION_PLAN,
        upgradeAssessmentsQuery: UPGRADE_ASSESSMENTS_QUERY, appDeploymentsQuery: APP_DEPLOYMENTS_QUERY,
        machineSecurityQuery: MACHINE_SECURITY_QUERY,
    };
    const scope = scopePredicate(settings);
    const machineScope = `${scopePredicate(settings, "resourceId")} and resourceId matches regex @'(?i)/providers/microsoft\\.hybridcompute/machines/[^/]+$'`;
    const resourcesQuery = `Resources
| where ${scope}
| where type in~ ('microsoft.hybridcompute/machines','microsoft.hybridcompute/machines/extensions')
| project id,name,type,status=coalesce(tostring(properties.status),tostring(properties.connectivityStatus)),os=tostring(properties.osType),publisher=tostring(properties.publisher),extensionType=tostring(properties.type),provisioningState=tostring(properties.provisioningState)`;
    return {
        emm: {
            resourceGroup: scopeLabel(settings),
            configurations: settings.subscriptionIds.map(id => ({ subscriptionId: id, resourceId: `/subscriptions/${id}/providers/Microsoft.ManagedOps/ManagedOps/default`, apiVersion: EMM_PLAN.configurationApiVersion })),
            policySetDefinitionId: EMM_PLAN.policySetDefinitionId,
            resourcesQuery,
            policiesQuery: `PolicyResources
| where type =~ 'microsoft.policyinsights/policystates'
| extend resourceId=tostring(properties.resourceId)
| where ${machineScope}
| project id,resourceId,referenceId=tostring(properties.policyDefinitionReferenceId),state=tostring(properties.complianceState),timestamp=todatetime(properties.timestamp),assignmentId=tostring(properties.policyAssignmentId),definitionId=tostring(properties.policyDefinitionId)`,
        },
        machineConfiguration: {
            resourceGroup: scopeLabel(settings),
            resourcesQuery: `${resourcesQuery}\n| where type =~ 'microsoft.hybridcompute/machines'`,
            policiesQuery: `PolicyResources
| where type =~ 'microsoft.policyinsights/policystates'
| extend resourceId=tostring(properties.resourceId), definitionId=tolower(tostring(properties.policyDefinitionId))
| where ${machineScope}
| join kind=inner (PolicyResources
    | where type =~ 'microsoft.authorization/policydefinitions'
    | where tostring(properties.metadata.category) in~ ('Guest Configuration','Machine Configuration')
    | project definitionId=tolower(id),displayName=tostring(properties.displayName),category=tostring(properties.metadata.category)) on definitionId
| project id,resourceId,definitionId,displayName,category,assignmentId=tostring(properties.policyAssignmentId),referenceId=tostring(properties.policyDefinitionReferenceId),state=tostring(properties.complianceState),timestamp=todatetime(properties.timestamp)`,
        },
        upgradeAssessmentsQuery: `KubernetesConfigurationResources | where ${scope} | where type =~ 'microsoft.kubernetesconfiguration/upgradeAssessments' | project id,name,type,properties`,
        appDeploymentsQuery: `Resources | where ${scope} | where type in~ ('microsoft.compute/galleries/applications','microsoft.compute/galleries/applications/versions','microsoft.hybridcompute/machines/applications') | project id,name,type,provisioningState=tostring(properties.provisioningState),supportedOSType=tostring(properties.supportedOSType),packageReferenceId=tostring(properties.packageReferenceId),reportedVersion=tostring(properties.instanceView.version),installationResult=tostring(properties.instanceView.result)`,
        machineSecurityQuery: `Resources | where ${scope} | where type =~ 'microsoft.hybridcompute/machines' | project id,name,type,resourceGroup,status=tostring(properties.status),os=tostring(properties.osType),tpmPresent=tostring(properties.detectedProperties.tpm_Present),tpmReady=tostring(properties.detectedProperties.tpm_Ready),tpmVersion=tostring(properties.detectedProperties.tpm_SpecVersion),identityKeyStore=tostring(properties.identityKeyStore),automaticUpgrade=properties.agentUpgrade.enableAutomaticUpgrade`,
    };
}

export function taskReviewPlan(taskId, settings) {
    if (!Number.isInteger(taskId) || taskId < 1 || taskId > CHECKLIST.length) throw new Error("Unknown checklist task.");
    const guidance = [
        "Review actual server performance samples, deviations and coverage in the selected source/window. EMM performance uses Azure Monitor workspace Prometheus metrics, not its Change Tracking Log Analytics workspace. Read get_refresh_plan.monitoring, retrieve and publish fresh metrics or report an explicit metrics error. Missing telemetry is not zero usage.",
        emmGuidance,
        "Read existing Arc Kubernetes upgrade assessments from KubernetesConfigurationResources, not Resources or the AKS-only Upgrade Insights API. Follow every skipToken, publish the complete result as upgradeAssessments, and distinguish incompatible, unknown, stale and unassessed clusters. Do not generate an assessment or start an upgrade.",
        `Read the Azure Compute Gallery application catalog and all versions in ${APPLICATION_RESOURCE_GROUP}, and matching Microsoft.HybridCompute/machines/applications across the configured subscription. Follow every skipToken and publish the complete combined result as appDeployments. If ARG does not expose these resources, use read-only ARM GET/list endpoints for gallery applications/versions and each Arc machine's applications; follow all nextLink pages before publishing. Get application instance views where available (Hybrid Compute API 2026-09-01) to distinguish reported installed versions from requested versions, including unresolved 'latest'. Preserve packageReferenceId and instanceView.version/result. Failed, pending or missing installation results are not verified installs; empty ARG results alone do not prove no deployments. Never deploy or change an application.`,
        securityGuidance,
        configurationGuidance,
        "Review existing Defender for Cloud assessments, recommendations and coverage. Missing assessments do not prove a healthy security posture.",
    ];
    const navigation = [
        "Azure Monitor > Workspaces > select the configured Azure Monitor workspace > query metrics with PromQL. The charts cover the selected server telemetry source, not Change Tracking logs.",
        "Open the EMM dashboard in Microsoft Edge, then review enrollment, failures and policy deviations for the configured subscription.",
        "Azure Arc > Upgrade Insights. Review Kubernetes upgrade readiness in the portal; existing assessment evidence is shown below.",
        "Azure Arc > Servers > select a server > Applications / VM applications. The catalog and deployment evidence is shown below.",
        "Azure Arc > Machines > select a machine > inspect its agent upgrade and TPM/security configuration where available.",
        `Azure Policy > Overview; scope to ${EMM_RESOURCE_GROUP} and review Machine Configuration policies and any specific Linux CIS evidence.`,
        "Microsoft Defender for Cloud > Recommendations / Inventory; scope the review to the configured subscription and the relevant Arc resources.",
    ];
    const plan = {
        taskId, title: CHECKLIST[taskId - 1], guidance: guidance[taskId - 1],
        description: taskId === 3 ? "Review target-version compatibility, component findings, readiness checks and deprecated API usage from existing Arc Kubernetes upgrade assessments." :
            taskId === 4 ? `Explore application versions from ${APPLICATION_RESOURCE_GROUP} and their deployments across Arc servers in the configured subscription.` :
            taskId === 5 ? "Review machines using TPM-backed Arc identity, their reported TPM readiness and automatic agent upgrade settings." :
            taskId === 6 ? `Review reported Machine Configuration policy compliance for Arc servers in ${EMM_RESOURCE_GROUP}.` : guidance[taskId - 1],
        navigation: navigation[taskId - 1],
        portalUrl: taskId === 2 ? EMM_URL : taskId === 3 ? "https://ms.portal.azure.com/#servicemenu/Microsoft_Azure_ArcCenterUX/AzureArcCenterHub/upgradeInsights" : taskId === 4 ? "https://ms.portal.azure.com/#servicemenu/Microsoft_Azure_ArcCenterUX/AzureArcCenterHub/servers" : taskId === 6 ? "https://ms.portal.azure.com/#view/Microsoft_Azure_Policy/PolicyMenuBlade.MenuView/~/Overview" : "https://portal.azure.com/",
        ...(taskId === 3 ? { section: "upgradeAssessments", query: UPGRADE_ASSESSMENTS_QUERY } : {}),
        ...(taskId === 4 ? { section: "appDeployments", query: APP_DEPLOYMENTS_QUERY, resourceGroup: APPLICATION_RESOURCE_GROUP } : {}),
        ...(taskId === 2 ? { section: "emm", queries: EMM_PLAN, resourceGroup: EMM_RESOURCE_GROUP } : {}),
        ...(taskId === 5 ? { section: "machineSecurity", query: MACHINE_SECURITY_QUERY } : {}),
        ...(taskId === 6 ? { section: "machineConfiguration", queries: MACHINE_CONFIGURATION_PLAN, resourceGroup: EMM_RESOURCE_GROUP } : {}),
    };
    if (hasScope(settings)) {
        const plans = settings.subscriptionIds.length ? scopedPlans(settings) : {
            emm: {}, machineConfiguration: {}, upgradeAssessmentsQuery: "", appDeploymentsQuery: "", machineSecurityQuery: "",
        };
        const scope = scopeLabel(settings);
        plan.guidance = plan.guidance.replaceAll(EMM_RESOURCE_GROUP, scope).replaceAll(APPLICATION_RESOURCE_GROUP, scope).replaceAll("the configured subscription", "the selected scope");
        plan.description = plan.description.replaceAll(EMM_RESOURCE_GROUP, scope).replaceAll(APPLICATION_RESOURCE_GROUP, scope).replaceAll("the configured subscription", "the selected scope");
        plan.navigation = plan.navigation.replaceAll(EMM_RESOURCE_GROUP, scope).replaceAll("the configured subscription", "the selected scope");
        if (taskId === 1) plan.navigation = "Azure Monitor > Workspaces. Select a monitoring workspace and review server telemetry for the configured scope.";
        if (taskId === 2) {
            plan.queries = plans.emm;
            plan.guidance = `Read get_refresh_plan.emm for the selected scope, independent of overview filters. For every subscription read its ManagedOps configuration; discover the actual policy initiative assignment from properties.policyAssignmentProperties.policyInitiativeAssignmentId and verify its initiative/service reference mapping. Never assume a policy assignment name. A confirmed missing ManagedOps configuration means no verified EMM assignment; keep machine compliance unknown. Other failures require an emm error. Read complete resourcesQuery and policiesQuery, following all skipToken pages. Retain ONLY policy states matching the discovered EMM assignments. Publish {resources:<complete ARG result>,policies:<complete filtered ARG result>,assignments:[{subscriptionId,assignmentId}]} as emm. Include only verified assignments. Missing evaluations are unknown; exemptions and pending extensions are separate from failures. Preserve previous evidence on retrieval failure.`;
        }
        if (taskId === 3) plan.query = plans.upgradeAssessmentsQuery;
        if (taskId === 4) {
            plan.query = plans.appDeploymentsQuery;
            plan.guidance += " Include every gallery application/version in the selected scope and every application deployment on selected servers, even when its gallery reference is outside the selected scope. External package references are identifiers only; do not retrieve an out-of-scope catalog.";
        }
        if (taskId === 5) plan.query = plans.machineSecurityQuery;
        if (taskId === 6) plan.queries = plans.machineConfiguration;
        if ("resourceGroup" in plan) plan.resourceGroup = scope;
    }
    return plan;
}

export function migrateState(state) {
    state.scopeOptions ??= { subscriptions: [], resourceGroups: [], updatedAt: null };
    if (!("subscriptionIds" in state.settings)) {
        state.settings.subscriptionIds = [state.subscriptionId ?? SUBSCRIPTION];
        state.settings.resourceGroupIds = null;
        state.settings.title = state.subscriptionName || "Azure Arc operations";
        // These legacy snapshots covered narrower groups than the new dashboard scope.
        for (const section of ["emm", "machineConfiguration", "appDeployments"]) state[section] = { rows: [], updatedAt: null, error: null };
        state.reviews = {};
        state.answer = "";
        for (const item of state.checklist) item.completedAt = null;
    }
    state.settings.refreshMinutes ??= 0;
    if (!REFRESH_INTERVALS.includes(state.settings.refreshMinutes)) throw new Error("Invalid saved refresh interval. Choose Manual, 5, 30 or 60 minutes.");
    const previousDefaults = state.settings.defaultWorkspaceId ? [state.settings.defaultWorkspaceId] : [LEGACY_DEFAULT_WORKSPACE, LOG_ANALYTICS_WORKSPACE];
    if (!DEFAULT_WORKSPACE.includes("REPLACE_ME_") &&
        previousDefaults.some(id => state.settings.workspaceId.toLowerCase() === id.toLowerCase())) state.settings.workspaceId = DEFAULT_WORKSPACE;
    state.settings.defaultWorkspaceId = DEFAULT_WORKSPACE;
    state.appearance ??= "auto";
    state.upgradeAssessments ??= { rows: [], updatedAt: null, error: null };
    state.appDeployments ??= { rows: [], updatedAt: null, error: null };
    state.emm ??= { rows: [], updatedAt: null, error: null };
    state.machineSecurity ??= { rows: [], updatedAt: null, error: null };
    state.machineConfiguration ??= { rows: [], updatedAt: null, error: null };
    state.reviews ??= { overview: { answer: state.answer ?? "", updatedAt: null, requestId: null } };
    return state;
}

export function recordReview(state, job, answer) {
    const key = job.taskId == null ? "overview" : String(taskReviewPlan(job.taskId).taskId);
    state.reviews[key] = { answer, updatedAt: new Date().toISOString(), requestId: job.id };
    if (key === "overview") state.answer = answer;
}
export const filterSchema = {
    type: "object", additionalProperties: false,
    properties: Object.fromEntries(["search", "type", "status", "resourceGroup", "location", "resourceId"].map(key => [key, { type: "string", maxLength: 500 }])),
};

export function initialState() {
    return {
        version: 1, appearance: "auto",
        scopeOptions: { subscriptions: [], resourceGroups: [], updatedAt: null },
        inventory: { rows: [], updatedAt: null, error: null },
        advisor: { rows: [], updatedAt: null, error: null },
        upgradeAssessments: { rows: [], updatedAt: null, error: null },
        appDeployments: { rows: [], updatedAt: null, error: null },
        emm: { rows: [], updatedAt: null, error: null },
        machineSecurity: { rows: [], updatedAt: null, error: null },
        machineConfiguration: { rows: [], updatedAt: null, error: null },
        metrics: { rows: [], updatedAt: null, error: null, workspaceId: "", hours: 24 },
        settings: { title: "Azure Arc operations", subscriptionIds: null, resourceGroupIds: null, workspaceId: "", hours: 24, defaultWorkspaceId: DEFAULT_WORKSPACE, refreshMinutes: 0 },
        filters: { search: "", type: "", status: "", resourceGroup: "", location: "", resourceId: "" },
        checklist: CHECKLIST.map((text, index) => ({ id: index + 1, text, completedAt: null })),
        job: null, answer: "", reviews: {},
    };
}

export function resourceInScope(id, settings) {
    if (typeof id !== "string") return false;
    const match = id.match(/^\/subscriptions\/([^/]+)\//i);
    if (!match) return false;
    if (!hasScope(settings)) return match[1].toLowerCase() === SUBSCRIPTION;
    return settings.subscriptionIds.some(sub => sub.toLowerCase() === match[1].toLowerCase()) &&
        (settings.resourceGroupIds === null || settings.resourceGroupIds.some(group => id.toLowerCase().startsWith(`${group.toLowerCase()}/`)));
}

export function isArc(id, settings) {
    return resourceInScope(id, settings) && ARC_TYPES.some(type => id.toLowerCase().includes(`/providers/${type.split("/")[0]}/${type.split("/")[1]}/`));
}

export function argRows(result) {
    if (result?.isSuccessful !== true || !Array.isArray(result.results?.data)) {
        throw new Error("Expected a successful ARM Resource Graph objectArray response.");
    }
    if (result.skipToken || result.resultTruncated === true || result.resultTruncated === "true" || Number(result.totalRecords ?? result.results.data.length) > result.results.data.length) {
        throw new Error("Resource Graph results are incomplete. Fetch every skipToken page and combine data before publishing.");
    }
    return result.results.data;
}

export function metricRows(result, settings) {
    if (result?.source === "prometheus") return prometheusRows(result, settings);
    if (result?.error || result?.Error || result?.partialError) throw new Error("Azure Monitor returned an error or partial result.");
    const tables = result?.Tables ?? result?.tables;
    if (!Array.isArray(tables)) throw new Error("Azure Monitor returned no tables; this is not evidence of zero activity.");
    const status = tables.find(table => (table.TableName ?? table.name) === "QueryStatus" || (table.Columns ?? table.columns ?? []).some(col => (col.ColumnName ?? col.name) === "SeverityName"));
    if (status) {
        const columns = (status.Columns ?? status.columns).map(col => col.ColumnName ?? col.name);
        const severityIndex = columns.indexOf("Severity");
        if ((status.Rows ?? status.rows ?? []).some(row => severityIndex >= 0 && row[severityIndex] <= 2)) {
            throw new Error("Azure Monitor reported an incomplete or failed query.");
        }
    }
    const primary = tables.find(table => {
        const names = (table.Columns ?? table.columns ?? []).map(col => col.ColumnName ?? col.name);
        return ["resourceId", "metric", "series", "time", "value", "unit"].every(name => names.includes(name));
    });
    if (!primary) throw new Error("Monitoring table must contain resourceId, metric, series, time, value and unit.");
    const columns = (primary.Columns ?? primary.columns).map(col => col.ColumnName ?? col.name);
    return validateMetricRows((primary.Rows ?? primary.rows ?? []).map(row => Object.fromEntries(columns.map((name, index) => [name, row[index]]))), settings);
}

function validateMetricRows(rows, settings) {
    return rows.map(row => {
        if (!isArc(row.resourceId, settings) || !["cpu", "memory", "network", "disk"].includes(row.metric) ||
            typeof row.value !== "number" || !Number.isFinite(row.value) ||
            !Number.isFinite(Date.parse(row.time)) || typeof row.series !== "string" ||
            !["%", "KiB/s"].includes(row.unit) ||
            (["cpu", "memory"].includes(row.metric) ? row.unit !== "%" : row.unit !== "KiB/s")) {
            throw new Error("Monitoring row has an out-of-scope resource, invalid timestamp/value or inconsistent units.");
        }
        return { resourceId: row.resourceId, metric: row.metric, series: row.series, time: row.time, value: row.value, unit: row.unit };
    });
}

function prometheusRows(result, settings) {
    const rows = [];
    for (const metric of ["cpu", "memory", "network", "disk"]) {
        const response = result[metric];
        if (response?.status !== "success" || response.error || response.warnings?.length ||
            response.data?.resultType !== "matrix" || !Array.isArray(response.data.result)) {
            throw new Error(`Prometheus ${metric} query failed, is incomplete or is not a range-query matrix.`);
        }
        for (const series of response.data.result) {
            const resourceId = series.metric?.["microsoft.resourceid"];
            const direction = series.metric?.direction;
            if (!isArc(resourceId, settings) || !/\/providers\/microsoft\.hybridcompute\/machines\/[^/]+$/i.test(resourceId) ||
                !Array.isArray(series.values) ||
                (metric === "network" && !["receive", "transmit"].includes(direction)) ||
                (metric === "disk" && !["read", "write"].includes(direction))) {
                throw new Error(`Prometheus ${metric} series has an invalid resource, direction or samples.`);
            }
            for (const sample of series.values) {
                if (!Array.isArray(sample) || sample.length !== 2 || typeof sample[0] !== "number" ||
                    !Number.isFinite(sample[0]) || !Number.isFinite(new Date(sample[0] * 1000).getTime()) ||
                    typeof sample[1] !== "string" || !sample[1].trim() || !Number.isFinite(Number(sample[1]))) {
                    throw new Error(`Prometheus ${metric} returned an invalid or non-finite sample.`);
                }
                rows.push({
                    resourceId: resourceId.toLowerCase(), metric,
                    series: metric === "cpu" ? "CPU busy (5m)" : metric === "memory" ? "Physical memory non-free" : `${metric} ${direction} (5m)`,
                    time: new Date(sample[0] * 1000).toISOString(), value: Number(sample[1]),
                    unit: ["cpu", "memory"].includes(metric) ? "%" : "KiB/s",
                });
            }
        }
    }
    return validateMetricRows(rows, settings);
}

export function normalize(section, result, settings) {
    if (hasScope(settings)) validateScope(settings);
    if (section === "metrics") return metricRows(result, settings);
    if (section === "emm") return normalizeEmm(result, settings);
    if (section === "machineConfiguration") return normalizeMachineConfiguration(result, settings);
    const rows = argRows(result);
    if (section === "machineSecurity") {
        const seen = new Set();
        const boolean = value => {
            if (value === undefined || value === null || value === "") return null;
            if (value === true || value === "true") return true;
            if (value === false || value === "false") return false;
            throw new Error("Machine security reports must use true, false or unknown.");
        };
        return rows.map(row => {
            if (!resourceInScope(row.id, settings) || !/\/providers\/microsoft\.hybridcompute\/machines\/[^/]+$/i.test(row.id) ||
                row.type?.toLowerCase() !== "microsoft.hybridcompute/machines" || seen.has(row.id.toLowerCase())) {
                throw new Error("Machine security contains a duplicate or out-of-scope Arc server.");
            }
            seen.add(row.id.toLowerCase());
            return {
                id: row.id, name: String(row.name), resourceGroup: row.id.split("/")[4],
                status: String(row.status || "Unknown"), os: String(row.os ?? ""),
                identityKeyStore: String(row.identityKeyStore ?? ""),
                tpmPresent: boolean(row.tpmPresent), tpmReady: boolean(row.tpmReady),
                tpmVersion: String(row.tpmVersion ?? ""), automaticUpgrade: boolean(row.automaticUpgrade),
            };
        });
    }
    if (section === "appDeployments") {
        const catalogId = hasScope(settings) ?
            /^\/subscriptions\/[0-9a-f-]{36}\/resourceGroups\/[^/]+\/providers\/Microsoft\.Compute\/galleries\/([^/]+)\/applications\/([^/]+)(?:\/versions\/(\d+\.\d+\.\d+|latest))?$/i :
            new RegExp(`^${applicationScope.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^/]+)/applications/([^/]+)(?:/versions/(\\d+\\.\\d+\\.\\d+|latest))?$`, "i");
        const deploymentId = /^\/subscriptions\/[^/]+\/resourceGroups\/[^/]+\/providers\/Microsoft\.HybridCompute\/machines\/([^/]+)\/applications\/[^/]+$/i;
        const seen = new Set();
        return rows.map(row => {
            if (typeof row.id !== "string" || seen.has(row.id.toLowerCase())) throw new Error("Missing or duplicate application resource ID.");
            seen.add(row.id.toLowerCase());
            const properties = row.properties ?? {};
            const provisioningState = String(row.provisioningState || properties.provisioningState || "Unknown");
            const type = row.type?.toLowerCase();
            if (type === "microsoft.hybridcompute/machines/applications") {
                if (!resourceInScope(row.id, settings) || !deploymentId.test(row.id)) throw new Error("Application deployment is outside the selected Arc server scope.");
                const packageReferenceId = row.packageReferenceId || properties.packageReferenceId;
                const reference = typeof packageReferenceId === "string" && packageReferenceId.match(catalogId);
                if (!reference?.[3]) throw new Error("Application package reference has an unsupported gallery ID or no version.");
                const reportedVersion = String(row.reportedVersion || properties.instanceView?.version || "");
                if (reportedVersion && !/^\d+\.\d+\.\d+$/.test(reportedVersion)) throw new Error("Invalid reported installed application version.");
                const applicationId = packageReferenceId.replace(/\/versions\/[^/]+$/i, "");
                return {
                    kind: "deployment", id: row.id, resourceId: row.id.replace(/\/applications\/[^/]+$/i, ""),
                    applicationId, packageReferenceId, name: reference[2], gallery: reference[1],
                    requestedVersion: reference[3], reportedVersion,
                    versionId: `${applicationId}/versions/${reportedVersion || reference[3]}`,
                    version: reportedVersion || reference[3], provisioningState,
                    installationResult: String(row.installationResult || properties.instanceView?.result || "Unknown"),
                };
            }
            const reference = row.id.match(catalogId);
            if (!resourceInScope(row.id, settings) || !reference || !["microsoft.compute/galleries/applications", "microsoft.compute/galleries/applications/versions"].includes(type) ||
                (type.endsWith("/versions") !== Boolean(reference[3]))) throw new Error("Application catalog resource is outside the selected scope or has an invalid type.");
            return {
                kind: reference[3] ? "version" : "application", id: row.id,
                applicationId: row.id.replace(/\/versions\/[^/]+$/i, ""),
                name: reference[2], gallery: reference[1], version: reference[3] ?? "",
                provisioningState, supportedOSType: String(row.supportedOSType || properties.supportedOSType || ""),
            };
        });
    }
    if (section === "upgradeAssessments") {
        const fields = (item, keys) => Object.fromEntries(keys.map(key => [key, String(item[key] ?? "")]));
        const entries = (value, keys) => {
            if (value === undefined) return [];
            if (!Array.isArray(value) || value.some(item => !item || typeof item !== "object" || Array.isArray(item))) throw new Error("Invalid upgrade assessment checks.");
            return value.map(item => fields(item, keys));
        };
        return rows.map(row => {
            const suffix = /\/providers\/microsoft\.kubernetesconfiguration\/upgradeassessments\/[^/]+$/i;
            const resourceId = typeof row.id === "string" ? row.id.replace(suffix, "") : "";
            if (!suffix.test(row.id ?? "") || !resourceInScope(resourceId, settings) ||
                !/\/providers\/microsoft\.kubernetes\/connectedclusters\/[^/]+$/i.test(resourceId) ||
                row.type?.toLowerCase() !== "microsoft.kubernetesconfiguration/upgradeassessments") {
                throw new Error("Upgrade assessment is outside the selected Arc Kubernetes scope.");
            }
            const properties = row.properties;
            if (!properties || typeof properties !== "object" || Array.isArray(properties)) throw new Error("Upgrade assessment properties are missing.");
            const assessmentTime = properties.assessmentTime ?? null;
            if (assessmentTime !== null && (typeof assessmentTime !== "string" || !Number.isFinite(Date.parse(assessmentTime)))) throw new Error("Invalid upgrade assessment timestamp.");
            return {
                id: row.id, resourceId, name: String(row.name ?? ""),
                ...fields(properties, ["currentKubernetesVersion", "targetKubernetesVersion"]),
                overallSeverity: String(properties.overallSeverity || "Unknown"), assessmentTime,
                componentCompatibility: entries(properties.componentCompatibility, ["name", "severity", "compatibilityStatus", "version", "minCompatibleVersion", "notes"]),
                readinessChecks: entries(properties.readinessChecks, ["name", "severity", "category", "notes"]),
                deprecatedApis: entries(properties.deprecatedApis, ["group", "resource", "version", "severity", "removedRelease", "lastUsageObservedAt"]),
            };
        });
    }
    if (section === "inventory") {
        return rows.map(row => {
            if (!resourceInScope(row.id, settings) || ![...ARC_TYPES, "microsoft.operationalinsights/workspaces", "microsoft.monitor/accounts"].includes(row.type?.toLowerCase())) {
                throw new Error("Inventory contains an unsupported or out-of-subscription resource.");
            }
            const properties = row.properties ?? {};
            return {
                id: row.id, name: String(row.name), type: row.type.toLowerCase(),
                resourceGroup: String(row.resourceGroup ?? ""), location: String(row.location ?? ""),
                status: String(row.status || properties.connectivityStatus || properties.status || "Unknown"),
                os: String(row.os || properties.osType || ""),
                agentVersion: String(row.agentVersion || properties.agentVersion || ""),
                kubernetesVersion: String(row.kubernetesVersion || properties.kubernetesVersion || ""),
            };
        });
    }
    if (section !== "advisor") throw new Error("Unknown data section.");
    return rows.map(row => {
        if (!resourceInScope(row.id, { ...settings, resourceGroupIds: null }) || !isArc(row.resourceId, settings)) throw new Error("Advisor recommendation is outside the selected Arc scope.");
        return Object.fromEntries(["id", "resourceId", "category", "impact", "problem", "solution"].map(key => [key, String(row[key] ?? "")]));
    });
}

export function filteredResources(state) {
    const f = state.filters;
    const lower = value => String(value ?? "").toLowerCase();
    return state.inventory.rows.filter(row => ARC_TYPES.includes(row.type)).filter(row =>
        (!f.search || lower(`${row.name} ${row.id} ${row.os}`).includes(lower(f.search))) &&
        ["type", "status", "resourceGroup", "location"].every(key => !f[key] || lower(row[key]) === lower(f[key])) &&
        (!f.resourceId || lower(row.id) === lower(f.resourceId)));
}

function machineInScope(id, settings) {
    return hasScope(settings) ? resourceInScope(id, settings) && /\/providers\/microsoft\.hybridcompute\/machines\/[^/]+$/i.test(id) : scopedMachine(id);
}

function normalizeEmm(result, settings) {
    const resources = argRows(result?.resources);
    const policies = argRows(result?.policies);
    const machines = new Map();
    const seen = new Set();
    const assignments = new Map();
    if (hasScope(settings)) {
        if (!Array.isArray(result.assignments)) throw new Error("EMM requires the verified subscription assignment mapping.");
        for (const entry of result.assignments) {
            if (typeof entry.subscriptionId !== "string" || !settings.subscriptionIds.some(id => id.toLowerCase() === entry.subscriptionId.toLowerCase()) ||
                typeof entry.assignmentId !== "string" ||
                !new RegExp(`^/subscriptions/${entry.subscriptionId}/providers/Microsoft\\.Authorization/policyAssignments/[^/]+$`, "i").test(entry.assignmentId) ||
                assignments.has(entry.subscriptionId.toLowerCase())) throw new Error("Invalid or duplicate EMM subscription assignment.");
            assignments.set(entry.subscriptionId.toLowerCase(), entry.assignmentId.toLowerCase());
        }
    } else assignments.set(SUBSCRIPTION, EMM_ASSIGNMENT_ID.toLowerCase());
    for (const row of resources) {
        const key = row.id?.toLowerCase();
        if (!key || seen.has(key)) throw new Error("Missing or duplicate EMM resource ID.");
        seen.add(key);
        const extension = row.type?.toLowerCase() === "microsoft.hybridcompute/machines/extensions";
        const parent = extension ? row.id.replace(/\/extensions\/[^/]+$/i, "") : row.id;
        if (!machineInScope(parent, settings) || (extension && parent === row.id) ||
            (!extension && row.type?.toLowerCase() !== "microsoft.hybridcompute/machines")) throw new Error("EMM resource is outside the configured Arc machine scope.");
        if (!extension) machines.set(key, { id: row.id, name: String(row.name), os: String(row.os ?? "").toLowerCase(), status: String(row.status || "Unknown"), policies: [], extensions: [] });
    }
    for (const row of resources.filter(row => row.type.toLowerCase().endsWith("/extensions"))) {
        const machine = machines.get(row.id.replace(/\/extensions\/[^/]+$/i, "").toLowerCase());
        if (!machine) throw new Error("EMM extension has no machine in the snapshot; reread the complete resource scope.");
        machine.extensions.push({ name: String(row.name), type: String(row.extensionType ?? ""), publisher: String(row.publisher ?? ""), state: String(row.provisioningState || "Unknown") });
    }
    const latest = new Map();
    for (const row of policies) {
        if (!machineInScope(row.resourceId, settings) || !row.assignmentId ||
            row.assignmentId.toLowerCase() !== assignments.get(row.resourceId.split("/")[2].toLowerCase()) ||
            typeof row.referenceId !== "string" || !row.referenceId || !/Z$|[+-]\d\d:\d\d$/.test(row.timestamp ?? "") || !Number.isFinite(Date.parse(row.timestamp))) {
            throw new Error("EMM policy evidence has an invalid scope, assignment, reference or UTC timestamp.");
        }
        if (!machines.has(row.resourceId.toLowerCase())) throw new Error("EMM policy has no machine in the snapshot; reread the complete resource scope.");
        const referenceId = row.referenceId.toLowerCase();
        const states = { compliant: "Compliant", noncompliant: "NonCompliant", exempt: "Exempt" };
        const state = states[String(row.state).toLowerCase()] ?? "Unknown";
        const policy = { referenceId, state, timestamp: new Date(row.timestamp).toISOString() };
        const key = `${row.resourceId.toLowerCase()}|${referenceId}`;
        const previous = latest.get(key);
        if (!previous || policy.timestamp > previous.policy.timestamp) latest.set(key, { resourceId: row.resourceId.toLowerCase(), policy });
        else if (policy.timestamp === previous.policy.timestamp && policy.state !== previous.policy.state) {
            previous.policy.state = [policy.state, previous.policy.state].includes("NonCompliant") ? "NonCompliant" : "Unknown";
        }
    }
    for (const { resourceId, policy } of latest.values()) machines.get(resourceId).policies.push(policy);
    return [...machines.values()];
}

export function emmSummary(snapshot, settings) {
    const rows = snapshot.rows;
    const services = emmServices.map(service => ({ key: service.key, label: service.label, compliant: 0, nonCompliant: 0, unknown: 0, exempt: 0 }));
    const issues = [
        { key: "policy", label: "Machines not compliant with EMM policy", machines: [] },
        { key: "extensions", label: "EMM agent extensions failed or missing", machines: [] },
        { key: "pending", label: "EMM agent extensions still provisioning", machines: [] },
        { key: "unknown", label: "Machines with unverified service policy compliance", machines: [] },
        { key: "agentUnknown", label: "Machines with unverified EMM agent status", machines: [] },
    ];
    const machines = rows.map(row => {
        const os = ["windows", "linux"].includes(row.os) ? row.os : null;
        const states = new Map(row.policies.map(policy => [policy.referenceId, policy.state]));
        const statuses = {};
        for (const [index, service] of emmServices.entries()) {
            const applicable = service.references.map(reference => os ? states.get(`${reference}-${os}`) ?? "Unknown" : "Unknown");
            const status = applicable.includes("NonCompliant") ? "nonCompliant" : applicable.includes("Unknown") ? "unknown" : applicable.includes("Exempt") ? "exempt" : "compliant";
            statuses[service.key] = status;
            services[index][status]++;
        }
        const required = os ? [
            { type: `AzureMonitor${os === "windows" ? "Windows" : "Linux"}Agent`, publisher: "Microsoft.Azure.Monitor" },
            { type: `ChangeTracking-${os === "windows" ? "Windows" : "Linux"}`, publisher: "Microsoft.Azure.ChangeTrackingAndInventory" },
        ] : [];
        const extensionFindings = os ? required.flatMap(expected => {
            const extensions = row.extensions.filter(extension => extension.type.toLowerCase() === expected.type.toLowerCase() && extension.publisher.toLowerCase() === expected.publisher.toLowerCase());
            if (!extensions.length) return [`${expected.type}: missing`];
            return extensions.filter(extension => extension.state.toLowerCase() !== "succeeded").map(extension => `${expected.type}: ${extension.state}`);
        }) : ["Agent requirements unverified: OS unknown"];
        const referenceStates = row.policies.map(policy => policy.state);
        if (referenceStates.includes("NonCompliant")) issues[0].machines.push(row.id);
        if (extensionFindings.some(finding => /: (missing|failed|canceled)$/i.test(finding))) issues[1].machines.push(row.id);
        if (extensionFindings.some(finding => /: (creating|updating|deleting|accepted|inprogress)$/i.test(finding))) issues[2].machines.push(row.id);
        if (Object.values(statuses).includes("unknown")) issues[3].machines.push(row.id);
        if (!os || extensionFindings.some(finding => !/: (missing|failed|canceled|creating|updating|deleting|accepted|inprogress)$/i.test(finding))) issues[4].machines.push(row.id);
        return { id: row.id, name: row.name, status: row.status, services: statuses, extensionFindings };
    });
    const times = rows.flatMap(row => row.policies.map(policy => policy.timestamp)).sort();
    return {
        resourceGroup: hasScope(settings) ? scopeLabel(settings) : EMM_RESOURCE_GROUP, total: rows.length, connected: rows.filter(row => row.status.toLowerCase() === "connected").length,
        services: services.map(service => ({ ...service, percent: rows.length ? 100 * service.compliant / rows.length : null })),
        issues, machines, evaluatedFrom: times[0] ?? null, evaluatedTo: times.at(-1) ?? null,
    };
}

function normalizeMachineConfiguration(result, settings) {
    const machines = new Map();
    for (const row of normalize("inventory", result?.resources, settings)) {
        const key = row.id.toLowerCase();
        if (!machineInScope(row.id, settings) || row.type !== "microsoft.hybridcompute/machines" || machines.has(key)) {
            throw new Error("Machine Configuration contains a duplicate or out-of-scope Arc server.");
        }
        machines.set(key, { id: row.id, name: row.name, status: row.status, os: row.os, policies: [] });
    }
    const latest = new Map();
    for (const row of argRows(result?.policies)) {
        if (!machineInScope(row.resourceId, settings) || !machines.has(row.resourceId.toLowerCase()) ||
            !["guest configuration", "machine configuration"].includes(String(row.category).toLowerCase()) ||
            typeof row.definitionId !== "string" || !/\/providers\/microsoft\.authorization\/policydefinitions\/[^/]+$/i.test(row.definitionId) ||
            typeof row.assignmentId !== "string" || !/\/providers\/microsoft\.authorization\/policyassignments\/[^/]+$/i.test(row.assignmentId) ||
            !/Z$|[+-]\d\d:\d\d$/.test(row.timestamp ?? "") || !Number.isFinite(Date.parse(row.timestamp))) {
            throw new Error("Machine Configuration policy has an invalid server scope, category, definition, assignment or UTC timestamp.");
        }
        const states = { compliant: "Compliant", noncompliant: "NonCompliant", exempt: "Exempt", notapplicable: "NotApplicable" };
        const policy = {
            resourceId: row.resourceId.toLowerCase(), definitionId: row.definitionId.toLowerCase(),
            assignmentId: row.assignmentId.toLowerCase(), referenceId: String(row.referenceId ?? "").toLowerCase(),
            displayName: String(row.displayName || row.definitionId.split("/").pop()),
            state: states[String(row.state).toLowerCase()] ?? "Unknown", timestamp: new Date(row.timestamp).toISOString(),
        };
        const key = JSON.stringify([policy.resourceId, policy.assignmentId, policy.definitionId, policy.referenceId]);
        const previous = latest.get(key);
        if (!previous || policy.timestamp > previous.timestamp) latest.set(key, policy);
        else if (policy.timestamp === previous.timestamp && policy.state !== previous.state) {
            previous.state = [policy.state, previous.state].includes("NonCompliant") ? "NonCompliant" : "Unknown";
        }
    }
    for (const policy of latest.values()) {
        const { resourceId, ...evidence } = policy;
        machines.get(resourceId).policies.push(evidence);
    }
    return [...machines.values()];
}

export function machineConfigurationSummary(snapshot, settings) {
    const counts = { compliant: 0, nonCompliant: 0, unknown: 0, exempt: 0, notApplicable: 0, unassessed: 0 };
    const evaluations = { compliant: 0, nonCompliant: 0, unknown: 0, exempt: 0, notApplicable: 0 };
    const keys = { Compliant: "compliant", NonCompliant: "nonCompliant", Unknown: "unknown", Exempt: "exempt", NotApplicable: "notApplicable" };
    const machines = snapshot.rows.map(machine => {
        const states = machine.policies.map(policy => policy.state);
        for (const state of states) evaluations[keys[state]]++;
        const compliance = !states.length ? "unassessed" : states.includes("NonCompliant") ? "nonCompliant" :
            states.includes("Unknown") ? "unknown" : states.includes("Exempt") ? "exempt" :
            states.includes("Compliant") ? "compliant" : "notApplicable";
        counts[compliance]++;
        return { ...machine, compliance };
    });
    const times = snapshot.rows.flatMap(machine => machine.policies.map(policy => policy.timestamp)).sort();
    return {
        resourceGroup: hasScope(settings) ? scopeLabel(settings) : EMM_RESOURCE_GROUP, total: machines.length, counts, evaluations, machines,
        evaluatedFrom: times[0] ?? null, evaluatedTo: times.at(-1) ?? null,
    };
}

export function refreshPlan(settings) {
    if ("subscriptionIds" in settings) validateScope(settings);
    const monitoring = settings.workspaceId ? monitoringPlan(settings) : { source: "unconfigured" };
    const types = [...ARC_TYPES, "microsoft.operationalinsights/workspaces", "microsoft.monitor/accounts"].map(type => `'${type}'`).join(",");
    const scope = hasScope(settings) ? scopePredicate(settings) : `subscriptionId == '${SUBSCRIPTION}'`;
    return {
        ...scopedPlans(settings),
        ...(hasScope(settings) ? { subscriptionIds: settings.subscriptionIds, resourceGroupIds: settings.resourceGroupIds } : {}),
        inventoryQuery: `Resources | where ${scope} | where type in~ (${types}) | project id,name,type,location,resourceGroup,status=coalesce(tostring(properties.connectivityStatus),tostring(properties.status)),os=tostring(properties.osType),agentVersion=tostring(properties.agentVersion),kubernetesVersion=tostring(properties.kubernetesVersion)`,
        advisorQuery: `AdvisorResources | where type =~ 'microsoft.advisor/recommendations' | extend resourceId=tostring(properties.resourceMetadata.resourceId) | where ${hasScope(settings) ? scopePredicate(settings, "resourceId") : scope} | where tolower(resourceId) contains '/microsoft.hybridcompute/' or tolower(resourceId) contains '/microsoft.kubernetes/' or tolower(resourceId) contains '/microsoft.azurearcdata/' or tolower(resourceId) contains '/microsoft.connectedvmwarevsphere/' or tolower(resourceId) contains '/microsoft.scvmm/' | project id,resourceId,category=tostring(properties.category),impact=tostring(properties.impact),problem=tostring(properties.shortDescription.problem),solution=tostring(properties.shortDescription.solution)`,
        monitoring,
        workspaceId: settings.workspaceId, hours: settings.hours,
    };
}

export function monitoringSource(workspaceId) {
    if (typeof workspaceId === "string" && /^\/subscriptions\/[0-9a-f-]{36}\/resourceGroups\/[^/]+\/providers\/microsoft\.monitor\/accounts\/[^/]+$/i.test(workspaceId)) return "prometheus";
    if (typeof workspaceId === "string" && /^\/subscriptions\/[0-9a-f-]{36}\/resourceGroups\/[^/]+\/providers\/microsoft\.operationalinsights\/workspaces\/[^/]+$/i.test(workspaceId)) return "logs";
    throw new Error("Select an Azure Monitor or Log Analytics workspace resource ID.");
}

export function monitoringPlan(settings, now = Date.now()) {
    const source = monitoringSource(settings.workspaceId);
    if (![1, 6, 24, 168].includes(settings.hours)) throw new Error("Unsupported monitoring window.");
    if (source === "logs") return {
        source, metricsResourceId: `${settings.workspaceId}/api/query`, apiVersion: "2020-08-01",
        queryParameters: { timespan: `PT${settings.hours}H`, query: monitoringQuery(settings.hours, settings) },
    };
    const resource = '"microsoft.resourceid"';
    const ids = hasScope(settings) ? validateScope(settings).subscriptionIds : [SUBSCRIPTION];
    const subscriptionSelector = ids.length === 1 ? `"microsoft.subscriptionid"="${ids[0].toLowerCase()}"` : `"microsoft.subscriptionid"=~"(?i:${ids.join("|")})"`;
    const regexEscape = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const groupSelector = hasScope(settings) && settings.resourceGroupIds !== null ?
        `,"microsoft.resourceid"=~${JSON.stringify(`(?i:(${settings.resourceGroupIds.map(regexEscape).join("|")})/.*)`)}` : "";
    const selector = name => `__name__="${name}",${subscriptionSelector},"microsoft.resourcetype"="microsoft.hybridcompute/machines"${groupSelector}`;
    const sum = expression => `sum by (${resource}) (${expression})`;
    const cpu = selector("system.cpu.time");
    const memory = selector("system.memory.usage");
    const end = Math.floor(now / 1000);
    return {
        source, configurationResourceId: EMM_PLAN.configurationResourceId, configurationApiVersion: EMM_PLAN.configurationApiVersion,
        workspaceResourceId: settings.workspaceId, apiVersion: "2023-04-03",
        endpointProperty: "properties.metrics.prometheusQueryEndpoint", path: "/api/v1/query_range",
        tokenResource: "https://prometheus.monitor.azure.com",
        start: end - settings.hours * 3600, end, step: { 1: 120, 6: 600, 24: 1800, 168: 14400 }[settings.hours],
        queries: {
            cpu: `100 * (1 - ${sum(`rate({${cpu},state="idle"}[5m])`)} / ${sum(`rate({${cpu}}[5m])`)})`,
            memory: `100 * (1 - ${sum(`{${memory},state="free"}`)} / ${sum(`{${memory}}`)})`,
            network: `sum by (${resource}, direction) (rate({${selector("system.network.io")}}[5m])) / 1024`,
            disk: `sum by (${resource}, direction) (rate({${selector("system.disk.io")}}[5m])) / 1024`,
        },
    };
}

export function monitoringQuery(hours, settings) {
    const bin = hours === 1 ? "2m" : hours === 6 ? "10m" : hours === 24 ? "30m" : "4h";
    const scope = hasScope(settings) ? scopePredicate(settings, "_ResourceId") : `tolower(_ResourceId) startswith '/subscriptions/${SUBSCRIPTION}/'`;
    return `let p = Perf
| where TimeGenerated > ago(${hours}h)
| where ${scope}
| where tolower(_ResourceId) contains '/microsoft.hybridcompute/machines/'
| extend metric=case(ObjectName in ('Processor','Processor Information') and CounterName == '% Processor Time' and InstanceName == '_Total','cpu',
ObjectName == 'Memory' and CounterName in ('% Committed Bytes In Use','% Used Memory'),'memory',
ObjectName in ('Network Interface','Network') and CounterName in ('Bytes Sent/sec','Bytes Received/sec'),'network',
ObjectName in ('LogicalDisk','Logical Disk') and InstanceName == '_Total' and CounterName in ('Disk Read Bytes/sec','Disk Write Bytes/sec'),'disk','')
| where metric != ''
| extend series=CounterName, unit=iff(metric in ('cpu','memory'),'%','KiB/s'), value=iff(metric in ('cpu','memory'),CounterValue,CounterValue/1024.0)
| summarize value=sum(value) by resourceId=tolower(_ResourceId),metric,series,unit,TimeGenerated
| summarize value=avg(value) by resourceId,metric,series,unit,['time']=bin(TimeGenerated,${bin});
let i = InsightsMetrics
| where TimeGenerated > ago(${hours}h) and Origin == 'vm.azm.ms'
| where ${scope}
| where tolower(_ResourceId) contains '/microsoft.hybridcompute/machines/'
| extend metric=case(Namespace == 'Processor' and Name == 'UtilizationPercentage','cpu',
Namespace == 'Memory' and Name == 'AvailableMB','memory',
Namespace == 'Network' and Name in ('ReadBytesPerSecond','WriteBytesPerSecond'),'network',
Namespace == 'LogicalDisk' and Name in ('ReadBytesPerSecond','WriteBytesPerSecond'),'disk','')
| where metric != ''
| extend totalMemory=todouble(todynamic(Tags)['vm.azm.ms/memorySizeMB'])
| where metric != 'memory' or totalMemory > 0
| extend series=iff(metric == 'memory','VM Insights physical memory used',strcat('VM Insights ',Namespace,' ',Name)),unit=iff(metric in ('cpu','memory'),'%','KiB/s'),
value=case(metric == 'memory',100.0*(1.0-Val/totalMemory),metric in ('network','disk'),Val/1024.0,Val)
| summarize value=sum(value) by resourceId=tolower(_ResourceId),metric,series,unit,TimeGenerated
| summarize value=avg(value) by resourceId,metric,series,unit,['time']=bin(TimeGenerated,${bin});
union isfuzzy=true p,i
| project resourceId,metric,series,['time'],value,unit
| order by resourceId asc,metric asc,series asc,['time'] asc
| take 50001`;
}
