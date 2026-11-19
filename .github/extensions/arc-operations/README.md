# Azure Arc operations canvas

Project-shared Copilot extension. The host supplies `@github/copilot-sdk`; no install/build step is needed. Reload extensions and open canvas **arc-operations** with an instance ID and empty input `{}`. The saved dashboard title is returned on open.

See the [root DASHBOARD_README](../../../DASHBOARD_README.md) for configuration and usage, and [recreation prompt](../../../DASHBOARD_PROMPT.md) for the complete feature specification.

## Structure

- `extension.mjs`: canvas/actions, authenticated loopback HTTP server, Azure CLI scope discovery, serialized atomic local persistence, session requests and refresh timer.
- `model.mjs`: scope validation/resolution, queries, normalization, summaries and checklist plans. Legacy constants/default arguments exist for migration/backward compatibility; runtime retrieval always supplies explicit resolved settings.
- `dashboard.html` / `dashboard.js`: accessible settings form, inventory/Advisor, performance charts, checklist panels and their separate reviews. Clawpilot light/dark palette, saved App/system/Light/Dark preference, live system changes and optional `clawpilotTheme` preview override.
- `model.test.mjs` / `extension.test.mjs`: scoped model and mocked SDK/server/process integration coverage.

## Scope and settings

`settings.title` is a trimmed 1-120 character string. `settings.subscriptionIds` and `settings.resourceGroupIds` are either `null` (all) or nonempty, deduplicated arrays. Subscriptions are UUIDs; groups use full `/subscriptions/<id>/resourceGroups/<name>` IDs, never ambiguous names.

`POST /scope-options` with `{subscriptionsOnly:true}` loads enabled choices from the signed-in `az account list` catalog. With `{subscriptionIds:null|[UUID,...]}` it also reads complete group lists using `az group list --subscription <id>`. The UI separates **Load subscriptions** from on-demand **Load resource groups**, avoiding expensive enumeration when all groups are wanted. Only validated UUIDs enter command arguments. No CLI current-subscription changes or credentials are persisted. Failures/timeouts/invalid output are explicit, preserving the previous catalog for that stage; successful subscription choices remain available if a subsequent group read fails. `scopeOptions` records catalog/group timestamps and the group selection's loaded subscription IDs. Refresh the CLI catalog separately after access changes; do not force cross-tenant token refresh on every picker load.

`POST /settings` accepts `title`, `subscriptionIds`, `resourceGroupIds`, `workspaceId` and `hours`. Scope selections must be members of the discovered catalog and groups must belong to selected subscriptions. Monitoring supports a full Azure Monitor account or Log Analytics workspace ID, including readable cross-subscription destinations; empty means unconfigured. Hours are 1, 6, 24 or 168. Settings/discovery are blocked while a request is pending.

All subscriptions resolve from the last successful catalog at request time. Every job captures immutable resolved settings; its ARG calls must use those subscription IDs and the supplied resource-group predicates. Queries and published evidence enforce the same scope in every panel. Monitoring queries filter server identities even if the telemetry workspace is outside inventory scope.

Scope changes clear snapshots, reviews, filters, checklist review marks and previous job state. Title-only changes preserve evidence. Discovery invalidates snapshots when an all-subscriptions scope changes or selected subscriptions become inaccessible. Never display old group-specific evidence as coverage of a new estate.

### Configuring placeholder values

[model.mjs](model.mjs) contains no tenant-specific subscription or workspace IDs. Its `REPLACE_ME_WITH_...` tokens identify each required subscription ID, resource-group name and workspace name:

- `DEFAULT_WORKSPACE` is a `Microsoft.Monitor/accounts` Azure Monitor workspace for Prometheus.
- `LOG_ANALYTICS_WORKSPACE` is a `Microsoft.OperationalInsights/workspaces` Log Analytics workspace for log-based telemetry.
- `LEGACY_DEFAULT_WORKSPACE` is an optional old Log Analytics default for migration matching, not another required telemetry source.
- `SUBSCRIPTION`, `APPLICATION_RESOURCE_GROUP` and `EMM_RESOURCE_GROUP` configure legacy single-subscription helpers, not the normal resolved canvas scope.

Workspace IDs have independent subscription placeholders to support cross-subscription monitoring. Leave unused placeholders unchanged. Normal users should use Settings and task 1's workspace field instead of editing source. Replacing `DEFAULT_WORKSPACE` configures the legacy default/migration target, not automatic monitoring for fresh profiles. Migration preserves saved workspace choices while the default is unresolved. The built-in ManagedOps policy-set definition ID and provider resource paths are Azure platform identifiers, not tenant configuration; do not replace them.

Sample discovery prompt:

```text
Using read-only Azure CLI and ARM MCP, help me configure arc-operations for
<subscription name or ID>. Confirm its ID, list Azure Monitor and Log Analytics
workspaces with their full resource IDs, and inspect any existing ManagedOps
azureMonitorInsights.azureMonitorWorkspaceId destination. Verify which candidate
contains Arc-server performance telemetry; do not substitute Change Tracking logs.
Ask me to choose when ambiguous and report access or telemetry gaps explicitly.
Show the Settings scope and task 1 workspace ID. If I ask to configure model.mjs,
show exact replacements for the relevant REPLACE_ME_WITH_... tokens, including
the workspace's own subscription/group/name. Leave unused and legacy tokens alone.
Do not edit files or change Azure resources without my approval.
```

See the [dashboard workspace guide](../../../DASHBOARD_README.md#workspace-placeholders-and-discovery) for the full setup workflow. Reload extensions after any source configuration changes.

## Canvas actions

| Action | Contract |
| --- | --- |
| `get_state` | Current settings/catalog, snapshots, computed summaries, checklist plans, filters, per-panel responses, job and timer status. |
| `get_refresh_plan` | Scoped inventory/Advisor/assessment/application/security queries, EMM/Machine Configuration evidence plans, resolved scope and monitoring instructions. Requires a nonempty resolved subscription scope. |
| `set_filters` | Exact string filters except substring `search`; empty strings clear. Include `requestId` for a queued request. These are view filters, not dashboard scope. |
| `publish_data` | Complete evidence via `result` or a JSON `filePath` staged beneath the current session's `files\arc-imports`. Include pending `requestId`; canceled/completed/replaced IDs are rejected. Maximum 50,000 normalized rows. |
| `complete_request` | `requestId`, `answer`, optional per-section `errors`. Refresh requires publication or an explicit error for all eight sections. Stores the answer in its originating panel, without auto-completing checklist items. |
| `request_refresh` | Queue read-only work through the current SDK session, using saved resolved settings. |

The eight publication sections are `inventory`, `advisor`, `metrics`, `upgradeAssessments`, `appDeployments`, `emm`, `machineSecurity` and `machineConfiguration`. ARG inputs use `{isSuccessful:true,results:{data:[...]},totalRecords:N}`; follow every `skipToken`/`nextLink` and combine complete results before publishing. Failed/incomplete publication preserves previous same-scope evidence.

- Metrics: provide matching `workspaceId`/`hours`. Prometheus requires unchanged raw `{source:"prometheus",cpu,memory,network,disk}` success matrices from `query_range`. Warnings, incomplete queries, non-finite samples, unsupported units/identities and partial query errors fail. Log Analytics tables require `resourceId,metric,series,time,value,unit`. Missing telemetry is not zero usage.
- Prometheus retrieval: read the selected account's `properties.metrics.prometheusQueryEndpoint` with ARM API `2023-04-03`; require HTTPS under `.prometheus.monitor.azure.com`. Query with signed-in `az rest --resource https://prometheus.monitor.azure.com`, using `--url-parameters @<JSON file>` containing `query,start,end,step`. Use the same bounded range/step for all four counters. Never copy tokens or substitute Change Tracking logs.
- EMM: `{resources:<ARG>,policies:<ARG>,assignments:[{subscriptionId,assignmentId}]}`. Read each subscription's ManagedOps configuration to discover the actual initiative assignment; verify the initiative/service reference mapping. Filter policy rows to those verified assignments. A confirmed missing configuration gives unknown compliance, not a pass; other read failures are explicit errors. Assignment IDs must match their selected subscriptions.
- Machine Configuration: `{resources:<ARG>,policies:<ARG>}`. Machine scope and definition categories are validated; latest machine/assignment/definition/reference evaluations are aggregated. Unknown/exempt/not-applicable/unassessed remain distinct.
- App deployments: selected-scope catalog plus deployments on selected servers, matching full gallery/application/version IDs case-insensitively. External package references can be retained as identifiers, not fetched as in-scope catalog. Reported version takes precedence over requested version; unresolved `latest` is never guessed. Use read-only ARM lists/instance views if ARG does not expose evidence.
- Kubernetes: existing `KubernetesConfigurationResources` upgrade assessments only; never generate an assessment or start upgrades.

## Runtime and persistence

The server binds only to `127.0.0.1` with an ephemeral port and random per-panel token. It validates Host, token and mutation Origin, hashes the inline theme script for CSP, disables caching and loads no remote assets. The Windows Edge launcher only opens the fixed EMM URL with a discovered Edge executable, never caller-supplied commands/URLs.

Serialized writes use temporary files and atomic rename at `$COPILOT_HOME\extensions\arc-operations\artifacts\dashboard.json`; default home is `~\.copilot`. The old Caldova file is read only when the generalized file is absent and is never overwritten. Narrow legacy snapshots/reviews are invalidated during migration; compatible evidence and preferences survive. One user-local dashboard is shared across instances; avoid simultaneous editing from separate conversations.

One extension-owned refresh timer supports Manual/5/30/60 minutes while any canvas instance remains open, including when unfocused. It skips pending requests and reports enqueue failures. It does not grant tool permissions or run a separate model session. Cancellation rejects late publication without retracting queued turns.

## Checks

Run on Node 24+:

```powershell
node --test .github\extensions\arc-operations\model.test.mjs .github\extensions\arc-operations\extension.test.mjs
```

Integration tests mock SDK, Azure CLI discovery and Edge and use temporary local state; they do not access Azure. Verify runtime rendering by reloading extensions and opening `arc-operations`; native canvas action names and input schemas remain host-validated.
