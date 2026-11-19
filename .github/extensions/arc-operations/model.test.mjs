import test from "node:test";
import assert from "node:assert/strict";
import { SUBSCRIPTION, DEFAULT_WORKSPACE, LOG_ANALYTICS_WORKSPACE, EMM_URL, EMM_RESOURCE_GROUP, EMM_ASSIGNMENT_ID, APPLICATION_RESOURCE_GROUP, initialState, migrateState, recordReview, taskReviewPlan, normalize, filteredResources, refreshPlan, monitoringPlan, emmSummary, machineConfigurationSummary, validateScope, effectiveSettings, resourceInScope } from "./model.mjs";

const id = `/subscriptions/${SUBSCRIPTION}/resourceGroups/demo/providers/Microsoft.HybridCompute/machines/server1`;
const arg = rows => ({ isSuccessful: true, results: { data: rows }, totalRecords: rows.length });
test("resolves all accessible subscriptions and scopes every query to full resource-group identities", () => {
    const state = initialState();
    const second = "11111111-2222-3333-4444-555555555555";
    state.scopeOptions.subscriptions = [{ id: SUBSCRIPTION }, { id: second }];
    const settings = effectiveSettings(state);
    assert.deepEqual(settings.subscriptionIds, [SUBSCRIPTION, second]);
    assert.equal(refreshPlan(settings).monitoring.source, "unconfigured");
    settings.resourceGroupIds = [`/subscriptions/${second}/resourceGroups/shared`];
    settings.workspaceId = DEFAULT_WORKSPACE;
    const plan = refreshPlan(settings);
    for (const query of [plan.inventoryQuery, plan.advisorQuery, plan.upgradeAssessmentsQuery, plan.appDeploymentsQuery,
        plan.machineSecurityQuery, plan.emm.resourcesQuery, plan.emm.policiesQuery,
        plan.machineConfiguration.resourcesQuery, plan.machineConfiguration.policiesQuery]) {
        assert.ok(query.includes(SUBSCRIPTION) && query.includes(second));
        assert.ok(query.includes(settings.resourceGroupIds[0].toLowerCase()));
        assert.ok(!query.includes("arc-breakout"));
    }
    for (const query of Object.values(plan.monitoring.queries)) {
        assert.ok(query.includes(`${SUBSCRIPTION}|${second}`));
        assert.ok(query.includes(`(?i:(/subscriptions/${second}/resourceGroups/shared)/.*)`));
    }
    const logPlan = refreshPlan({ ...settings, workspaceId: LOG_ANALYTICS_WORKSPACE });
    assert.ok(logPlan.monitoring.queryParameters.query.includes(settings.resourceGroupIds[0].toLowerCase()));
    assert.deepEqual(taskReviewPlan(2, settings).queries, plan.emm);
    assert.deepEqual(taskReviewPlan(6, settings).queries, plan.machineConfiguration);
    assert.equal(taskReviewPlan(4, settings).query, plan.appDeploymentsQuery);
    assert.throws(() => refreshPlan(state.settings), /accessible subscription/);
    for (const invalid of [
        { subscriptionIds: [] }, { subscriptionIds: ["bad; command"] }, { subscriptionIds: [second, second.toUpperCase()] },
        { resourceGroupIds: [] }, { resourceGroupIds: [`/subscriptions/${SUBSCRIPTION}/resourceGroups/other`] },
        { resourceGroupIds: [`/subscriptions/${second}/resourceGroups/shared' | take 1`] },
    ]) assert.throws(() => validateScope({ subscriptionIds: [second], resourceGroupIds: null, ...invalid }));
});
test("accepts selected subscriptions while rejecting same-name groups and every out-of-scope evidence type", () => {
    const second = "11111111-2222-3333-4444-555555555555";
    const group = `/subscriptions/${second}/resourceGroups/shared`;
    const settings = { subscriptionIds: [SUBSCRIPTION, second], resourceGroupIds: [group] };
    const machine = { id: `${group}/providers/Microsoft.HybridCompute/machines/server1`, name: "server1", type: "microsoft.hybridcompute/machines" };
    assert.equal(resourceInScope(machine.id.toUpperCase(), settings), true);
    const outside = machine.id.replace(second, SUBSCRIPTION);
    assert.equal(resourceInScope(outside, settings), false);
    assert.equal(normalize("inventory", arg([machine]), settings).length, 1);
    assert.equal(normalize("machineSecurity", arg([machine]), settings).length, 1);
    assert.equal(normalize("machineConfiguration", { resources: arg([machine]), policies: arg([]) }, settings).length, 1);
    const assignmentId = `/subscriptions/${second}/providers/Microsoft.Authorization/policyAssignments/custom-emm`;
    const policy = { resourceId: machine.id, assignmentId, referenceId: "AzureUpdateManagerArc-Linux", state: "Compliant", timestamp: "2026-11-12T10:00:00Z" };
    const emm = { resources: arg([machine]), policies: arg([policy]), assignments: [{ subscriptionId: second, assignmentId }] };
    assert.equal(normalize("emm", emm, settings)[0].policies[0].state, "Compliant");
    assert.throws(() => normalize("emm", { ...emm, assignments: [] }, settings), /assignment/);
    assert.throws(() => normalize("emm", { ...emm, assignments: [{ subscriptionId: SUBSCRIPTION, assignmentId }] }, settings), /assignment/);
    for (const section of ["inventory", "machineSecurity"]) assert.throws(() => normalize(section, arg([{ ...machine, id: outside }]), settings));
    assert.throws(() => normalize("machineConfiguration", { resources: arg([{ ...machine, id: outside }]), policies: arg([]) }, settings));
    assert.throws(() => normalize("emm", { ...emm, resources: arg([{ ...machine, id: outside }]) }, settings));
    const metric = { tables: [{ columns: ["resourceId", "metric", "series", "time", "value", "unit"].map(name => ({ name })), rows: [[machine.id, "cpu", "busy", "2026-11-12T10:00:00Z", 50, "%"]] }] };
    assert.equal(normalize("metrics", metric, settings).length, 1);
    metric.tables[0].rows[0][0] = outside;
    assert.throws(() => normalize("metrics", metric, settings), /out-of-scope/);
    assert.throws(() => normalize("advisor", arg([{ id: `${machine.id}/recommendation`, resourceId: outside }]), settings), /outside/);
    const catalogId = `/subscriptions/${SUBSCRIPTION}/resourceGroups/external/providers/Microsoft.Compute/galleries/catalog/applications/app/versions/1.0.0`;
    const deployment = { id: `${machine.id}/applications/app`, type: "microsoft.hybridcompute/machines/applications", packageReferenceId: catalogId };
    assert.equal(normalize("appDeployments", arg([deployment]), settings)[0].versionId, catalogId);
    assert.throws(() => normalize("appDeployments", arg([{ id: catalogId, type: "microsoft.compute/galleries/applications/versions" }]), settings), /outside/);
    assert.throws(() => normalize("appDeployments", arg([{ ...deployment, id: deployment.id.replace(second, SUBSCRIPTION) }]), settings), /outside/);
    const assessment = { id: `${group}/providers/Microsoft.Kubernetes/connectedClusters/cluster/providers/Microsoft.KubernetesConfiguration/upgradeAssessments/default`, type: "microsoft.kubernetesconfiguration/upgradeAssessments", properties: {} };
    assert.equal(normalize("upgradeAssessments", arg([assessment]), settings).length, 1);
    assert.throws(() => normalize("upgradeAssessments", arg([{ ...assessment, id: assessment.id.replace(second, SUBSCRIPTION) }]), settings), /outside/);
});
test("machine security keeps reported TPM identity separate from readiness and unknown upgrade settings", () => {
    const machine = { id, name: "server1", type: "microsoft.hybridcompute/machines", identityKeyStore: "Default", tpmPresent: "true", tpmReady: "true", automaticUpgrade: false, unwanted: "discard" };
    const rows = normalize("machineSecurity", arg([machine, { ...machine, id: `${id}2`, identityKeyStore: "Tpm", tpmReady: "", automaticUpgrade: null }]));
    assert.equal(rows[0].identityKeyStore, "Default");
    assert.equal(rows[0].tpmPresent, true);
    assert.equal(rows[0].tpmReady, true);
    assert.equal(rows[0].automaticUpgrade, false);
    assert.equal(rows[0].unwanted, undefined);
    assert.equal(rows[1].identityKeyStore, "Tpm");
    assert.equal(rows[1].tpmReady, null);
    assert.equal(rows[1].automaticUpgrade, null);
    assert.throws(() => normalize("machineSecurity", arg([machine, machine])), /duplicate/);
    assert.throws(() => normalize("machineSecurity", arg([{ ...machine, tpmReady: "enabled" }])), /true, false or unknown/);
    assert.throws(() => normalize("machineSecurity", arg([{ ...machine, id: `${id}/extensions/agent` }])), /out-of-scope/);
    assert.throws(() => normalize("machineSecurity", { ...arg([machine]), skipToken: "more" }), /incomplete/);
});
test("Machine Configuration deduplicates per assignment and reference and separates missing, unknown, exempt and inapplicable evidence", () => {
    const scope = `/subscriptions/${SUBSCRIPTION}/resourceGroups/${EMM_RESOURCE_GROUP}/providers/Microsoft.HybridCompute/machines/`;
    const resources = Array.from({ length: 7 }, (_, index) => ({ id: `${scope}server${index}`, name: `server${index}`, type: "microsoft.hybridcompute/machines" }));
    const policy = { resourceId: resources[0].id, definitionId: "/providers/Microsoft.Authorization/policyDefinitions/test", assignmentId: `/subscriptions/${SUBSCRIPTION}/providers/Microsoft.Authorization/policyAssignments/test`, category: "Guest Configuration", referenceId: "linux", state: "NonCompliant", timestamp: "2026-11-12T10:00:00Z", displayName: "Linux policy" };
    const policies = [
        policy,
        { ...policy, state: "Compliant", timestamp: "2026-11-12T11:00:00Z" },
        { ...policy, assignmentId: `${policy.assignmentId}2` },
        { ...policy, resourceId: resources[1].id, state: "Exempt" },
        { ...policy, resourceId: resources[2].id, state: "Conflict" },
        { ...policy, resourceId: resources[3].id, state: "NotApplicable" },
        { ...policy, resourceId: resources[4].id, state: "Compliant" },
        { ...policy, resourceId: resources[4].id, referenceId: "other", state: "NotApplicable" },
        { ...policy, resourceId: resources[6].id, state: "Compliant" },
        { ...policy, resourceId: resources[6].id, state: "Exempt" },
    ];
    const result = { resources: arg(resources), policies: arg(policies) };
    const rows = normalize("machineConfiguration", result);
    const summary = machineConfigurationSummary({ rows });
    assert.deepEqual(summary.counts, { compliant: 1, nonCompliant: 1, unknown: 2, exempt: 1, notApplicable: 1, unassessed: 1 });
    assert.equal(rows[0].policies.length, 2);
    assert.equal(rows[0].policies[0].state, "Compliant");
    assert.equal(summary.evaluations.nonCompliant, 1);
    assert.equal(summary.machines[5].compliance, "unassessed");
    assert.equal(summary.evaluatedTo, "2026-11-12T11:00:00.000Z");
    for (const invalid of [{ category: "Security Center" }, { resourceId: id }, { timestamp: "2026-11-12T10:00:00" }, { assignmentId: "test" }]) {
        assert.throws(() => normalize("machineConfiguration", { ...result, policies: arg([{ ...policy, ...invalid }]) }), /invalid/);
    }
    assert.throws(() => normalize("machineConfiguration", { ...result, resources: { ...result.resources, skipToken: "next" } }), /incomplete/);
    assert.throws(() => normalize("machineConfiguration", { ...result, policies: { ...result.policies, skipToken: "next" } }), /incomplete/);
    assert.throws(() => normalize("machineConfiguration", { ...result, resources: arg([...resources, resources[0]]) }), /duplicate/);
    assert.throws(() => normalize("machineConfiguration", { ...result, resources: arg([{ ...resources[0], id }]) }), /out-of-scope/);
});
test("normalizes Arc status, strips raw properties and rejects incomplete inventory", () => {
    const result = arg([{ id, name: "server1", type: "microsoft.hybridcompute/machines", properties: { status: "Connected", unneeded: "not persisted" } }]);
    const rows = normalize("inventory", result);
    assert.equal(rows[0].status, "Connected");
    assert.equal(rows[0].properties, undefined);
    assert.throws(() => normalize("inventory", { ...result, skipToken: "page2" }), /incomplete/);
    assert.throws(() => normalize("inventory", { ...result, totalRecords: 2 }), /incomplete/);
    assert.throws(() => normalize("inventory", arg([{ ...result.results.data[0], id: "/subscriptions/other/resource" }])), /out-of-subscription/);
});
test("accepts uppercase and lowercase monitor table formats, rejects invalid or partial telemetry", () => {
    const columns = ["resourceId", "metric", "series", "time", "value", "unit"];
    const row = [id, "cpu", "Processor Time", "2026-11-10T18:00:00Z", 35, "%"];
    const upper = { Tables: [{ Columns: columns.map(ColumnName => ({ ColumnName })), Rows: [row] }] };
    assert.equal(normalize("metrics", upper)[0].value, 35);
    assert.equal(normalize("metrics", { tables: [{ columns: columns.map(name => ({ name })), rows: [row] }] })[0].resourceId, id);
    assert.throws(() => normalize("metrics", {}), /no tables/);
    assert.throws(() => normalize("metrics", { ...upper, partialError: {} }), /partial/);
    assert.throws(() => normalize("metrics", { Tables: [...upper.Tables, { Columns: [{ ColumnName: "Severity" }, { ColumnName: "SeverityName" }], Rows: [[2, "Error"]] }] }), /incomplete/);
    assert.throws(() => normalize("metrics", { Tables: [{ ...upper.Tables[0], Rows: [[...row.slice(0, 4), null, "%"]] }] }), /invalid/);
    assert.throws(() => normalize("metrics", { Tables: [{ ...upper.Tables[0], Rows: [[...row.slice(0, 5), "KiB/s"]] }] }), /units/);
});
test("filters case-insensitively and never treats workspaces as Arc resources", () => {
    const state = initialState();
    state.inventory.rows = normalize("inventory", arg([
        { id, name: "server1", type: "microsoft.hybridcompute/machines", status: "Disconnected", os: "Linux" },
        { id: LOG_ANALYTICS_WORKSPACE, name: "SB-LAW", type: "microsoft.operationalinsights/workspaces" },
    ]));
    state.filters = { ...state.filters, search: "LINUX", status: "disconnected" };
    assert.equal(filteredResources(state).length, 1);
    state.filters.resourceId = `${id}other`;
    assert.equal(filteredResources(state).length, 0);
});
test("Advisor publication is limited to Caldova Arc resources", () => {
    assert.equal(normalize("advisor", arg([{ id: `${id}/providers/Microsoft.Advisor/recommendations/one`, resourceId: id }])).length, 1);
    assert.throws(() => normalize("advisor", arg([{ id, resourceId: DEFAULT_WORKSPACE }])), /outside/);
});
test("refresh plan restricts workspace and window and emits separate bounded counter series", () => {
    const plan = refreshPlan({ workspaceId: LOG_ANALYTICS_WORKSPACE, hours: 6 }).monitoring;
    assert.equal(plan.queryParameters.timespan, "PT6H");
    assert.match(plan.queryParameters.query, /\['time'\]=bin\(TimeGenerated,10m\)/);
    assert.match(plan.queryParameters.query, /project resourceId,metric,series,\['time'\],value,unit/);
    assert.throws(() => refreshPlan({ workspaceId: id, hours: 24 }), /workspace/);
    assert.throws(() => refreshPlan({ workspaceId: DEFAULT_WORKSPACE, hours: 2 }), /window/);
});
test("unresolved workspace defaults are rejected and never replace saved monitoring choices",
    { skip: !DEFAULT_WORKSPACE.includes("REPLACE_ME_") }, () => {
        for (const workspaceId of [DEFAULT_WORKSPACE, LOG_ANALYTICS_WORKSPACE]) {
            assert.throws(() => monitoringPlan({ workspaceId, hours: 24 }), /workspace resource ID/);
        }
        const workspaceId = "/subscriptions/00000000-0000-4000-8000-000000000001/resourceGroups/monitoring/providers/Microsoft.Monitor/accounts/performance";
        const state = initialState();
        state.settings.workspaceId = workspaceId;
        state.settings.defaultWorkspaceId = workspaceId;
        state.metrics.workspaceId = workspaceId;
        migrateState(state);
        assert.equal(state.settings.workspaceId, workspaceId);
        assert.equal(state.metrics.workspaceId, workspaceId);
        assert.equal(monitoringPlan({ workspaceId, hours: 24 }).source, "prometheus");
    });
test("moves the old monitoring default to EMM without relabeling telemetry or replacing manual choices", () => {
    const previousWorkspace = `/subscriptions/${SUBSCRIPTION}/resourceGroups/masontorres/providers/microsoft.operationalinsights/workspaces/arc-logs`;
    const state = initialState();
    assert.equal(state.settings.workspaceId, "");
    assert.equal(state.settings.subscriptionIds, null);
    state.settings = { workspaceId: previousWorkspace.toUpperCase(), hours: 6 };
    state.metrics = { rows: [{ resourceId: id }], updatedAt: "2026-11-10T18:00:00Z", error: null, workspaceId: previousWorkspace, hours: 6 };
    const telemetry = structuredClone(state.metrics);
    migrateState(state);
    assert.equal(state.settings.workspaceId, DEFAULT_WORKSPACE);
    assert.equal(state.settings.hours, 6);
    assert.equal(state.settings.refreshMinutes, 0);
    assert.deepEqual(state.metrics, telemetry);
    state.settings.workspaceId = previousWorkspace;
    migrateState(state);
    assert.equal(state.settings.workspaceId, previousWorkspace);
    const custom = initialState();
    custom.settings = { workspaceId: LOG_ANALYTICS_WORKSPACE.replace("SB-LAW", "custom-workspace"), hours: 168 };
    const workspaceId = custom.settings.workspaceId;
    migrateState(custom);
    assert.equal(custom.settings.workspaceId, workspaceId);
    assert.equal(custom.settings.hours, 168);
    for (const minutes of [5, 30, 60]) {
        custom.settings.refreshMinutes = minutes;
        migrateState(custom);
        assert.equal(custom.settings.refreshMinutes, minutes);
    }
    custom.settings.refreshMinutes = 10;
    assert.throws(() => migrateState(custom), /Invalid saved refresh interval/);
});
test("migrates the former EMM Log Analytics default without relabeling its cached data", () => {
    const state = initialState();
    state.settings.workspaceId = LOG_ANALYTICS_WORKSPACE;
    state.settings.defaultWorkspaceId = LOG_ANALYTICS_WORKSPACE;
    state.metrics.workspaceId = LOG_ANALYTICS_WORKSPACE;
    const metrics = structuredClone(state.metrics);
    migrateState(state);
    assert.equal(state.settings.workspaceId, DEFAULT_WORKSPACE);
    assert.deepEqual(state.metrics, metrics);
    state.settings.workspaceId = LOG_ANALYTICS_WORKSPACE;
    migrateState(state);
    assert.equal(state.settings.workspaceId, LOG_ANALYTICS_WORKSPACE);
});
test("EMM monitoring emits scoped OTel PromQL with rate-before-sum and a shared bounded window", () => {
    for (const [hours, step] of [[1, 120], [6, 600], [24, 1800], [168, 14400]]) {
        const now = Date.parse("2026-11-12T21:00:00Z");
        const plan = monitoringPlan({ workspaceId: DEFAULT_WORKSPACE, hours }, now);
        assert.equal(plan.source, "prometheus");
        assert.equal(plan.end, now / 1000);
        assert.equal(plan.start, now / 1000 - hours * 3600);
        assert.equal(plan.step, step);
        assert.match(plan.queries.cpu, /1 - sum by \("microsoft.resourceid"\) \(rate\(/);
        assert.match(plan.queries.memory, /state="free"/);
        for (const query of Object.values(plan.queries)) {
            assert.ok(query.includes(`"microsoft.subscriptionid"="${SUBSCRIPTION}"`));
            assert.match(query, /"microsoft.resourcetype"="microsoft.hybridcompute\/machines"/);
        }
        for (const metric of ["network", "disk"]) {
            assert.match(plan.queries[metric], /direction\) \(rate\(/);
            assert.match(plan.queries[metric], /\/ 1024$/);
        }
    }
    assert.equal(refreshPlan({ workspaceId: DEFAULT_WORKSPACE.replace("ama-workspace", "other"), hours: 24 }).monitoring.source, "prometheus");
});
test("normalizes complete Prometheus matrices and rejects partial, non-finite or out-of-scope evidence", () => {
    const matrix = (metric, value, direction) => ({
        status: "success", data: { resultType: "matrix", result: [{
            metric: { "microsoft.resourceid": id.toUpperCase(), ...(direction ? { direction } : {}) },
            values: [[1794517200, value]],
        }] },
    });
    const result = {
        source: "prometheus", cpu: matrix("cpu", "25.5"), memory: matrix("memory", "60"),
        network: matrix("network", "12.5", "receive"), disk: matrix("disk", "4", "write"),
    };
    const rows = normalize("metrics", result);
    assert.equal(rows.length, 4);
    assert.deepEqual(rows[0], { resourceId: id.toLowerCase(), metric: "cpu", series: "CPU busy (5m)", time: "2026-11-12T21:00:00.000Z", value: 25.5, unit: "%" });
    assert.equal(rows[2].unit, "KiB/s");
    assert.match(rows[3].series, /write/);
    const empty = { status: "success", data: { resultType: "matrix", result: [] } };
    assert.deepEqual(normalize("metrics", { source: "prometheus", cpu: empty, memory: empty, network: empty, disk: empty }), []);
    for (const replacement of [
        undefined, { ...result.cpu, status: "error", error: "Forbidden" },
        { ...result.cpu, warnings: ["partial response"] }, { ...result.cpu, data: { resultType: "vector", result: [] } },
    ]) assert.throws(() => normalize("metrics", { ...result, cpu: replacement }), /failed|incomplete/);
    for (const value of ["NaN", "+Inf", "-Inf", "", null, 25]) {
        assert.throws(() => normalize("metrics", { ...result, cpu: matrix("cpu", value) }), /non-finite/);
    }
    const outside = structuredClone(result);
    outside.cpu.data.result[0].metric["microsoft.resourceid"] = id.replace(SUBSCRIPTION, "other");
    assert.throws(() => normalize("metrics", outside), /invalid resource/);
    assert.throws(() => normalize("metrics", { ...result, network: matrix("network", "1", "unknown") }), /direction/);
    assert.throws(() => normalize("metrics", { ...result, disk: matrix("disk", "1") }), /direction/);
});
test("migrates existing snapshots and isolates task responses without completing checklist items", () => {
    const state = initialState();
    delete state.reviews;
    delete state.upgradeAssessments;
    delete state.appDeployments;
    delete state.appearance;
    delete state.emm;
    state.answer = "Previous overview";
    state.inventory.rows = [{ id }];
    migrateState(state);
    assert.equal(state.appearance, "auto");
    assert.deepEqual(state.appDeployments, { rows: [], updatedAt: null, error: null });
    assert.deepEqual(state.emm, { rows: [], updatedAt: null, error: null });
    state.appearance = "dark";
    migrateState(state);
    assert.equal(state.appearance, "dark");
    assert.equal(state.reviews.overview.answer, "Previous overview");
    assert.equal(state.inventory.rows[0].id, id);
    recordReview(state, { id: "request-1", taskId: 1 }, "Performance review");
    recordReview(state, { id: "request-3", taskId: 3 }, "Upgrade review");
    assert.equal(state.reviews["1"].answer, "Performance review");
    assert.equal(state.reviews["3"].requestId, "request-3");
    assert.equal(state.reviews.overview.answer, "Previous overview");
    assert.equal(state.answer, "Previous overview");
    recordReview(state, { id: "request-overview" }, "New overview");
    assert.equal(state.answer, "New overview");
    assert.equal(state.reviews["3"].answer, "Upgrade review");
    assert.ok(state.checklist.every(item => item.completedAt === null));
    assert.throws(() => recordReview(state, { id: "bad", taskId: 8 }, "Wrong task"), /Unknown/);
});
test("normalizes scoped application catalogs and deployed versions without confusing requested or latest versions", () => {
    const applicationId = `/subscriptions/${SUBSCRIPTION}/resourceGroups/${APPLICATION_RESOURCE_GROUP}/providers/Microsoft.Compute/galleries/packages/applications/agent`;
    const versionId = `${applicationId}/versions/1.0.0`;
    const deployment = {
        id: `${id}/applications/agent`, type: "Microsoft.HybridCompute/machines/applications",
        properties: { packageReferenceId: `${applicationId}/versions/latest`, provisioningState: "Succeeded", instanceView: { version: "1.0.0", result: "Succeeded" }, configurationReference: "not persisted" },
    };
    const catalog = [
        { id: applicationId, type: "microsoft.compute/galleries/applications", properties: { supportedOSType: "Linux" } },
        { id: versionId, type: "Microsoft.Compute/galleries/applications/versions", properties: { provisioningState: "Succeeded", publishingProfile: { source: "not persisted" } } },
    ];
    const rows = normalize("appDeployments", arg([...catalog, deployment]));
    assert.equal(rows[0].supportedOSType, "Linux");
    assert.equal(rows[1].kind, "version");
    assert.equal(rows[2].resourceId, id);
    assert.equal(rows[2].requestedVersion, "latest");
    assert.equal(rows[2].reportedVersion, "1.0.0");
    assert.equal(rows[2].versionId, versionId);
    assert.equal(rows[2].installationResult, "Succeeded");
    assert.ok(rows.every(row => row.properties === undefined && row.configurationReference === undefined));
    const [unknown] = normalize("appDeployments", arg([{ ...deployment, properties: { packageReferenceId: `${applicationId}/versions/latest`, provisioningState: "Succeeded" } }]));
    assert.equal(unknown.version, "latest");
    assert.equal(unknown.reportedVersion, "");
    assert.equal(unknown.installationResult, "Unknown");
    const [failed] = normalize("appDeployments", arg([{ ...deployment, properties: undefined, packageReferenceId: `${applicationId}/versions/2.0.0`, reportedVersion: "1.0.0", installationResult: "Failed", provisioningState: "Failed" }]));
    assert.equal(failed.requestedVersion, "2.0.0");
    assert.equal(failed.versionId, versionId);
    assert.equal(failed.installationResult, "Failed");
    assert.equal(normalize("appDeployments", arg([{ ...deployment, id: deployment.id.toUpperCase(), properties: { packageReferenceId: versionId.toUpperCase() } }]))[0].name, "AGENT");
    for (const result of [{ ...arg(catalog), skipToken: "next" }, { ...arg(catalog), resultTruncated: true }, { ...arg(catalog), totalRecords: 3 }]) {
        assert.throws(() => normalize("appDeployments", result), /incomplete/);
    }
    assert.throws(() => normalize("appDeployments", arg([catalog[0], catalog[0]])), /duplicate/);
    assert.throws(() => normalize("appDeployments", arg([{ ...catalog[0], id: applicationId.replace(APPLICATION_RESOURCE_GROUP, "other") }])), /outside/);
    assert.throws(() => normalize("appDeployments", arg([{ ...catalog[0], id: applicationId.replace("Microsoft.Compute", "MicrosoftXCompute") }])), /outside/);
    assert.throws(() => normalize("appDeployments", arg([{ ...deployment, id: deployment.id.replace(SUBSCRIPTION, "other") }])), /outside/);
    assert.throws(() => normalize("appDeployments", arg([{ ...deployment, properties: { packageReferenceId: versionId.replace(APPLICATION_RESOURCE_GROUP, "other") } }])), /unsupported gallery/);
    assert.throws(() => normalize("appDeployments", arg([{ ...deployment, properties: { packageReferenceId: applicationId } }])), /no version/);
    assert.throws(() => normalize("appDeployments", arg([{ ...deployment, properties: { ...deployment.properties, instanceView: { version: "../bad" } } }])), /Invalid reported/);
});
test("application review and refresh use the same read-only catalog and subscription-wide deployment scope", () => {
    const plan = taskReviewPlan(4);
    assert.equal(plan.section, "appDeployments");
    assert.equal(plan.resourceGroup, APPLICATION_RESOURCE_GROUP);
    assert.match(plan.query, /resourceGroup =~ 'arc-breakout-servers'/);
    assert.match(plan.query, /microsoft\.hybridcompute\/machines\/applications/);
    assert.match(plan.query, /reportedVersion=tostring\(properties\.instanceView\.version\)/);
    assert.equal(refreshPlan({ workspaceId: DEFAULT_WORKSPACE, hours: 24 }).appDeploymentsQuery, plan.query);
    assert.match(plan.guidance, /nextLink/);
    assert.match(plan.guidance, /not verified installs/);
});
test("task plans use the Arc assessment table and keep the exact EMM portal flight", () => {
    const plan = taskReviewPlan(3);
    assert.match(plan.query, /^KubernetesConfigurationResources/);
    assert.match(plan.query, /microsoft\.kubernetesconfiguration\/upgradeAssessments/);
    assert.match(plan.query, new RegExp(SUBSCRIPTION));
    assert.equal(refreshPlan({ workspaceId: DEFAULT_WORKSPACE, hours: 24 }).upgradeAssessmentsQuery, plan.query);
    assert.equal(taskReviewPlan(2).portalUrl, EMM_URL);
    assert.match(EMM_URL, /feature\.EMMOverviewRedesign=true&feature\.canmodifystamps=true&microsoft_azure_computehub=flight21/);
    assert.throws(() => taskReviewPlan("3"), /Unknown/);
});
test("normalizes target-specific Arc upgrade evidence and rejects incomplete or out-of-scope assessments", () => {
    const clusterId = `/subscriptions/${SUBSCRIPTION}/resourceGroups/demo/providers/Microsoft.Kubernetes/connectedClusters/cluster1`;
    const assessment = {
        id: `${clusterId}/providers/Microsoft.KubernetesConfiguration/UpgradeAssessments/default`,
        type: "microsoft.kubernetesconfiguration/upgradeAssessments",
        properties: {
            currentKubernetesVersion: "1.31", targetKubernetesVersion: "1.32", overallSeverity: "Critical",
            assessmentTime: "2026-11-10T19:58:00Z",
            componentCompatibility: [{ name: "coredns", severity: "Critical", compatibilityStatus: "Incompatible", version: "1.9", minCompatibleVersion: "1.11", notes: "<script>untrusted text</script>" }],
            readinessChecks: [{ name: "Node one", severity: "None", category: "NodeStatus" }],
            deprecatedApis: [{ group: "eraser.sh", resource: "imagejobs", version: "v1alpha1", severity: "Warning" }],
        },
    };
    const [row] = normalize("upgradeAssessments", arg([assessment]));
    assert.equal(row.resourceId, clusterId);
    assert.equal(row.targetKubernetesVersion, "1.32");
    assert.equal(row.componentCompatibility[0].compatibilityStatus, "Incompatible");
    assert.equal(row.componentCompatibility[0].notes, "<script>untrusted text</script>");
    assert.equal(row.deprecatedApis[0].removedRelease, "");
    assert.throws(() => normalize("upgradeAssessments", { ...arg([assessment]), skipToken: "next" }), /incomplete/);
    assert.throws(() => normalize("upgradeAssessments", arg([{ ...assessment, id: assessment.id.replace(SUBSCRIPTION, "other") }])), /outside/);
    assert.throws(() => normalize("upgradeAssessments", arg([{ ...assessment, id: assessment.id.replace("Microsoft.Kubernetes/connectedClusters", "Microsoft.ContainerService/managedClusters") }])), /outside/);
    assert.throws(() => normalize("upgradeAssessments", arg([{ ...assessment, properties: { assessmentTime: "not a date" } }])), /timestamp/);
    assert.throws(() => normalize("upgradeAssessments", arg([{ ...assessment, properties: { componentCompatibility: {} } }])), /checks/);
    const [unknown] = normalize("upgradeAssessments", arg([{ ...assessment, properties: {} }]));
    assert.equal(unknown.overallSeverity, "Unknown");
    assert.equal(unknown.assessmentTime, null);
});

test("EMM rolls up latest service policies per machine, separating missing evidence, exemptions and extension issues", () => {
    const root = `/subscriptions/${SUBSCRIPTION}/resourceGroups/${EMM_RESOURCE_GROUP}/providers/Microsoft.HybridCompute/machines`;
    const machine = (name, os) => ({ id: `${root}/${name}`, name, os, status: "Connected", type: "Microsoft.HybridCompute/machines" });
    const windows = machine("windows", "Windows"), linux = machine("linux", "Linux"), unknown = machine("unknown", "");
    const extension = (row, type, publisher, state) => ({ id: `${row.id}/extensions/${type}`, name: type, type: "Microsoft.HybridCompute/machines/extensions", extensionType: type, publisher, provisioningState: state });
    const policy = (row, referenceId, state = "Compliant", timestamp = "2026-11-11T12:00:00Z") => ({ resourceId: row.id.toUpperCase(), referenceId, state, timestamp, assignmentId: EMM_ASSIGNMENT_ID.toUpperCase() });
    const references = ["azuremonitorforarc", "azuremonitordatacollectionruleassociationforarc", "azureupdatemanagerarc", "guestconfigurationsecuritybaseline", "changetrackingforarc", "changetrackingdatacollectionruleassociationforarc"];
    const policies = [
        ...references.map(reference => policy(windows, `${reference}-windows`)),
        ...references.filter(reference => reference !== "guestconfigurationsecuritybaseline").map(reference => policy(linux, `${reference}-linux`,
            reference === "changetrackingforarc" ? "NonCompliant" : reference === "azureupdatemanagerarc" ? "Exempt" : "Compliant")),
        policy(windows, "azuremonitorforarc-windows", "NonCompliant", "2026-11-10T12:00:00Z"),
        policy(windows, "azureupdatemanagerarc-linux", "Compliant"),
    ];
    const resources = [windows, linux, unknown,
        extension(windows, "AzureMonitorWindowsAgent", "Microsoft.Azure.Monitor", "Creating"),
        extension(windows, "ChangeTracking-Windows", "Microsoft.Azure.ChangeTrackingAndInventory", "Succeeded"),
        extension(linux, "AzureMonitorLinuxAgent", "Microsoft.Azure.Monitor", "Failed"),
        extension(linux, "MDE.Linux", "Microsoft.Azure.AzureDefenderForServers", "Failed"),
    ];
    const rows = normalize("emm", { resources: arg(resources), policies: arg(policies) });
    const summary = emmSummary({ rows });
    assert.equal(summary.total, 3);
    assert.deepEqual(summary.services.map(service => [service.compliant, service.nonCompliant, service.unknown, service.exempt]), [[2, 0, 1, 0], [1, 0, 1, 1], [1, 0, 2, 0], [1, 1, 1, 0]]);
    assert.equal(summary.services[0].percent, 200 / 3);
    assert.deepEqual(summary.issues.map(issue => issue.machines.length), [1, 1, 1, 2, 1]);
    assert.deepEqual(summary.issues[0].machines, [linux.id]);
    assert.deepEqual(summary.issues[1].machines, [linux.id]);
    assert.deepEqual(summary.issues[2].machines, [windows.id]);
    assert.ok(summary.machines[1].extensionFindings.includes("ChangeTracking-Linux: missing"));
    assert.equal(summary.evaluatedFrom, "2026-11-11T12:00:00.000Z");
    const conflicting = normalize("emm", { resources: arg([windows]), policies: arg([policy(windows, "azuremonitorforarc-windows"), policy(windows, "azuremonitorforarc-windows", "NonCompliant")]) });
    assert.equal(emmSummary({ rows: conflicting }).services[0].nonCompliant, 1);
    assert.ok(emmSummary({ rows: [] }).services.every(service => service.percent === null));
});

test("EMM rejects incomplete or wrong-scope evidence and uses the same queries for refresh and task review", () => {
    const id = `/subscriptions/${SUBSCRIPTION}/resourceGroups/${EMM_RESOURCE_GROUP}/providers/Microsoft.HybridCompute/machines/server1`;
    const resource = { id, name: "server1", os: "Linux", type: "microsoft.hybridcompute/machines" };
    const policy = { resourceId: id, referenceId: "azuremonitorforarc-linux", state: "Compliant", timestamp: "2026-11-11T12:00:00Z", assignmentId: EMM_ASSIGNMENT_ID };
    const result = { resources: arg([resource]), policies: arg([policy]) };
    for (const section of ["resources", "policies"]) {
        assert.throws(() => normalize("emm", { ...result, [section]: { ...result[section], skipToken: "next" } }), /incomplete/);
        assert.throws(() => normalize("emm", { ...result, [section]: { ...result[section], totalRecords: 999 } }), /incomplete/);
    }
    assert.throws(() => normalize("emm", { ...result, resources: arg([resource, resource]) }), /duplicate/);
    assert.throws(() => normalize("emm", { ...result, resources: arg([{ ...resource, id: id.replace(EMM_RESOURCE_GROUP, "other") }]) }), /scope/);
    assert.throws(() => normalize("emm", { ...result, policies: arg([{ ...policy, assignmentId: `${EMM_ASSIGNMENT_ID}-other` }]) }), /assignment/);
    assert.throws(() => normalize("emm", { ...result, policies: arg([{ ...policy, timestamp: "11/11/2026 12:00:00" }]) }), /UTC/);
    assert.throws(() => normalize("emm", { ...result, resources: arg([]) }), /no machine/);
    assert.throws(() => normalize("emm", result.resources), /successful/);
    const plan = taskReviewPlan(2);
    assert.equal(plan.section, "emm");
    assert.deepEqual(plan.queries, refreshPlan({ workspaceId: DEFAULT_WORKSPACE, hours: 24 }).emm);
    assert.match(plan.queries.policiesQuery, /PolicyResources/);
    assert.match(plan.queries.resourcesQuery, /arc-breakout-ignite/);
    assert.match(plan.guidance, /missing evaluations are unknown/i);
});
