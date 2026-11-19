# Azure Arc operations dashboard

A configurable GitHub Copilot canvas for reviewing Azure Arc inventory, performance, Advisor recommendations and an ordered operations checklist. The former Caldova-only dashboard now supports any accessible subscription scope.

The dashboard runs through the repository's `arc-operations` extension, not as a standalone website. The host supplies the SDK; no package installation or separate web server is required.

> Azure access is read-only. The dashboard never deploys applications, upgrades clusters, remediates findings or changes Azure settings. Marking a checklist item reviewed records human review, not verified health or compliance.

## Prerequisites

- GitHub Copilot with repository extensions and canvases enabled for this repository.
- Azure Resource Manager MCP configured in `.mcp.json`, signed in with read access to the selected resources.
- Azure CLI (`az`) installed and signed in to the intended account. Scope discovery uses `az account list` and `az group list --subscription`; use the same Azure identity/tenant access as ARM MCP. Subscription and group discovery never changes the CLI's current subscription.
- For performance charts, query access to an Azure Monitor workspace or Log Analytics workspace containing the selected servers' telemetry. Prometheus queries use authenticated `az rest`; no credentials are copied into the dashboard.
- Microsoft Edge on Windows for the external **Open EMM dashboard in Edge** action.

## Open and configure

1. Ask Copilot: **"Reload the repository extensions and open the arc-operations canvas."**
2. Expand **Settings** and select **Load subscriptions**. This reads enabled subscriptions from the signed-in Azure CLI catalog without forcing a slow cross-tenant token refresh.
3. Keep **All accessible subscriptions**, or uncheck it and select one or several subscriptions.
4. Keep **All resource groups in selected subscriptions**. For specific groups, select **Load resource groups**, uncheck the all-groups box, and select one or several groups. Reload groups after changing subscriptions. Labels include the subscription name and ID, so identical group names remain distinct. Use Ctrl/Cmd or Shift for multi-selection.
5. Set the **Dashboard title**, then **Save settings**. Select **Refresh data** in Overview.
6. In checklist task 1, select or enter a monitoring workspace resource ID and time window. Workspaces found in inventory appear as suggestions; a readable cross-subscription workspace is also supported. Refresh after changing it.

New dashboards default to all accessible subscriptions/all groups with the title **Azure Arc operations**, but retrieve nothing until scopes are loaded. No tenant-specific monitoring workspace is assumed. Without a configured workspace, refresh can still retrieve the other seven sections and reports an explicit metrics error.

Settings apply to **every evidence panel**. They are separate from Overview's search/type/status/group/region filters. Changing the saved subscription or resource-group selection clears cached evidence, Copilot responses, overview filters and review marks to prevent mixed-scope results. Title-only changes preserve them. Wait for or cancel an active request before changing scope or monitoring settings.

**All accessible subscriptions** resolves against the last successfully loaded CLI catalog. After access changes, refresh the CLI catalog with `az account list --refresh` (or sign in again), then load subscriptions again. Discovery errors are shown explicitly rather than silently using an empty list. Group enumeration is on demand, so loading hundreds of subscriptions does not require querying all their groups. Group choices apply to the subscription selection used for their most recent load.

### Workspace placeholders and discovery

The constants in [model.mjs](.github/extensions/arc-operations/model.mjs) use descriptive `REPLACE_ME_WITH_...` placeholders instead of tenant-specific resource IDs:

- `DEFAULT_WORKSPACE`: the full **Azure Monitor workspace** ID (`Microsoft.Monitor/accounts`) used for Prometheus performance metrics. Supply its subscription ID, resource-group name and workspace name.
- `LOG_ANALYTICS_WORKSPACE`: the full **Log Analytics workspace** ID (`Microsoft.OperationalInsights/workspaces`) for the supported log-based telemetry source. Supply its subscription ID, resource-group name and workspace name. A Change Tracking destination is not automatically a performance telemetry source.
- `LEGACY_DEFAULT_WORKSPACE`: an optional former Log Analytics default, used only to recognize old saved settings. Leave its placeholders unchanged unless migrating a known previous default.
- `SUBSCRIPTION`, `APPLICATION_RESOURCE_GROUP` and `EMM_RESOURCE_GROUP`: the Arc inventory subscription ID, application-gallery resource group and Arc-server resource group for legacy single-subscription helpers. Normal canvas requests use the scope selected in Settings instead.

For normal use, **no source edits are required**: select subscriptions/groups in Settings and paste the discovered workspace's full resource ID into task 1. Workspace subscriptions may differ from inventory subscriptions if you have read access. Replace constants only when configuring legacy helpers or a repository-specific default; replace every component of the chosen workspace ID, then reload extensions. Unresolved workspace placeholders are rejected as invalid IDs, and migration does not replace a saved workspace with an unresolved default. Fresh profiles still start with monitoring unconfigured.

Sample Copilot prompt (replace the angle-bracketed input):

```text
Help configure the arc-operations canvas for subscription <subscription name or ID>.
Use only read-only Azure CLI and ARM MCP operations. Confirm the subscription ID
and list its Azure Monitor workspaces (Microsoft.Monitor/accounts) and Log Analytics
workspaces (Microsoft.OperationalInsights/workspaces), including full resource IDs.
Inspect the existing ManagedOps configuration, if present, for
properties.desiredConfiguration.azureMonitorInsights.azureMonitorWorkspaceId.
Identify which workspace actually receives performance telemetry for my Arc servers;
do not assume that a Change Tracking workspace contains performance data.
Ask me to choose if there are multiple candidates, and report missing access or
telemetry rather than inventing values. Show the subscription/group selections and
the exact workspace resource ID to enter in task 1.
If I request source configuration, show the matching replacements for the
REPLACE_ME_WITH_... tokens in .github/extensions/arc-operations/model.mjs,
including any different workspace subscription. Leave unused and legacy workspace
placeholders alone. Do not edit files or change Azure resources without my approval.
```

## Refresh and explore

Refresh queues read-only work in the current Copilot conversation. Keep it available and approve required tool permissions. Every section must publish complete evidence or report an explicit error. An unloaded/empty dashboard is not proof of health.

**Data refresh** defaults to **Manual**, with saved **5 min**, **30 min** and **60 min** intervals. One extension-owned timer runs while any canvas instance is open, including when unfocused. It skips busy intervals rather than building a backlog. Opening the canvas, reloading the extension or changing the interval starts a fresh interval, not an immediate refresh. Closing the final canvas stops it. Background refreshes consume model usage and may require permissions.

Overview includes estate counts, connected-resource inventory and Azure Advisor. Inventory covers Arc servers, Kubernetes, SQL Server instances, VMware VMs and SCVMM VMs. Use **Focus** beside a resource, **Clear filters**, **Ask Copilot**, or **Apply as filter**. Advisor recommendations and performance samples must reference in-scope Arc resources.

Each checklist task has its own expandable panel, **Review with Copilot**, follow-up questions and saved response:

| Task | Evidence and behavior |
| --- | --- |
| Performance | CPU, memory, network and disk charts; workspace and 1h/6h/24h/7d controls; telemetry coverage. Prometheus CPU/I/O use rolling 5-minute rates, memory is physical non-free percentage including cache. Log Analytics retains its KQL counter definitions. Charts show at most eight resource/counter series. |
| EMM | Monitoring, Update Manager, Machine Configuration and Change Tracking compliance, issue counts and machine-level evidence. Discover each subscription's actual ManagedOps initiative assignment; never assume a particular assignment name. Missing EMM configuration/evaluations remain unknown. Opens the EMM flight in external Edge. |
| Kubernetes upgrades | Existing Arc upgrade assessments, target/current versions, component compatibility, readiness checks, deprecated APIs, freshness and coverage. Never generate an assessment or start an upgrade. |
| App Deployments | Gallery applications/versions in the saved scope and applications deployed on selected Arc servers. Select a server or version to highlight matches. External package references remain visible as identifiers without fetching out-of-scope catalogs. |
| TPM and agent upgrades | Linked servers with reported TPM-backed Arc identity (`identityKeyStore = Tpm`), TPM readiness and configured automatic agent upgrades. Hardware presence alone is not TPM-backed identity; upgrade configuration is not proof of successful upgrades. |
| Machine Configuration | Server-status compliance graphic and per-policy evidence from Guest Configuration/Machine Configuration definitions only. Missing, unknown and exempt evaluations remain separate. Identify actual Linux CIS evidence instead of relabeling another baseline. |
| Defender posture | Copilot-assisted review of existing Defender findings and coverage; missing assessments never establish health. |

Overview filters affect inventory, Advisor, performance and Kubernetes assessments. Application deployments, EMM, TPM and Machine Configuration remain independent of those filters, but always respect the saved subscription/group settings.

**Mark reviewed** is manual. **Clear result** clears only the originating panel's Copilot reply, not evidence, settings or progress. Cancellation rejects late results but cannot retract an already queued Copilot turn.

## Interpret results safely

- Missing telemetry, stale snapshots, partial results and failed retrievals are not zero usage or compliance. Failures preserve the previous same-scope snapshot with explicit errors and timestamps.
- Application evidence distinguishes requested versions from reported installed versions; unresolved `latest`, failed, pending and unverified installs are never reported as verified success.
- EMM percentages count fully policy-compliant machines / all machines in the saved scope, not policy rows. Exemptions and extension provisioning are separate from failure; extension presence does not establish policy compliance. This is not a reproduction of the portal's subscription-wide EMM Policy Score.
- Machine Configuration aggregates latest evaluations by machine/assignment/definition/reference. All reported checks compliant does not prove complete coverage, current guest health or CIS compliance.
- Some portal reviews and monitoring workspaces require additional read permissions. Copilot must identify evidence gaps instead of inferring success.

## Local persistence

Snapshots, scope choices, title, responses, filters, checklist, appearance, monitoring preferences and refresh interval persist at:

```text
%USERPROFILE%\.copilot\extensions\arc-operations\artifacts\dashboard.json
```

`COPILOT_HOME` replaces `%USERPROFILE%\.copilot` when set. State is user-local and shared across canvas instances, not stored per panel. Avoid simultaneous edits from multiple Copilot conversations. No inventory or telemetry is bundled in source.

The previous Caldova subscription file is imported once if `dashboard.json` does not exist, retaining its title, subscription selection, appearance, monitoring choice and compatible snapshots. Old group-specific EMM, Machine Configuration and application snapshots, saved responses and review marks are invalidated because those panels now share the dashboard-wide scope. The legacy file is left untouched.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Canvas unavailable | Enable repository extensions, reload, then open `arc-operations`. |
| Scope discovery fails | Check Azure CLI installation, sign-in and subscription/group read permissions. Load scopes again after changing accounts/access. |
| Request remains queued | Check the current conversation for pending work, tool permissions or MCP sign-in. Wait or cancel. |
| Empty charts | Configure a readable workspace with telemetry for selected servers, then refresh; missing telemetry is not zero usage. |
| Section error | Resolve the reported query/access problem, then retry. Check retained snapshot timestamps. |
| EMM will not open | The launcher requires Windows and Edge; open the displayed EMM link in Edge manually. |

## Repository

Implementation and tests live in [`.github/extensions/arc-operations`](.github/extensions/arc-operations). See its [README](.github/extensions/arc-operations/README.md) for action contracts and local checks.

[DASHBOARD_PROMPT.md](DASHBOARD_PROMPT.md) contains a reusable prompt to recreate this dashboard without tenant-specific IDs.
