import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { runInNewContext } from "node:vm";
import { DEFAULT_WORKSPACE, EMM_URL, SUBSCRIPTION, EMM_RESOURCE_GROUP, initialState } from "./model.mjs";

test("theme tracks system changes, saved appearance and explicit picker selections", async () => {
    const html = await readFile(new URL("./dashboard.html", import.meta.url), "utf8");
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    for (const [search, saved, initialDark, expected, afterChange] of [
        ["", "auto", false, "light", "dark"],
        ["", "auto", true, "dark", "light"],
        ["", "light", true, "light", "light"],
        ["", "dark", false, "dark", "dark"],
        ["?clawpilotTheme=light", "dark", true, "light", "light"],
        ["?clawpilotTheme=dark", "auto", false, "dark", "dark"],
        ["?clawpilotTheme=invalid", "auto", false, "light", "dark"],
    ]) {
        const attributes = {};
        let onChange;
        let onSelection;
        const preference = { matches: initialDark, addEventListener: (event, handler) => { assert.equal(event, "change"); onChange = handler; } };
        runInNewContext(script, {
            URLSearchParams,
            window: { location: { search }, matchMedia: () => preference },
            document: {
                documentElement: { setAttribute: (name, value) => { attributes[name] = value; }, getAttribute: name => attributes[name] },
                querySelector: () => ({ content: saved }),
                addEventListener: (event, handler) => { assert.equal(event, "arc-theme-change"); onSelection = handler; },
            },
        });
        assert.equal(attributes["data-theme"], expected);
        preference.matches = !initialDark;
        onChange();
        assert.equal(attributes["data-theme"], afterChange);
        onSelection({ detail: "light" });
        assert.equal(attributes["data-theme"], "light");
        assert.equal(attributes["data-theme-preference"], "light");
        preference.matches = true;
        onChange();
        assert.equal(attributes["data-theme"], "light");
        onSelection({ detail: "auto" });
        assert.equal(attributes["data-theme"], "dark");
        assert.equal(attributes["data-theme-preference"], "auto");
    }
});

test("persists panel responses, rejects stale requests and confines the external Edge launcher", async t => {
    const directory = await mkdtemp(join(tmpdir(), "arc-operations-test-"));
    const previousHome = process.env.COPILOT_HOME;
    process.env.COPILOT_HOME = directory;
    const extensionUrl = new URL("./extension.mjs", import.meta.url).href;
    const messages = [];
    const launches = [];
    const logs = [];
    const secondSubscription = "11111111-2222-3333-4444-555555555555";
    const azureCalls = [];
    let azureError = null;
    let groupError = null;
    let sendError = null;
    const key = Symbol.for("arc-operations-test");
    let canvas;
    let instanceId = "test-panels";
    globalThis[key] = {
        joinSession(options) {
            canvas = options.canvases[0];
            return { workspacePath: directory, send: async input => { messages.push(input); if (sendError) throw new Error(sendError); }, log: async message => { logs.push(message); } };
        },
        launch(command, args) { launches.push({ command, args }); },
        azure(args) {
            azureCalls.push(args);
            if (azureError) return { error: azureError };
            const command = args.join(" ");
            if (command.includes("account list")) return { data: [
                { id: SUBSCRIPTION, name: "Primary", state: "Enabled" },
                { id: secondSubscription, name: "Secondary", state: "Enabled" },
                { id: "99999999-2222-3333-4444-555555555555", name: "Disabled", state: "Disabled" },
            ] };
            if (groupError) return { error: groupError };
            const subscription = command.includes(secondSubscription) ? secondSubscription : SUBSCRIPTION;
            return { data: [{ id: "/subscriptions/" + subscription + "/resourceGroups/shared", name: "shared" }] };
        },
    };
    const moduleUrl = source => `data:text/javascript,${encodeURIComponent(source)}`;
    const sdk = moduleUrl(`
        export const createCanvas = options => options;
        export class CanvasError extends Error {
            constructor(code, message) { super(message); this.code = code; }
        }
        export const joinSession = async options => globalThis[Symbol.for("arc-operations-test")].joinSession(options);
    `);
    const processes = moduleUrl(`
        import { EventEmitter } from "node:events";
        export function spawn(command, args) {
            const child = new EventEmitter();
            child.unref = () => {};
            child.stdout = new EventEmitter();
            child.stderr = new EventEmitter();
            child.kill = () => {};
            if (args.join(" ").includes("az ") || command === "az") {
                const result = globalThis[Symbol.for("arc-operations-test")].azure(args);
                queueMicrotask(() => {
                    if (result.error) child.stderr.emit("data", result.error);
                    else child.stdout.emit("data", JSON.stringify(result.data));
                    child.emit("close", result.error ? 1 : 0);
                });
            } else globalThis[Symbol.for("arc-operations-test")].launch(command, args);
            queueMicrotask(() => child.emit("spawn"));
            return child;
        }
    `);
    const files = moduleUrl(`
        export * from "node:fs/promises";
        export async function access() {}
    `);
    const hooks = registerHooks({
        resolve(specifier, context, next) {
            if (context.parentURL?.startsWith(extensionUrl)) {
                if (specifier === "@github/copilot-sdk/extension") return { url: sdk, shortCircuit: true };
                if (specifier === "node:child_process") return { url: processes, shortCircuit: true };
                if (specifier === "node:fs/promises") return { url: files, shortCircuit: true };
            }
            return next(specifier, context);
        },
    });
    t.after(async () => {
        try { await canvas?.onClose({ instanceId }); }
        finally {
            hooks.deregister();
            delete globalThis[key];
            if (previousHome === undefined) delete process.env.COPILOT_HOME;
            else process.env.COPILOT_HOME = previousHome;
            await rm(directory, { recursive: true, force: true });
        }
    });
    const manualWorkspace = `/subscriptions/${SUBSCRIPTION}/resourceGroups/masontorres/providers/microsoft.operationalinsights/workspaces/arc-logs`;
    const legacyPath = join(directory, "extensions", "arc-operations", "artifacts", `${SUBSCRIPTION}.json`);
    const storagePath = join(directory, "extensions", "arc-operations", "artifacts", "dashboard.json");
    const legacy = initialState();
    legacy.subscriptionId = SUBSCRIPTION;
    legacy.subscriptionName = "Caldova";
    legacy.settings = { workspaceId: manualWorkspace, hours: 24 };
    legacy.metrics.workspaceId = manualWorkspace;
    delete legacy.machineSecurity;
    delete legacy.machineConfiguration;
    await mkdir(join(directory, "extensions", "arc-operations", "artifacts"), { recursive: true });
    await writeFile(legacyPath, JSON.stringify(legacy));
    await import(`${extensionUrl}?test=${randomUUID()}`);
    const opened = await canvas.open({ instanceId });
    let url = new URL(opened.url);
    let token = url.searchParams.get("token");
    let headers = { "X-Arc-Token": token, "Content-Type": "application/json", Origin: url.origin };
    const post = (path, input) => fetch(new URL(path, url), { method: "POST", headers, body: JSON.stringify(input) });
    const state = async () => (await fetch(new URL("/state", url), { headers })).json();
    const action = (name, input) => canvas.actions.find(action => action.name === name).handler({ input });

    await t.test("serves expandable markup with an authorized theme script", async () => {
        const response = await fetch(url);
        const html = await response.text();
        const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
        const hash = createHash("sha256").update(script.replace(/\r\n?/g, "\n")).digest("base64");
        assert.ok(response.headers.get("content-security-policy").includes(`'sha256-${hash}'`));
        assert.match(html, /id="overview-panel" open/);
        assert.match(html, /id="performance-template"/);
        assert.match(html, /id="emm-template"/);
        assert.equal((await state()).taskPlans.length, 7);
        const disk = JSON.parse(await readFile(storagePath, "utf8"));
        assert.equal(disk.settings.workspaceId, DEFAULT_WORKSPACE);
        assert.equal(disk.metrics.workspaceId, manualWorkspace);
        assert.equal(disk.settings.refreshMinutes, 0);
        assert.deepEqual(disk.settings.subscriptionIds, [SUBSCRIPTION]);
        assert.equal(disk.settings.title, "Caldova");
        assert.equal((await post("/scope-options", { subscriptionIds: [SUBSCRIPTION] })).status, 200);
    });
    await t.test("saves appearance without changing operational data and serves it before first paint", async () => {
        const before = await state();
        for (const theme of ["light", "auto", "dark"]) {
            assert.equal((await post("/appearance", { theme })).status, 200);
            assert.equal((await state()).appearance, theme);
            assert.match(await (await fetch(url)).text(), new RegExp(`<meta name="arc-theme" content="${theme}">`));
        }
        for (const input of [{}, { theme: "invalid" }, { theme: null }]) assert.equal((await post("/appearance", input)).status, 400);
        const saved = await state();
        assert.equal(saved.appearance, "dark");
        assert.deepEqual({ ...saved, appearance: before.appearance }, before);
    });
    await t.test("uses the EMM default and saves manual workspace overrides without losing migration metadata", async () => {
        const before = await state();
        assert.equal((await action("get_refresh_plan", {})).workspaceId, DEFAULT_WORKSPACE);
        assert.equal((await post("/settings", { workspaceId: manualWorkspace, hours: 6 })).status, 200);
        const saved = await state();
        assert.equal(saved.settings.workspaceId, manualWorkspace);
        assert.equal(saved.settings.defaultWorkspaceId, DEFAULT_WORKSPACE);
        assert.equal((await action("get_refresh_plan", {})).workspaceId, manualWorkspace);
        assert.deepEqual(saved.metrics, before.metrics);
    });
    await t.test("refreshes EMM performance using raw Prometheus responses and preserves metrics on failure", async () => {
        assert.equal((await post("/settings", { workspaceId: DEFAULT_WORKSPACE, hours: 1 })).status, 200);
        const job = await (await post("/request", { kind: "question", prompt: "Review performance", taskId: 1 })).json();
        const prompt = messages.at(-1).prompt;
        assert.match(prompt, /azureMonitorInsights\.azureMonitorWorkspaceId/);
        assert.match(prompt, /query_range/);
        assert.match(prompt, /az rest/);
        assert.match(prompt, /do NOT substitute.*changeTrackingAndInventory/);
        assert.equal((await post("/settings", { workspaceId: manualWorkspace, hours: 6 })).status, 400);
        const empty = { status: "success", data: { resultType: "matrix", result: [] } };
        const resourceId = `/subscriptions/${SUBSCRIPTION}/resourceGroups/${EMM_RESOURCE_GROUP}/providers/Microsoft.HybridCompute/machines/server1`;
        const result = { source: "prometheus", cpu: { status: "success", data: { resultType: "matrix", result: [{ metric: { "microsoft.resourceid": resourceId }, values: [[1794517200, "35"]] }] } }, memory: empty, network: empty, disk: empty };
        await assert.rejects(action("publish_data", { section: "metrics", requestId: job.requestId, workspaceId: manualWorkspace, hours: 1, result }), /workspace and window/);
        await assert.rejects(action("publish_data", { section: "metrics", requestId: job.requestId, workspaceId: DEFAULT_WORKSPACE, hours: 6, result }), /workspace and window/);
        const tables = { tables: [{ columns: ["resourceId", "metric", "series", "time", "value", "unit"].map(name => ({ name })), rows: [] }] };
        await assert.rejects(action("publish_data", { section: "metrics", requestId: job.requestId, workspaceId: DEFAULT_WORKSPACE, hours: 1, result: tables }), /monitoring source/);
        await action("publish_data", { section: "metrics", requestId: job.requestId, workspaceId: DEFAULT_WORKSPACE, hours: 1, result });
        await action("complete_request", { requestId: job.requestId, answer: "Performance loaded" });
        const saved = await state();
        assert.equal(saved.metrics.rows[0].value, 35);
        assert.equal(saved.metrics.workspaceId, DEFAULT_WORKSPACE);
        const failed = await (await post("/request", { kind: "question", prompt: "Refresh performance", taskId: 1 })).json();
        await assert.rejects(action("publish_data", { section: "metrics", requestId: failed.requestId, workspaceId: DEFAULT_WORKSPACE, hours: 1, result: { ...result, disk: { status: "error", error: "Forbidden" } } }), /failed/);
        await action("complete_request", { requestId: failed.requestId, answer: "Metrics query failed", errors: { metrics: "Forbidden" } });
        assert.deepEqual((await state()).metrics.rows, saved.metrics.rows);
        assert.equal((await state()).metrics.error, "Forbidden");
        await assert.rejects(action("publish_data", { section: "metrics", requestId: failed.requestId, workspaceId: DEFAULT_WORKSPACE, hours: 1, result }), /canceled|completed/);
        await post("/settings", { workspaceId: manualWorkspace, hours: 6 });
    });
    await t.test("keeps answers in their originating panels and persists them", async () => {
        for (const taskId of [1, 3]) {
            const response = await post("/request", { kind: "question", prompt: "Review this task", taskId });
            assert.equal(response.status, 202);
            const job = await response.json();
            assert.match(messages.at(-1).prompt, new RegExp(`checklist panel ${taskId}`));
            if (taskId === 3) {
                assert.match(messages.at(-1).prompt, /KubernetesConfigurationResources/);
                const assessmentId = `/subscriptions/${SUBSCRIPTION}/resourceGroups/demo/providers/Microsoft.Kubernetes/connectedClusters/cluster1/providers/Microsoft.KubernetesConfiguration/upgradeAssessments/default`;
                await action("publish_data", { requestId: job.requestId, section: "upgradeAssessments", result: { isSuccessful: true, results: { data: [{ id: assessmentId, type: "microsoft.kubernetesconfiguration/upgradeAssessments", properties: { overallSeverity: "Critical", currentKubernetesVersion: "1.31", targetKubernetesVersion: "1.32" } }] }, totalRecords: 1 } });
            }
            await action("complete_request", { requestId: job.requestId, answer: `Task ${taskId} result` });
        }
        const response = await post("/request", { kind: "question", prompt: "Estate overview" });
        const job = await response.json();
        await action("complete_request", { requestId: job.requestId, answer: "Overview result" });
        const saved = await state();
        assert.equal(saved.reviews["1"].answer, "Task 1 result");
        assert.equal(saved.reviews["3"].answer, "Task 3 result");
        assert.equal(saved.reviews.overview.answer, "Overview result");
        assert.equal(saved.upgradeAssessments.rows[0].overallSeverity, "Critical");
        assert.ok(saved.checklist.every(item => item.completedAt === null));
        const disk = JSON.parse(await readFile(storagePath, "utf8"));
        assert.deepEqual(disk.reviews, saved.reviews);
        assert.equal((await post("/request", { kind: "question", prompt: "bad", taskId: 99 })).status, 400);
    });
    await t.test("cancellation rejects late completions and assessment publication", async () => {
        const job = await (await post("/request", { kind: "question", prompt: "Review upgrades", taskId: 3 })).json();
        await post("/cancel", {});
        await assert.rejects(action("complete_request", { requestId: job.requestId, answer: "Late result" }), /canceled/);
        await assert.rejects(action("publish_data", { requestId: job.requestId, section: "upgradeAssessments", result: { isSuccessful: true, results: { data: [] }, totalRecords: 0 } }), /canceled/);
        await assert.rejects(action("publish_data", { requestId: job.requestId, section: "appDeployments", result: { isSuccessful: true, results: { data: [] }, totalRecords: 0 } }), /canceled/);
        assert.equal((await state()).reviews["3"].answer, "Task 3 result");
    });
    await t.test("clears one saved result without affecting data or another panel's pending request", async () => {
        const job = await (await post("/request", { kind: "question", prompt: "Review upgrades", taskId: 3 })).json();
        const before = await state();
        const pending = await post("/clear-review", { taskId: 3 });
        assert.equal(pending.status, 400);
        assert.match((await pending.json()).error, /cancel.*pending request/);
        assert.equal((await post("/clear-review", { taskId: 1 })).status, 200);
        const saved = await state();
        assert.equal(saved.reviews["1"], undefined);
        assert.deepEqual(saved.reviews["3"], before.reviews["3"]);
        assert.deepEqual(saved.reviews.overview, before.reviews.overview);
        assert.equal(saved.job.id, job.requestId);
        assert.equal(saved.job.status, "pending");
        for (const section of ["inventory", "advisor", "metrics", "upgradeAssessments", "appDeployments", "emm", "checklist", "filters", "settings"]) assert.deepEqual(saved[section], before[section]);
        for (const input of [{}, { taskId: 0 }, { taskId: 99 }, { taskId: "1" }]) assert.equal((await post("/clear-review", input)).status, 400);
        await post("/cancel", {});
    });
    await t.test("publishes application evidence in task 4 and preserves it when a later read fails", async () => {
        const before = await state();
        const applicationId = `/subscriptions/${SUBSCRIPTION}/resourceGroups/arc-breakout-servers/providers/Microsoft.Compute/galleries/catalog/applications/agent`;
        const rows = [
            { id: `${applicationId}/versions/1.0.0`, type: "Microsoft.Compute/galleries/applications/versions", properties: { provisioningState: "Succeeded" } },
            { id: `/subscriptions/${SUBSCRIPTION}/resourceGroups/other-servers/providers/Microsoft.HybridCompute/machines/server1/applications/agent`, type: "Microsoft.HybridCompute/machines/applications", properties: { packageReferenceId: `${applicationId}/versions/1.0.0`, instanceView: { version: "1.0.0", result: "Succeeded" } } },
        ];
        let job = await (await post("/request", { kind: "question", prompt: "Review applications", taskId: 4 })).json();
        assert.match(messages.at(-1).prompt, /section appDeployments/);
        assert.match(messages.at(-1).prompt, /packageReferenceId/);
        assert.match(messages.at(-1).prompt, /nextLink/);
        await action("publish_data", { requestId: job.requestId, section: "appDeployments", result: { isSuccessful: true, results: { data: rows }, totalRecords: rows.length } });
        await action("complete_request", { requestId: job.requestId, answer: "Application evidence loaded" });
        const saved = await state();
        assert.equal(saved.appDeployments.rows[1].reportedVersion, "1.0.0");
        assert.equal(saved.reviews["4"].answer, "Application evidence loaded");
        for (const section of ["inventory", "advisor", "metrics", "upgradeAssessments", "checklist", "filters", "settings"]) assert.deepEqual(saved[section], before[section]);
        job = await (await post("/request", { kind: "question", prompt: "Review applications again", taskId: 4 })).json();
        await assert.rejects(action("publish_data", { requestId: job.requestId, section: "appDeployments", result: { isSuccessful: true, results: { data: [] }, skipToken: "more" } }), /incomplete/);
        await action("complete_request", { requestId: job.requestId, answer: "Application read failed", errors: { appDeployments: "Read permission required" } });
        assert.deepEqual((await state()).appDeployments.rows, saved.appDeployments.rows);
        assert.equal((await state()).appDeployments.error, "Read permission required");
        assert.ok((await state()).checklist.every(item => item.completedAt === null));
    });
    await t.test("persists scoped EMM evidence, keeps its review in task 2 and preserves data on failure", async () => {
        const before = await state();
        const resource = { id: `/subscriptions/${SUBSCRIPTION}/resourceGroups/${EMM_RESOURCE_GROUP}/providers/Microsoft.HybridCompute/machines/server1`, name: "server1", os: "Linux", type: "microsoft.hybridcompute/machines" };
        const result = { resources: { isSuccessful: true, results: { data: [resource] }, totalRecords: 1 }, policies: { isSuccessful: true, results: { data: [] }, totalRecords: 0 }, assignments: [] };
        let job = await (await post("/request", { kind: "question", prompt: "Review EMM", taskId: 2 })).json();
        assert.match(messages.at(-1).prompt, /section emm/);
        assert.match(messages.at(-1).prompt, /actual policy initiative assignment/);
        await action("publish_data", { section: "emm", requestId: job.requestId, result });
        await action("complete_request", { requestId: job.requestId, answer: "EMM evidence loaded; policy compliance is unverified" });
        const saved = await state();
        assert.equal(saved.emmSummary.total, 1);
        assert.ok(saved.emmSummary.services.every(service => service.unknown === 1 && service.compliant === 0));
        assert.equal(saved.reviews["2"].answer, "EMM evidence loaded; policy compliance is unverified");
        for (const section of ["inventory", "advisor", "metrics", "upgradeAssessments", "appDeployments", "checklist", "filters", "settings"]) assert.deepEqual(saved[section], before[section]);
        job = await (await post("/request", { kind: "question", prompt: "Review EMM again", taskId: 2 })).json();
        await assert.rejects(action("publish_data", { section: "emm", requestId: job.requestId, result: { ...result, policies: { ...result.policies, skipToken: "next" } } }), /incomplete/);
        await action("complete_request", { requestId: job.requestId, answer: "EMM retrieval failed", errors: { emm: "Policy read failed" } });
        assert.deepEqual((await state()).emm.rows, saved.emm.rows);
        assert.equal((await state()).emm.error, "Policy read failed");
    });
    await t.test("migrates and persists TPM and Machine Configuration evidence in their own review panels", async () => {
        const resource = { id: `/subscriptions/${SUBSCRIPTION}/resourceGroups/${EMM_RESOURCE_GROUP}/providers/Microsoft.HybridCompute/machines/server1`, name: "server1", os: "Linux", type: "microsoft.hybridcompute/machines", identityKeyStore: "Tpm", tpmReady: "true" };
        const arg = rows => ({ isSuccessful: true, results: { data: rows }, totalRecords: rows.length });
        const evidence = {
            machineSecurity: arg([resource]),
            machineConfiguration: { resources: arg([resource]), policies: arg([]) },
        };
        for (const [taskId, section] of [[5, "machineSecurity"], [6, "machineConfiguration"]]) {
            assert.deepEqual((await state())[section].rows, []);
            const job = await (await post("/request", { kind: "question", prompt: "Review this panel", taskId })).json();
            const prompt = messages.at(-1).prompt;
            assert.match(prompt, new RegExp(`section ${section}`));
            assert.match(prompt, taskId === 5 ? /identityKeyStore equal to Tpm/ : /Guest Configuration or Machine Configuration/);
            await action("publish_data", { section, requestId: job.requestId, result: evidence[section] });
            await action("complete_request", { requestId: job.requestId, answer: `${section} loaded` });
            const saved = await state();
            assert.equal(saved[section].rows[0].name, "server1");
            assert.equal(saved.reviews[String(taskId)].answer, `${section} loaded`);
            assert.ok(saved.checklist.every(item => item.completedAt === null));
            const failed = await (await post("/request", { kind: "question", prompt: "Review again", taskId })).json();
            const incomplete = taskId === 5 ? { ...evidence[section], skipToken: "next" } : { ...evidence[section], policies: { ...evidence[section].policies, skipToken: "next" } };
            await assert.rejects(action("publish_data", { section, requestId: failed.requestId, result: incomplete }), /incomplete/);
            await action("complete_request", { requestId: failed.requestId, answer: "Retrieval failed", errors: { [section]: "Incomplete result" } });
            assert.deepEqual((await state())[section].rows, saved[section].rows);
            await assert.rejects(action("publish_data", { section, requestId: failed.requestId, result: evidence[section] }), /canceled|completed/);
        }
        assert.equal((await state()).machineConfigurationSummary.counts.unassessed, 1);
        assert.equal((await state()).machineSecurity.rows[0].tpmPresent, null);
    });
    await t.test("requires every refresh section and records explicit retrieval failures", async () => {
        const job = await (await post("/request", { kind: "refresh" })).json();
        assert.match(messages.at(-1).prompt, /all 8 sections/);
        await assert.rejects(action("complete_request", { requestId: job.requestId, answer: "Incomplete", errors: { inventory: "Unavailable", advisor: "Unavailable", metrics: "Unavailable" } }), /upgradeAssessments/);
        await assert.rejects(action("complete_request", { requestId: job.requestId, answer: "Incomplete", errors: { inventory: "Unavailable", advisor: "Unavailable", metrics: "Unavailable", upgradeAssessments: "Assessment retrieval failed" } }), /appDeployments/);
        const errors = { inventory: "Unavailable", advisor: "Unavailable", metrics: "Unavailable", upgradeAssessments: "Assessment retrieval failed", appDeployments: "Application retrieval failed" };
        await assert.rejects(action("complete_request", { requestId: job.requestId, answer: "Incomplete", errors }), /emm/);
        errors.emm = "EMM retrieval failed";
        await assert.rejects(action("complete_request", { requestId: job.requestId, answer: "Incomplete", errors }), /machineSecurity/);
        errors.machineSecurity = "Security retrieval failed";
        await assert.rejects(action("complete_request", { requestId: job.requestId, answer: "Incomplete", errors }), /machineConfiguration/);
        const result = await action("complete_request", { requestId: job.requestId, answer: "Failed to retrieve data", errors: { ...errors, machineConfiguration: "Configuration retrieval failed" } });
        assert.equal(result.status, "error");
        assert.equal((await state()).upgradeAssessments.error, "Assessment retrieval failed");
        assert.equal((await state()).upgradeAssessments.rows[0].overallSeverity, "Critical");
    });
    await t.test("clears the overview legacy answer and finished notice without clearing snapshots", async () => {
        const before = await state();
        assert.equal((await post("/clear-review", { taskId: null })).status, 200);
        const saved = await state();
        assert.equal(saved.answer, "");
        assert.equal(saved.reviews.overview, undefined);
        assert.equal(saved.job, null);
        assert.deepEqual(saved.reviews["3"], before.reviews["3"]);
        for (const section of ["inventory", "advisor", "metrics", "upgradeAssessments", "appDeployments", "emm", "checklist"]) assert.deepEqual(saved[section], before[section]);
    });
    await t.test("only an authenticated same-origin click can launch the fixed EMM URL", async () => {
        const denied = await fetch(new URL("/open-emm", url), { method: "POST", body: "{}" });
        assert.equal(denied.status, 403);
        assert.equal((await fetch(new URL("/open-emm", url), { method: "POST", headers: { ...headers, Origin: "https://example.invalid" }, body: "{}" })).status, 403);
        assert.equal(launches.length, 0);
        const response = await post("/open-emm", { url: "https://example.invalid", executable: "not-an-executable" });
        if (process.platform === "win32") {
            assert.equal(response.status, 200);
            assert.equal(launches.length, 1);
            assert.match(launches[0].command, /Microsoft[\\/]Edge[\\/]Application[\\/]msedge\.exe$/);
            assert.deepEqual(launches[0].args, [EMM_URL]);
        } else {
            assert.equal(response.status, 400);
            assert.equal(launches.length, 0);
        }
    });
    await t.test("schedules one background refresh, skips busy ticks and supports all intervals, manual and enqueue failures", async t => {
        t.mock.timers.enable({ apis: ["setInterval", "Date"], now: Date.parse("2026-11-11T16:00:00Z") });
        const minute = 60000;
        const waitFor = async predicate => {
            for (let attempt = 0; attempt < 100; attempt++) {
                if (await predicate()) return;
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            assert.fail("Timed out waiting for the scheduled refresh");
        };
        const before = await state();
        const start = messages.length;
        t.mock.timers.tick(60 * minute);
        assert.equal((await state()).autoRefresh.nextRefreshAt, null);
        assert.equal(messages.length, start);
        for (const minutes of [-1, 1, 10, "5", null, 0.5]) assert.equal((await post("/refresh-schedule", { minutes })).status, 400);
        assert.equal((await post("/refresh-schedule", {})).status, 400);
        assert.equal((await state()).settings.refreshMinutes, 0);
        assert.equal((await fetch(new URL("/refresh-schedule", url), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ minutes: 5 }) })).status, 403);
        assert.equal((await fetch(new URL("/refresh-schedule", url), { method: "POST", headers: { ...headers, Origin: "https://example.invalid" }, body: JSON.stringify({ minutes: 5 }) })).status, 403);
        assert.equal((await post("/refresh-schedule", { minutes: 5 })).status, 200);
        const due = (await state()).autoRefresh.nextRefreshAt;
        assert.equal(Date.parse(due), Date.now() + 5 * minute);
        assert.equal(messages.length, start);
        t.mock.timers.tick(2 * minute);
        await canvas.open({ instanceId: "test-second-canvas" });
        try {
            assert.equal((await state()).autoRefresh.nextRefreshAt, due);
            t.mock.timers.tick(3 * minute);
            await waitFor(() => messages.length === start + 1);
            assert.match(messages.at(-1).prompt, /configured background refresh interval is due/);
            assert.match(messages.at(-1).prompt, /Only read Azure resources/);
            assert.equal((await state()).job.source, "automatic");
            t.mock.timers.tick(5 * minute);
            await new Promise(resolve => setTimeout(resolve, 20));
            assert.equal(messages.length, start + 1);
        } finally {
            await canvas.onClose({ instanceId: "test-second-canvas" });
        }
        await post("/cancel", {});
        await post("/refresh-schedule", { minutes: 30 });
        t.mock.timers.tick(29 * minute);
        assert.equal(messages.length, start + 1);
        t.mock.timers.tick(minute);
        await waitFor(() => messages.length === start + 2);
        await post("/refresh-schedule", { minutes: 0 });
        assert.equal((await state()).job.status, "pending");
        assert.equal((await state()).autoRefresh.nextRefreshAt, null);
        t.mock.timers.tick(60 * minute);
        assert.equal(messages.length, start + 2);
        await post("/cancel", {});
        await post("/refresh-schedule", { minutes: 60 });
        sendError = "Test queue unavailable";
        t.mock.timers.tick(59 * minute);
        assert.equal(messages.length, start + 2);
        t.mock.timers.tick(minute);
        await waitFor(async () => (await state()).autoRefresh.error);
        const failed = await state();
        assert.equal(failed.job.status, "error");
        assert.match(failed.autoRefresh.error, /Test queue unavailable/);
        assert.ok(logs.some(message => /Automatic refresh failed/.test(message)));
        assert.equal(Date.parse(failed.autoRefresh.nextRefreshAt), Date.now() + 60 * minute);
        sendError = null;
        await post("/refresh-schedule", { minutes: 0 });
        const after = await state();
        for (const section of ["inventory", "advisor", "metrics", "upgradeAssessments", "appDeployments", "emm", "checklist", "filters", "reviews"]) assert.deepEqual(after[section], before[section]);
        assert.deepEqual(after.settings, before.settings);
        assert.deepEqual(after.autoRefresh, { nextRefreshAt: null, error: null });
    });
    await t.test("reload retains per-panel reviews, manual checklist state and refresh preference; closing stops the timer", async t => {
        t.mock.timers.enable({ apis: ["setInterval", "Date"], now: Date.parse("2026-11-11T16:00:00Z") });
        assert.equal((await post("/refresh-schedule", { minutes: 60 })).status, 200);
        const count = messages.length;
        await canvas.onClose({ instanceId });
        t.mock.timers.tick(60 * 60000);
        assert.equal(messages.length, count);
        instanceId = "test-reloaded";
        await import(`${extensionUrl}?test=${randomUUID()}`);
        const reloaded = await canvas.open({ instanceId });
        const reloadedUrl = new URL(reloaded.url);
        const saved = await (await fetch(new URL("/state", reloadedUrl), { headers: { "X-Arc-Token": reloadedUrl.searchParams.get("token") } })).json();
        assert.equal(saved.reviews["3"].answer, "Task 3 result");
        assert.equal(saved.reviews["1"], undefined);
        assert.equal(saved.reviews.overview, undefined);
        assert.equal(saved.answer, "");
        assert.equal(saved.appearance, "dark");
        assert.equal(saved.appDeployments.rows[1].reportedVersion, "1.0.0");
        assert.equal(saved.emm.rows[0].name, "server1");
        assert.equal(saved.machineSecurity.rows[0].identityKeyStore, "Tpm");
        assert.equal(saved.machineConfiguration.rows[0].name, "server1");
        assert.equal(saved.reviews["2"].answer, "EMM retrieval failed");
        assert.equal(saved.settings.workspaceId, manualWorkspace);
        assert.equal(saved.settings.hours, 6);
        assert.equal(saved.settings.defaultWorkspaceId, DEFAULT_WORKSPACE);
        assert.equal(saved.settings.refreshMinutes, 60);
        assert.equal(Date.parse(saved.autoRefresh.nextRefreshAt), Date.now() + 60 * 60000);
        assert.ok(saved.checklist.every(item => item.completedAt === null));
        assert.equal((await fetch(new URL("/refresh-schedule", reloadedUrl), { method: "POST", headers: { "X-Arc-Token": reloadedUrl.searchParams.get("token"), "Content-Type": "application/json", Origin: reloadedUrl.origin }, body: JSON.stringify({ minutes: 0 }) })).status, 200);
        url = reloadedUrl;
        token = url.searchParams.get("token");
        headers = { ...headers, "X-Arc-Token": token, Origin: url.origin };
    });
    await t.test("discovers account scopes, saves title and multi-scope selections, and rejects invalid or stale changes", async () => {
        const before = await state();
        assert.equal((await post("/settings", { title: "Team's Arc estate" })).status, 200);
        assert.deepEqual((await state()).emm, before.emm);
        assert.deepEqual((await state()).reviews, before.reviews);
        const discovered = await post("/scope-options", { subscriptionIds: null });
        assert.equal(discovered.status, 200);
        const catalog = await discovered.json();
        assert.equal(catalog.subscriptions.length, 2);
        assert.equal(catalog.resourceGroups.length, 2);
        assert.equal(new Set(catalog.resourceGroups.map(group => group.name)).size, 1);
        assert.ok(azureCalls.some(args => args.join(" ").includes(secondSubscription)));
        const selection = { title: "Team's Arc estate", subscriptionIds: [SUBSCRIPTION, secondSubscription], resourceGroupIds: catalog.resourceGroups.map(group => group.id) };
        assert.equal((await post("/settings", selection)).status, 200);
        const changed = await state();
        for (const section of ["inventory", "advisor", "metrics", "emm", "machineSecurity", "machineConfiguration", "appDeployments", "upgradeAssessments"]) {
            assert.deepEqual(changed[section].rows, []);
            assert.equal(changed[section].updatedAt, null);
        }
        assert.deepEqual(changed.reviews, {});
        const machine = { id: `${catalog.resourceGroups[1].id}/providers/Microsoft.HybridCompute/machines/test`, name: "test", type: "microsoft.hybridcompute/machines" };
        const result = { isSuccessful: true, results: { data: [machine] }, totalRecords: 1 };
        await action("publish_data", { section: "inventory", result });
        assert.equal((await state()).inventory.rows[0].id, machine.id);
        await assert.rejects(action("publish_data", { section: "inventory", result: { ...result, results: { data: [{ ...machine, id: machine.id.replace("/shared/", "/outside/") }] } } }), /out-of-subscription/);
        for (const input of [
            { subscriptionIds: [] }, { subscriptionIds: ["99999999-2222-3333-4444-555555555555"] },
            { resourceGroupIds: [] }, { subscriptionIds: [SUBSCRIPTION], resourceGroupIds: [catalog.resourceGroups[1].id] },
            { resourceGroupIds: [`/subscriptions/${secondSubscription}/resourceGroups/unknown`] },
            { title: " " }, { title: "x".repeat(121) }, { title: null }, { workspaceId: null }, { workspaceId: 42 }, { unknown: true },
        ]) assert.equal((await post("/settings", input)).status, 400);
        const pending = await (await post("/request", { kind: "question", prompt: "Review this scope" })).json();
        assert.ok(messages.at(-1).prompt.includes(secondSubscription));
        assert.equal((await post("/settings", { title: "Blocked" })).status, 400);
        assert.equal((await post("/scope-options", { subscriptionIds: null })).status, 400);
        await post("/cancel", {});
        assert.equal((await post("/settings", { subscriptionIds: null, resourceGroupIds: null })).status, 200);
        assert.deepEqual((await action("get_refresh_plan", {})).subscriptionIds, [SUBSCRIPTION, secondSubscription]);
        await assert.rejects(action("publish_data", { section: "inventory", result, requestId: pending.requestId }), /canceled|completed/);
        const current = await state();
        azureError = "Please sign in to Azure CLI";
        assert.equal((await post("/scope-options", { subscriptionIds: null })).status, 400);
        azureError = null;
        assert.deepEqual((await state()).scopeOptions, current.scopeOptions);
        assert.deepEqual((await state()).settings, current.settings);
        const calls = azureCalls.length;
        groupError = "No resource-group read access";
        assert.equal((await post("/scope-options", { subscriptionsOnly: true })).status, 200);
        assert.equal(azureCalls.length, calls + 1);
        assert.equal((await state()).scopeOptions.subscriptions.length, 2);
        assert.equal((await post("/scope-options", { subscriptionIds: [secondSubscription] })).status, 400);
        assert.equal((await state()).scopeOptions.subscriptions.length, 2);
        groupError = null;
        assert.equal((await post("/scope-options", { subscriptionIds: [secondSubscription] })).status, 200);
        assert.ok((await state()).scopeOptions.resourceGroups.every(group => group.subscriptionId === secondSubscription));
        assert.equal((await post("/settings", { subscriptionIds: [secondSubscription], resourceGroupIds: null })).status, 200);
        assert.deepEqual((await action("get_refresh_plan", {})).subscriptionIds, [secondSubscription]);
        assert.equal((await post("/settings", { subscriptionIds: null, resourceGroupIds: null })).status, 200);
        const disk = JSON.parse(await readFile(storagePath, "utf8"));
        assert.equal(disk.settings.title, "Team's Arc estate");
        assert.equal(disk.settings.subscriptionIds, null);
        await canvas.onClose({ instanceId });
        instanceId = "test-settings-reloaded";
        await import(`${extensionUrl}?test=${randomUUID()}`);
        const reopened = await canvas.open({ instanceId });
        assert.equal(reopened.title, "Team's Arc estate");
        url = new URL(reopened.url);
        token = url.searchParams.get("token");
        headers = { ...headers, "X-Arc-Token": token, Origin: url.origin };
        assert.equal((await state()).settings.subscriptionIds, null);
        assert.equal((await state()).settings.resourceGroupIds, null);
        assert.equal((await state()).settings.title, "Team's Arc estate");
    });
    await t.test("opens a fresh profile without any legacy tenant or workspace and supports all scopes", async () => {
        await canvas.onClose({ instanceId });
        process.env.COPILOT_HOME = join(directory, "fresh");
        instanceId = "test-fresh";
        await import(`${extensionUrl}?test=${randomUUID()}`);
        const opened = await canvas.open({ instanceId });
        assert.equal(opened.title, "Azure Arc operations");
        url = new URL(opened.url);
        token = url.searchParams.get("token");
        headers = { ...headers, "X-Arc-Token": token, Origin: url.origin };
        const fresh = await state();
        assert.equal(fresh.settings.subscriptionIds, null);
        assert.equal(fresh.settings.resourceGroupIds, null);
        assert.equal(fresh.settings.workspaceId, "");
        assert.equal(fresh.taskPlans.length, 7);
        assert.ok(fresh.taskPlans.every(plan => !JSON.stringify(plan).includes("Caldova")));
        assert.equal((await post("/request", { kind: "refresh" })).status, 400);
        assert.equal((await state()).job, null);
        assert.equal((await post("/scope-options", { subscriptionsOnly: true })).status, 200);
        assert.equal((await post("/settings", { title: "All estates", subscriptionIds: null, resourceGroupIds: null })).status, 200);
        const response = await post("/request", { kind: "refresh" });
        assert.equal(response.status, 202);
        assert.match(messages.at(-1).prompt, /Monitoring is not configured/);
        assert.deepEqual((await state()).job.settings.subscriptionIds, [SUBSCRIPTION, secondSubscription]);
        await post("/cancel", {});
    });
});
