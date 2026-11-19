const token = document.querySelector('meta[name="arc-token"]').content;
const $ = id => document.getElementById(id);
let state;
let rendered = "";
let loading = false;
let searchTimer;
let appSelection = null;
let settingsDirty = false;
let scopeLoading = false;
let themeOverride = new URLSearchParams(window.location.search).get("clawpilotTheme");
if (!["light", "dark"].includes(themeOverride)) themeOverride = null;
const names = { "microsoft.hybridcompute/machines": "Arc server", "microsoft.kubernetes/connectedclusters": "Arc Kubernetes", "microsoft.azurearcdata/sqlserverinstances": "Arc SQL", "microsoft.connectedvmwarevsphere/virtualmachines": "Arc VMware VM", "microsoft.scvmm/virtualmachines": "Arc SCVMM VM" };
const colors = ["var(--cp-accent)", "var(--cp-success)", "var(--cp-warning)", "var(--cp-text-muted)"];
const text = (tag, content, className) => {
    const element = document.createElement(tag);
    element.textContent = content;
    if (className) element.className = className;
    return element;
};
const stamp = date => date ? new Date(date).toLocaleString() : "not loaded";
const portal = id => `https://portal.azure.com/#resource${id}`;
function error(message) { $("error").textContent = message; $("error").hidden = !message; }
async function api(path, data) {
    const response = await fetch(path, { method: data === undefined ? "GET" : "POST", headers: { "X-Arc-Token": token, "Content-Type": "application/json" }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
    return result;
}
async function act(path, data) {
    try { error(""); await api(path, data); await update(true); } catch (e) { error(e.message); }
}
function resources() {
    const f = state.filters;
    const lower = value => String(value ?? "").toLowerCase();
    return state.inventory.rows.filter(row => names[row.type]).filter(row =>
        (!f.search || lower(`${row.name} ${row.id} ${row.os}`).includes(lower(f.search))) &&
        ["type", "status", "resourceGroup", "location"].every(key => !f[key] || lower(row[key]) === lower(f[key])) &&
        (!f.resourceId || lower(row.id) === lower(f.resourceId)));
}
function options(element, values, current, allLabel, labels = {}) {
    element.replaceChildren();
    if (allLabel) element.add(new Option(allLabel, ""));
    const entries = [...new Set(values)].filter(Boolean);
    if (current && !entries.includes(current)) entries.push(current);
    for (const value of entries.sort()) element.add(new Option(labels[value] ?? value, value));
    element.value = current;
}
const selectedValues = element => [...element.selectedOptions].map(option => option.value);
function scopeDraft() {
    return {
        title: $("dashboard-title").value,
        subscriptionIds: $("all-subscriptions").checked ? null : selectedValues($("subscriptions")),
        resourceGroupIds: $("all-resource-groups").checked ? null : selectedValues($("scope-resource-groups")),
    };
}
function scopeOptions(catalog, draft) {
    const fill = (element, entries, selected) => {
        element.replaceChildren(...entries.map(([value, label]) => {
            const option = new Option(label, value);
            option.selected = selected?.some(id => id.toLowerCase() === value.toLowerCase()) ?? false;
            return option;
        }));
        for (const id of selected ?? []) {
            if (![...element.options].some(option => option.value.toLowerCase() === id.toLowerCase())) element.add(new Option(`${id} (not in loaded choices)`, id, false, true));
        }
    };
    const subscriptions = new Map(catalog.subscriptions.map(item => [item.id.toLowerCase(), `${item.name} (${item.id})`]));
    fill($("subscriptions"), catalog.subscriptions.map(item => [item.id, subscriptions.get(item.id.toLowerCase())]), draft.subscriptionIds);
    const groups = catalog.resourceGroups.filter(item => draft.subscriptionIds === null || draft.subscriptionIds.some(id => id.toLowerCase() === item.subscriptionId.toLowerCase()));
    fill($("scope-resource-groups"), groups.map(item => [item.id, `${item.name} / ${subscriptions.get(item.subscriptionId.toLowerCase())}`]), draft.resourceGroupIds);
    $("subscriptions").disabled = $("all-subscriptions").checked || scopeLoading;
    $("scope-resource-groups").disabled = $("all-resource-groups").checked || scopeLoading;
}
function renderSettings() {
    document.title = state.settings.title;
    $("dashboard-heading").textContent = state.settings.title;
    $("active-scope").textContent = state.scopeLabel;
    $("scope-summary").textContent = state.scopeLabel;
    if (!settingsDirty && !scopeLoading) {
        $("dashboard-title").value = state.settings.title;
        $("all-subscriptions").checked = state.settings.subscriptionIds === null;
        $("all-resource-groups").checked = state.settings.resourceGroupIds === null;
        scopeOptions(state.scopeOptions, state.settings);
        $("scope-options-status").textContent = state.scopeOptions.updatedAt ? `Subscriptions loaded ${stamp(state.scopeOptions.updatedAt)}. Load resource groups for your subscription selection if you want to choose specific groups.` : "Load subscriptions from the signed-in Azure CLI account, then save settings. Load resource groups only if you want a specific group selection.";
    }
    if (!state.scopeOptions.updatedAt) $("settings-panel").open = true;
    const pending = state.job?.status === "pending";
    for (const id of ["load-scopes", "save-settings", "dashboard-title", "all-subscriptions", "all-resource-groups"]) $(id).disabled = pending || scopeLoading;
    $("load-resource-groups").disabled = pending || scopeLoading || !state.scopeOptions.updatedAt;
    $("subscriptions").disabled = pending || scopeLoading || $("all-subscriptions").checked;
    $("scope-resource-groups").disabled = pending || scopeLoading || $("all-resource-groups").checked;
}
function buildSummary(rows, recommendations) {
    const connected = rows.filter(row => row.status.toLowerCase() === "connected").length;
    const cards = [
        ["Arc servers", rows.filter(row => row.type === "microsoft.hybridcompute/machines").length, "Within current filters"],
        ["Arc Kubernetes", rows.filter(row => row.type === "microsoft.kubernetes/connectedclusters").length, "Within current filters"],
        ["Connected", connected, `${rows.length - connected} offline or unknown / ${rows.length} resources`],
        ["Advisor recommendations", state.advisor.updatedAt ? recommendations.length : "--", `${recommendations.filter(row => row.impact.toLowerCase() === "high").length} high impact`],
    ];
    $("summary").replaceChildren(...cards.map(([label, count, detail]) => {
        const card = text("div", "", "card");
        card.append(text("div", label, "label"), text("strong", state.inventory.updatedAt ? String(count) : "--"), text("span", detail));
        return card;
    }));
}
function drawChart(metric, title, rows) {
    const card = text("div", "", "chart");
    const head = text("div", "", "chart-title");
    head.append(text("h3", title), text("small", ["cpu", "memory"].includes(metric) ? "%" : "KiB/s"));
    card.append(head);
    const mismatch = state.metrics.workspaceId.toLowerCase() !== state.settings.workspaceId.toLowerCase() || state.metrics.hours !== state.settings.hours;
    if (mismatch || !rows.length) {
        card.append(text("div", mismatch ? "Settings changed. Refresh to load this workspace and window." : "No samples for matching resources.\nMissing data is not zero.", "empty source"));
        return card;
    }
    const grouped = new Map();
    for (const row of rows) {
        const key = `${row.resourceId.toLowerCase()}|${row.series}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(row);
    }
    const displayed = [...grouped.values()].sort((a, b) => a[0].resourceId.localeCompare(b[0].resourceId) || a[0].series.localeCompare(b[0].series)).slice(0, 8);
    const allTimes = rows.map(row => Date.parse(row.time));
    const maximumTime = Date.parse(state.metrics.updatedAt);
    const minimumTime = maximumTime - state.metrics.hours * 3600000;
    const maximum = Math.max(["cpu", "memory"].includes(metric) ? 100 : 1, ...rows.map(row => row.value));
    const minimum = Math.min(0, ...rows.map(row => row.value));
    const W = 490, H = 180, left = 44, right = 12, top = 14, bottom = 28;
    const x = t => left + (t - minimumTime) / (maximumTime - minimumTime || 1) * (W - left - right);
    const y = v => H - bottom - (v - minimum) / (maximum - minimum || 1) * (H - top - bottom);
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("role", "img"); svg.setAttribute("aria-label", `${title}: ${grouped.size} resource-counter series`);
    function shape(tag, attrs, value) {
        const element = document.createElementNS(svgNS, tag);
        for (const [key, val] of Object.entries(attrs)) element.setAttribute(key, val);
        if (value !== undefined) element.textContent = value;
        svg.append(element); return element;
    }
    for (const value of [minimum, (maximum + minimum) / 2, maximum]) {
        shape("line", { x1: left, x2: W - right, y1: y(value), y2: y(value), stroke: "var(--cp-border)", "stroke-dasharray": "3 4" });
        shape("text", { x: left - 7, y: y(value) + 3, "text-anchor": "end", fill: "var(--cp-text-muted)", "font-size": 10 }, value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toFixed(value < 10 ? 1 : 0));
    }
    for (const t of [minimumTime, (minimumTime + maximumTime) / 2, maximumTime]) shape("text", { x: x(t), y: H - 5, "text-anchor": t === minimumTime ? "start" : t === maximumTime ? "end" : "middle", fill: "var(--cp-text-muted)", "font-size": 10 }, new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", ...(state.metrics.hours > 24 ? { month: "short", day: "numeric" } : {}) }));
    const legend = text("div", "", "legend");
    const expectedBin = ({ 1: 2, 6: 10, 24: 30, 168: 240 }[state.metrics.hours]) * 60000;
    displayed.forEach((samples, index) => {
        samples.sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
        const color = colors[index % colors.length];
        let previous = null;
        const path = samples.filter(sample => Date.parse(sample.time) >= minimumTime && Date.parse(sample.time) <= maximumTime).map(sample => {
            const time = Date.parse(sample.time);
            const command = previous === null || time - previous > expectedBin * 1.8 ? "M" : "L";
            previous = time;
            const point = shape("circle", { cx: x(time), cy: y(sample.value), r: 1.8, fill: color });
            const tip = document.createElementNS(svgNS, "title");
            tip.textContent = `${sample.resourceId.split("/").pop()}: ${sample.series}\n${stamp(sample.time)}: ${sample.value.toFixed(2)} ${sample.unit}`;
            point.append(tip);
            return `${command}${x(time).toFixed(2)},${y(sample.value).toFixed(2)}`;
        }).join(" ");
        shape("path", { d: path, fill: "none", stroke: color, "stroke-width": 1.6, "stroke-dasharray": index >= 4 ? "5 3" : "none" });
        const item = text("span", "");
        const dot = text("i", "", "dot"); dot.style.backgroundColor = color;
        item.append(dot, document.createTextNode(`${samples[0].resourceId.split("/").pop()} / ${samples[0].series}`));
        legend.append(item);
    });
    card.append(svg, legend);
    if (grouped.size > 8) card.append(text("p", `Showing 8 of ${grouped.size} series. Filter resources to inspect the rest.`, "note"));
    if (Math.max(...allTimes) < Date.now() - expectedBin * 2) card.append(text("p", `Latest sample: ${stamp(Math.max(...allTimes))}. Telemetry is stale.`, "stale"));
    return card;
}
function buildTaskPanels() {
    const signature = JSON.stringify(state.taskPlans);
    if ($("task-panels").dataset.plans === signature) return;
    const expanded = new Set([...$("task-panels").querySelectorAll("details[open]")].map(panel => panel.id));
    $("task-panels").replaceChildren();
    $("task-panels").dataset.plans = signature;
    for (const item of state.checklist) {
        const plan = state.taskPlans.find(plan => plan.taskId === item.id);
        const panel = text("details", "", "panel");
        panel.id = `task-${item.id}`;
        panel.open = expanded.has(panel.id);
        const summary = text("summary", "");
        const badge = text("span", "", "badge"); badge.id = `task-status-${item.id}`;
        summary.append(text("span", String(item.id).padStart(2, "0"), "order"), text("h2", item.text), badge);
        const content = text("div", "", "panel-content");
        content.append(text("p", plan.description, "note"), text("p", plan.navigation, "source"));
        const link = text("a", item.id === 2 ? "Open EMM dashboard in Edge" : item.id === 3 ? "Open Upgrade Insights" : item.id === 4 ? "Open Arc servers" : item.id === 6 ? "Open Azure Policy" : "Open Azure portal");
        link.href = plan.portalUrl; link.target = "_blank"; link.rel = "noopener noreferrer";
        content.append(link);
        if (item.id === 2) {
            const status = text("p", "", "source");
            status.setAttribute("role", "status");
            link.addEventListener("click", async event => {
                event.preventDefault();
                try {
                    error("");
                    await api("/open-emm", {});
                    status.textContent = "EMM link sent to Microsoft Edge.";
                } catch (e) {
                    status.textContent = "Could not open Edge. Copy the EMM link and open it manually.";
                    error(e.message);
                }
            });
            content.append(status, $("emm-template").content.cloneNode(true));
        }
        if (item.id === 1) content.append($("performance-template").content.cloneNode(true));
        if (item.id === 5) content.append($("security-template").content.cloneNode(true));
        if (item.id === 6) content.append($("configuration-template").content.cloneNode(true));
        if (item.id === 4) {
            content.append($("applications-template").content.cloneNode(true));
            content.querySelector("#app-clear-selection").addEventListener("click", () => {
                appSelection = null;
                renderAppDeployments();
            });
        }
        if (item.id === 3) {
            const code = text("code", plan.query);
            const query = text("pre", ""); query.append(code);
            const coverage = text("p", "", "source"); coverage.id = "upgrade-coverage";
            const failure = text("div", "", "notice error"); failure.id = "upgradeAssessments-error"; failure.hidden = true;
            const assessments = text("div", "", "assessments"); assessments.id = "upgrade-assessments";
            content.append(query, coverage, failure, assessments, text("p", "Existing target-specific assessments are snapshots, not approval to upgrade. Unknown checks, missing assessments and stale data do not establish readiness.", "note"));
        }
        const toolbar = text("div", "", "task-toolbar");
        const review = text("button", "Review with Copilot", "primary");
        review.dataset.reviewButton = String(item.id);
        review.addEventListener("click", () => ask("question", `Help me ${item.text}. Review the task's evidence, explain gaps and provide relevant Azure portal navigation. Do not mark the task complete or modify Azure resources.`, item.id));
        const completion = text("label", "", "completion");
        const check = document.createElement("input"); check.type = "checkbox"; check.id = `task-check-${item.id}`;
        check.addEventListener("change", () => act("/checklist", { id: item.id, completed: check.checked }));
        const completedAt = text("span", ""); completedAt.id = `task-reviewed-${item.id}`;
        completion.append(check, text("span", "Mark reviewed"), completedAt);
        toolbar.append(review, completion);
        const output = text("section", "", "review-output"); output.setAttribute("aria-label", `Copilot review for task ${item.id}`);
        const heading = text("div", "", "section-head");
        const clear = text("button", "Clear result", "mini");
        clear.dataset.reviewClear = String(item.id);
        clear.setAttribute("aria-label", `Clear Copilot result for task ${item.id}`);
        clear.title = "Clear this saved Copilot response. Azure data and checklist progress are kept.";
        clear.addEventListener("click", () => act("/clear-review", { taskId: item.id }));
        heading.append(text("h3", "Copilot review"), clear);
        const status = text("p", "", "source"); status.id = `review-status-${item.id}`; status.setAttribute("role", "status");
        const cancel = text("button", "Cancel request", "mini"); cancel.hidden = true; cancel.dataset.reviewCancel = String(item.id);
        cancel.addEventListener("click", () => act("/cancel", {}));
        const answer = text("div", "", "answer"); answer.id = `answer-${item.id}`; answer.setAttribute("aria-live", "polite");
        const form = text("form", "", "ask-form");
        const question = document.createElement("input"); question.maxLength = 4000; question.required = true;
        question.placeholder = "Ask a follow-up about this task..."; question.setAttribute("aria-label", `Task ${item.id} follow-up question`);
        const submit = text("button", "Ask about this task"); submit.type = "submit"; submit.dataset.reviewButton = String(item.id);
        form.addEventListener("submit", event => { event.preventDefault(); ask("question", question.value, item.id); });
        form.append(question, submit);
        output.append(heading, status, cancel, answer, form);
        content.append(toolbar, output); panel.append(summary, content); $("task-panels").append(panel);
    }
    for (const key of ["workspace", "hours"]) $(key).addEventListener("change", () => act("/settings", { workspaceId: $("workspace").value, hours: Number($("hours").value) }));
}

function renderUpgradeAssessments(rows, ids, hasFilters) {
    const snapshot = state.upgradeAssessments;
    const assessments = snapshot.rows.filter(row => !hasFilters || ids.has(row.resourceId.toLowerCase()));
    const clusters = rows.filter(row => row.type === "microsoft.kubernetes/connectedclusters");
    const covered = new Set(assessments.filter(row => ids.has(row.resourceId.toLowerCase())).map(row => row.resourceId.toLowerCase())).size;
    const expanded = new Set([...$("upgrade-assessments").querySelectorAll("details[open]")].map(card => card.dataset.assessmentId));
    $("upgrade-coverage").textContent = `Assessments loaded ${stamp(snapshot.updatedAt)} | ${covered} / ${clusters.length} matching Arc Kubernetes clusters assessed | ${clusters.length - covered} without a saved assessment`;
    $("upgrade-assessments").replaceChildren(...assessments.map(row => {
        const card = text("details", "", "assessment");
        card.dataset.assessmentId = row.id;
        card.open = expanded.has(row.id);
        const severity = row.overallSeverity.toLowerCase();
        const summary = text("summary", "");
        summary.append(document.createTextNode(`${row.resourceId.split("/").pop()}: ${row.currentKubernetesVersion || "unknown"} -> ${row.targetKubernetesVersion || "unknown"} `),
            text("span", row.overallSeverity, `badge${["critical", "error", "high"].includes(severity) ? " bad" : severity === "warning" ? " warning" : ""}`));
        card.append(summary, text("p", `Assessed ${stamp(row.assessmentTime)} | Retrieved ${stamp(snapshot.updatedAt)}`, "source"));
        const link = text("a", "Open cluster in Azure portal"); link.href = portal(row.resourceId); link.target = "_blank"; link.rel = "noopener noreferrer";
        card.append(link);
        if (!ids.has(row.resourceId.toLowerCase())) card.append(text("p", "Cluster is absent from the current inventory snapshot. Verify the assessment's scope and freshness.", "stale"));
        const sections = [
            ["Component compatibility", row.componentCompatibility, check => `${check.name}: ${check.compatibilityStatus || "Unknown"} / ${check.severity || "Unknown"} | installed ${check.version || "unknown"}${check.minCompatibleVersion ? ` | minimum compatible ${check.minCompatibleVersion}` : ""}${check.notes ? ` | ${check.notes}` : ""}`],
            ["Readiness checks", row.readinessChecks, check => `${check.category || "Uncategorized"} / ${check.name}: ${check.severity || "Unknown"}${check.notes ? ` | ${check.notes}` : ""}`],
            ["Deprecated APIs", row.deprecatedApis, check => `${check.group}/${check.version} ${check.resource}: ${check.severity || "Unknown"} | last observed ${stamp(check.lastUsageObservedAt)} | removed release ${check.removedRelease || "not reported"}`],
        ];
        for (const [title, checks, describe] of sections) {
            card.append(text("h3", title));
            const list = text("ul", "");
            list.append(...checks.map(check => text("li", describe(check))));
            card.append(checks.length ? list : text("p", "No entries reported by this assessment; this alone is not proof of readiness.", "note"));
        }
        return card;
    }));
    if (!assessments.length) $("upgrade-assessments").append(text("p", snapshot.updatedAt ? "No existing upgrade assessments match this view. This is not a passed upgrade check." : "Upgrade assessments have not been loaded. Use Review with Copilot or Refresh data.", "note"));
}

function renderAppDeployments() {
    const snapshot = state.appDeployments;
    const deployments = snapshot.rows.filter(row => row.kind === "deployment");
    const versions = new Map(snapshot.rows.filter(row => row.kind === "version").map(row => [row.id.toLowerCase(), { ...row, available: true }]));
    const applications = new Map(snapshot.rows.filter(row => row.kind === "application").map(row => [row.id.toLowerCase(), row]));
    const servers = new Map();
    for (const deployment of deployments) {
        const key = deployment.resourceId.toLowerCase();
        if (!servers.has(key)) servers.set(key, { id: deployment.resourceId, name: deployment.resourceId.split("/").pop(), deployments: [] });
        servers.get(key).deployments.push(deployment);
        if (!versions.has(deployment.versionId.toLowerCase())) versions.set(deployment.versionId.toLowerCase(), { ...deployment, id: deployment.versionId, available: false });
    }
    if (appSelection && !(appSelection.kind === "server" ? servers : versions).has(appSelection.id)) appSelection = null;
    const active = document.activeElement?.dataset;
    const focused = active?.appVersion ? ["appVersion", active.appVersion] : active?.appServer ? ["appServer", active.appServer] : null;
    const choose = (kind, id) => {
        appSelection = appSelection?.kind === kind && appSelection.id === id ? null : { kind, id };
        renderAppDeployments();
    };
    const selectedServer = appSelection?.kind === "server" ? servers.get(appSelection.id) : null;
    const related = deployment => appSelection?.kind === "version" && deployment.versionId.toLowerCase() === appSelection.id;
    const shownServers = [...servers.values()].filter(server => appSelection?.kind !== "version" || server.deployments.some(related)).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    const catalogVersions = [...versions.values()].filter(row => row.available);
    const catalogApplications = new Set([...applications.keys(), ...catalogVersions.map(row => row.applicationId.toLowerCase())]);
    $("app-source").textContent = `Catalog and Arc server deployments: ${state.scopeLabel} | Independent of overview filters | Snapshot: ${stamp(snapshot.updatedAt)}`;
    $("app-count").textContent = snapshot.updatedAt ? `${catalogApplications.size} catalog applications | ${catalogVersions.length} catalog versions | ${servers.size} servers with deployment records` : "Application catalog and server deployment counts are not loaded.";
    $("app-clear-selection").disabled = !appSelection;
    $("app-selection").textContent = selectedServer ? `Selected server: ${selectedServer.name}. Its matching package versions are highlighted.` :
        appSelection ? `Selected package: ${versions.get(appSelection.id).name} ${versions.get(appSelection.id).version}. Showing ${shownServers.length} matching servers.` :
            "Select a server to highlight its package versions, or select a package version to show matching servers.";
    $("app-versions").replaceChildren(...[...versions.entries()].sort(([, a], [, b]) => a.gallery.localeCompare(b.gallery) || a.name.localeCompare(b.name) || b.version.localeCompare(a.version, undefined, { numeric: true })).map(([key, row]) => {
        const tr = text("tr", "");
        tr.dataset.selected = String(appSelection?.kind === "version" && appSelection.id === key);
        tr.dataset.related = String(Boolean(selectedServer?.deployments.some(deployment => deployment.versionId.toLowerCase() === key)));
        const td = text("td", "");
        const select = text("button", `${row.name} / ${row.version.toLowerCase() === "latest" ? "latest (version unresolved)" : row.version}`, "app-select");
        select.dataset.appVersion = key;
        select.setAttribute("aria-pressed", tr.dataset.selected);
        select.addEventListener("click", () => choose("version", key));
        td.append(select, text("small", row.gallery));
        if (tr.dataset.related === "true") td.append(text("small", "Deployment on selected server", "app-related-label"));
        const count = new Set(deployments.filter(deployment => deployment.versionId.toLowerCase() === key).map(deployment => deployment.resourceId.toLowerCase())).size;
        tr.append(td, text("td", row.available ? `Listed / ${row.provisioningState}` : "Deployment only; not a listed catalog version"), text("td", String(count)));
        return tr;
    }));
    for (const application of applications.values()) {
        if ([...versions.values()].some(row => row.applicationId.toLowerCase() === application.id.toLowerCase())) continue;
        const tr = text("tr", "");
        const td = text("td", application.name); td.append(text("small", application.gallery));
        tr.append(td, text("td", "No versions returned"), text("td", "0"));
        $("app-versions").append(tr);
    }
    $("app-servers").replaceChildren(...shownServers.map(server => {
        const tr = text("tr", "");
        tr.dataset.selected = String(appSelection?.kind === "server" && appSelection.id === server.id.toLowerCase());
        const td = text("td", "");
        const select = text("button", server.name, "app-select");
        select.dataset.appServer = server.id.toLowerCase();
        select.setAttribute("aria-pressed", tr.dataset.selected);
        select.addEventListener("click", () => choose("server", server.id.toLowerCase()));
        const link = text("a", "Azure portal"); link.href = portal(server.id); link.target = "_blank"; link.rel = "noopener noreferrer";
        td.append(select, text("small", server.id.split("/")[4]), link);
        const packages = text("td", "");
        const list = text("ul", "", "app-package-list");
        for (const deployment of [...server.deployments].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version, undefined, { numeric: true }))) {
            const item = text("li", "");
            item.dataset.related = String(related(deployment));
            const installed = deployment.installationResult.toLowerCase() === "succeeded" && Boolean(deployment.reportedVersion);
            const failed = /failed|canceled/i.test(`${deployment.installationResult} ${deployment.provisioningState}`);
            const result = installed ? "Installed (reported)" : deployment.installationResult !== "Unknown" ? `Install result: ${deployment.installationResult}` : "Install unverified";
            item.append(text("strong", `${deployment.name} / ${deployment.version}`),
                text("small", `${deployment.reportedVersion ? `Reported ${deployment.reportedVersion}` : "Installed version unreported"} | Requested ${deployment.requestedVersion} | ${deployment.gallery}`),
                text("span", `${result} | ARM: ${deployment.provisioningState}`, `badge${failed ? " bad" : installed ? " reviewed" : " warning"}`));
            list.append(item);
        }
        packages.append(list); tr.append(td, packages);
        return tr;
    }));
    for (const [id, message, columns] of [
        ["app-versions", snapshot.updatedAt ? "No application versions were returned for this catalog." : "Application catalog has not been loaded. Use Review with Copilot below.", 3],
        ["app-servers", snapshot.updatedAt ? appSelection?.kind === "version" ? "No saved deployments match this package version." : "No matching server deployment records were returned. Missing records are not proof that no packages are installed." : "Server deployments have not been loaded. Azure read access is required.", 2],
    ]) {
        if ($(id).childElementCount) continue;
        const tr = text("tr", ""); const td = text("td", message); td.colSpan = columns; tr.append(td); $(id).append(tr);
    }
    if (focused) [...document.querySelectorAll("[data-app-version],[data-app-server]")].find(button => button.dataset[focused[0]] === focused[1])?.focus({ preventScroll: true });
}

function renderEmm() {
    const snapshot = state.emm;
    const summary = state.emmSummary;
    $("emm-source").textContent = `Scope: ${summary.resourceGroup} | Arc machines only | Independent of overview filters | Retrieved: ${stamp(snapshot.updatedAt)}`;
    $("emm-machine-count").textContent = snapshot.updatedAt ? `${summary.total} machines | ${summary.connected} connected | ${summary.total - summary.connected} disconnected or unknown` : "EMM evidence not loaded. Use Review with Copilot or Refresh data.";
    $("emm-policy-count").textContent = snapshot.updatedAt ? `${summary.issues.find(issue => issue.key === "policy").machines.length} machines not compliant with EMM policy` : "Policy compliance unverified";
    $("emm-services").replaceChildren(...summary.services.map(service => {
        const card = text("article", "", "card emm-service");
        card.append(text("h3", service.label), text("div", "Policy compliance", "label"),
            text("strong", snapshot.updatedAt && service.percent !== null ? `${Number(service.percent.toFixed(1))}%` : "--"));
        if (snapshot.updatedAt && service.percent !== null) {
            const progress = document.createElement("progress");
            progress.max = summary.total; progress.value = service.compliant;
            progress.setAttribute("aria-label", `${service.label}: ${service.compliant} of ${summary.total} machines compliant`);
            card.append(progress);
        }
        card.append(text("p", snapshot.updatedAt ? `${service.compliant} / ${summary.total} compliant | ${service.nonCompliant} non-compliant | ${service.unknown} unverified | ${service.exempt} exempt` : "No policy evaluations loaded", "source"));
        return card;
    }));
    $("emm-evaluated").textContent = snapshot.updatedAt ? `Azure Policy evaluations: ${stamp(summary.evaluatedFrom)} to ${stamp(summary.evaluatedTo)}. These are evaluated snapshots, not live service health or the subscription-wide EMM portal score.` : "";
    $("emm-issues").replaceChildren(...summary.issues.map(issue => {
        const tr = text("tr", "");
        tr.append(text("td", issue.label), text("td", snapshot.updatedAt ? String(issue.machines.length) : "--"));
        const machines = text("td", "");
        issue.machines.forEach((id, index) => {
            if (index) machines.append(document.createTextNode(", "));
            const link = text("a", id.split("/").pop()); link.href = portal(id); link.target = "_blank"; link.rel = "noopener noreferrer";
            machines.append(link);
        });
        tr.append(machines); return tr;
    }));
    $("emm-machines").replaceChildren(...summary.machines.map(machine => {
        const tr = text("tr", "");
        const td = text("td", "");
        const link = text("a", machine.name); link.href = portal(machine.id); link.target = "_blank"; link.rel = "noopener noreferrer";
        td.append(link, text("small", machine.status)); tr.append(td);
        const labels = { compliant: "Compliant", nonCompliant: "Non-compliant", unknown: "Unverified", exempt: "Exempt" };
        for (const service of summary.services) {
            const status = machine.services[service.key];
            tr.append(text("td", labels[status], status === "nonCompliant" ? "bad" : ""));
        }
        tr.append(text("td", machine.extensionFindings.join("; ") || "No failed, missing or pending EMM agent extensions reported"));
        return tr;
    }));
}

function renderMachineSecurity() {
    const snapshot = state.machineSecurity;
    const enabled = snapshot.rows.filter(row => row.identityKeyStore.toLowerCase() === "tpm").sort((a, b) => a.name.localeCompare(b.name));
    const unknown = snapshot.rows.filter(row => !["tpm", "default"].includes(row.identityKeyStore.toLowerCase())).length;
    $("security-source").textContent = `Scope: ${state.scopeLabel} | Arc servers | Independent of overview filters | Retrieved: ${stamp(snapshot.updatedAt)}`;
    $("security-count").textContent = snapshot.updatedAt ? `${enabled.length} / ${snapshot.rows.length} servers report TPM-backed Arc identity enabled | ${unknown} identity key stores unreported or unrecognized` : "Machine security evidence not loaded. Use Review with Copilot or Refresh data.";
    const reported = value => value === true ? "Yes" : value === false ? "No" : "Unknown";
    $("tpm-machines").replaceChildren(...enabled.map(machine => {
        const tr = text("tr", "");
        const td = text("td", "");
        const link = text("a", machine.name); link.href = portal(machine.id); link.target = "_blank"; link.rel = "noopener noreferrer";
        td.append(link, text("small", `${machine.resourceGroup} / ${machine.os || "OS unknown"}`));
        tr.append(td, text("td", machine.status), text("td", reported(machine.tpmPresent)), text("td", reported(machine.tpmReady)),
            text("td", machine.tpmVersion || "Unknown"), text("td", reported(machine.automaticUpgrade)));
        return tr;
    }));
    if (!enabled.length) {
        const tr = text("tr", "");
        const td = text("td", snapshot.updatedAt ? "No servers in this snapshot report identityKeyStore = Tpm. Missing reports are not proof that TPM is disabled." : "TPM-backed machines have not been loaded.");
        td.colSpan = 6; tr.append(td); $("tpm-machines").append(tr);
    }
}

function renderMachineConfiguration() {
    const snapshot = state.machineConfiguration;
    const summary = state.machineConfigurationSummary;
    const expanded = new Set([...$("configuration-machines").querySelectorAll("details[open]")].map(details => details.dataset.machineId));
    const categories = [
        ["compliant", "All reported checks compliant", "var(--cp-success)"],
        ["nonCompliant", "Non-compliant", "var(--cp-danger)"],
        ["unknown", "Unverified evaluations", "var(--cp-warning)"],
        ["exempt", "Exempt", "var(--cp-accent)"],
        ["notApplicable", "Not applicable", "var(--cp-border)"],
        ["unassessed", "No evaluations", "var(--cp-text-muted)"],
    ];
    const labels = Object.fromEntries(categories.map(([key, label]) => [key, label]));
    $("configuration-source").textContent = `Scope: ${summary.resourceGroup} | Arc servers | Machine Configuration policies only | Independent of overview filters | Retrieved: ${stamp(snapshot.updatedAt)}`;
    $("configuration-count").textContent = snapshot.updatedAt ? `${summary.total} servers | ${Object.values(summary.evaluations).reduce((a, b) => a + b, 0)} latest policy evaluations | ${summary.evaluations.compliant} compliant checks / ${summary.evaluations.nonCompliant} non-compliant checks` : "Machine Configuration evidence not loaded. Use Review with Copilot or Refresh data.";
    $("configuration-evaluated").textContent = snapshot.updatedAt ? `Policy evaluation times: ${stamp(summary.evaluatedFrom)} to ${stamp(summary.evaluatedTo)}. Retrieval does not trigger a new evaluation.` : "";
    $("configuration-graphic").hidden = !snapshot.updatedAt || !summary.total;
    const description = categories.map(([key, label]) => `${label}: ${summary.counts[key]} of ${summary.total} servers`).join("; ");
    $("configuration-bar").setAttribute("aria-label", description);
    $("configuration-bar").replaceChildren(...categories.filter(([key]) => summary.counts[key]).map(([key, label, color]) => {
        const segment = text("span", "");
        segment.style.width = `${100 * summary.counts[key] / summary.total}%`;
        segment.style.backgroundColor = color;
        segment.title = `${label}: ${summary.counts[key]} / ${summary.total} servers`;
        return segment;
    }));
    $("configuration-legend").replaceChildren(...categories.map(([key, label, color]) => {
        const item = text("span", "");
        const dot = text("i", "", "dot"); dot.style.backgroundColor = color;
        item.append(dot, document.createTextNode(`${label}: ${summary.counts[key]}`));
        return item;
    }));
    $("configuration-machines").replaceChildren(...[...summary.machines].sort((a, b) => a.name.localeCompare(b.name)).map(machine => {
        const tr = text("tr", "");
        const name = text("td", "");
        const link = text("a", machine.name); link.href = portal(machine.id); link.target = "_blank"; link.rel = "noopener noreferrer";
        name.append(link, text("small", `${machine.os || "OS unknown"} / ${machine.status}`));
        const evidence = text("td", "");
        const details = text("details", "", "policy-checks");
        details.dataset.machineId = machine.id;
        details.open = expanded.has(machine.id);
        details.append(text("summary", `${machine.policies.length} reported policy checks`));
        const list = text("ul", "");
        for (const policy of machine.policies) {
            const item = text("li", "");
            const definition = text("a", policy.displayName); definition.href = portal(policy.definitionId); definition.target = "_blank"; definition.rel = "noopener noreferrer";
            item.append(definition, document.createTextNode(`: ${policy.state} | ${stamp(policy.timestamp)}`));
            const assignment = text("a", "Assignment"); assignment.href = portal(policy.assignmentId); assignment.target = "_blank"; assignment.rel = "noopener noreferrer";
            item.append(text("small", policy.referenceId || "Standalone policy"), assignment);
            list.append(item);
        }
        details.append(list);
        evidence.append(machine.policies.length ? details : text("span", "No evaluations; compliance is not established."));
        tr.append(name, text("td", labels[machine.compliance], machine.compliance === "nonCompliant" ? "bad" : ""), evidence);
        return tr;
    }));
    if (!summary.machines.length) {
        const tr = text("tr", "");
        const td = text("td", snapshot.updatedAt ? "No Arc servers returned in the scoped snapshot. This is not a compliance pass." : "Machine Configuration evidence has not been loaded.");
        td.colSpan = 3; tr.append(td); $("configuration-machines").append(tr);
    }
}

function render() {
    renderSettings();
    $("refresh-interval").value = String(state.settings.refreshMinutes);
    const minutes = state.settings.refreshMinutes;
    $("refresh-schedule-status").textContent = minutes ? `${state.autoRefresh.error ? `${state.autoRefresh.error} ` : ""}Every ${minutes} min | Next check: ${stamp(state.autoRefresh.nextRefreshAt)} | ${state.job?.status === "pending" ? "A request is active; overlapping refreshes are skipped. " : ""}Runs while the canvas is open, even in the background. Uses Copilot; permissions may be needed.` : "Manual refresh (default). Automatic refreshes use Copilot and may consume model usage.";
    $("refresh-schedule-status").className = state.autoRefresh.error ? "source bad" : "source";
    $("theme").value = themeOverride ?? state.appearance;
    document.dispatchEvent(new CustomEvent("arc-theme-change", { detail: $("theme").value }));
    buildTaskPanels();
    const rows = resources();
    const ids = new Set(rows.map(row => row.id.toLowerCase()));
    const hasFilters = Object.values(state.filters).some(Boolean);
    const recommendations = state.advisor.rows.filter(row => !hasFilters || ids.has(row.resourceId.toLowerCase())).sort((a, b) => ({ High: 0, Medium: 1, Low: 2 }[a.impact] ?? 3) - ({ High: 0, Medium: 1, Low: 2 }[b.impact] ?? 3));
    const samples = state.metrics.rows.filter(row => ids.has(row.resourceId.toLowerCase()));
    buildSummary(rows, recommendations);
    $("updated").textContent = `Inventory ${stamp(state.inventory.updatedAt)} | Advisor ${stamp(state.advisor.updatedAt)}`;
    for (const [key, label] of Object.entries({ type: "All resource types", status: "All statuses", resourceGroup: "All resource groups", location: "All regions" })) options($(key), state.inventory.rows.filter(row => names[row.type]).map(row => row[key]), state.filters[key], label, key === "type" ? names : {});
    if (document.activeElement !== $("search")) $("search").value = state.filters.search;
    const workspaces = state.inventory.rows.filter(row => ["microsoft.operationalinsights/workspaces", "microsoft.monitor/accounts"].includes(row.type));
    $("workspace-options").replaceChildren(...workspaces.map(row => new Option(`${row.name} / ${row.resourceGroup} / ${row.id.split("/")[2]}`, row.id)));
    if (document.activeElement !== $("workspace")) $("workspace").value = state.settings.workspaceId;
    $("hours").value = state.settings.hours;
    $("resource-filter").hidden = !state.filters.resourceId;
    $("resource-filter").textContent = `Selected resource: ${state.filters.resourceId}. Use Clear filters to return to the estate.`;
    for (const section of ["inventory", "advisor", "metrics", "upgradeAssessments", "appDeployments", "emm", "machineSecurity", "machineConfiguration"]) {
        $(`${section}-error`).hidden = !state[section].error;
        $(`${section}-error`).textContent = state[section].error ? `${state[section].error}\nPrevious snapshot retained: ${stamp(state[section].updatedAt)}` : "";
    }
    const compatible = state.metrics.workspaceId.toLowerCase() === state.settings.workspaceId.toLowerCase() && state.metrics.hours === state.settings.hours;
    $("coverage").textContent = compatible ? `${new Set(samples.map(row => row.resourceId.toLowerCase())).size} / ${rows.filter(row => row.type === "microsoft.hybridcompute/machines").length} servers with samples` : "Refresh required";
    const prometheus = /\/providers\/microsoft\.monitor\/accounts\//i.test(state.metrics.workspaceId);
    $("metrics-info").textContent = `Loaded: ${prometheus ? "Azure Monitor / PromQL" : "Log Analytics / KQL"} | ${state.metrics.workspaceId.split("/").pop()} | ${state.metrics.hours}h | ${stamp(state.metrics.updatedAt)}${prometheus ? " | CPU and I/O: rolling 5-minute rates; memory: physical non-free" : ""}`;
    $("charts").replaceChildren(...[["cpu", "CPU utilization"], ["memory", "Memory utilization"], ["network", "Network receive / send"], ["disk", "Disk read / write"]].map(([key, title]) => drawChart(key, title, samples.filter(row => row.metric === key))));
    $("resource-count").textContent = `${rows.length} resources`;
    $("resources").replaceChildren(...rows.sort((a, b) => a.name.localeCompare(b.name)).map(row => {
        const tr = text("tr", "");
        const td = text("td", "");
        const link = text("a", row.name); link.href = portal(row.id); link.target = "_blank"; link.rel = "noopener noreferrer";
        const focus = text("button", "Focus", "mini");
        focus.addEventListener("click", () => act("/filters", { resourceId: row.id }));
        td.append(link, text("small", `${names[row.type]} / ${row.resourceGroup}`), focus);
        const status = text("td", ""); status.append(text("span", row.status, `badge${row.status.toLowerCase() === "connected" ? "" : " bad"}`));
        tr.append(td, status, text("td", row.location), text("td", row.kubernetesVersion || row.agentVersion || "--")); return tr;
    }));
    if (!rows.length) { const tr = text("tr", ""); const td = text("td", state.inventory.updatedAt ? "No resources match these filters." : "Inventory has not been loaded. Use Refresh data."); td.colSpan = 4; tr.append(td); $("resources").append(tr); }
    $("advisor-count").textContent = `${recommendations.length} recommendations`;
    $("advisor-source").textContent = `Arc resources only | ${stamp(state.advisor.updatedAt)}`;
    $("recommendations").replaceChildren(...recommendations.map(row => {
        const item = text("article", "", "recommendation");
        const link = text("a", row.resourceId.split("/").pop()); link.href = portal(row.resourceId); link.target = "_blank"; link.rel = "noopener noreferrer";
        item.append(text("span", `${row.impact} / ${row.category}`, `badge${row.impact === "High" ? " bad" : ""}`), text("h3", row.problem), text("p", row.solution), link);
        if (!ids.has(row.resourceId.toLowerCase())) item.append(text("p", "Resource is absent from the current inventory snapshot; the Advisor record may be stale.", "note"));
        return item;
    }));
    if (!recommendations.length) $("recommendations").append(text("p", state.advisor.updatedAt ? "No Advisor recommendations for the matching resources. This is not a compliance assessment." : "Advisor has not been loaded.", "note"));
    renderUpgradeAssessments(rows, ids, hasFilters);
    renderAppDeployments();
    renderEmm();
    renderMachineSecurity();
    renderMachineConfiguration();
    $("todo-count").textContent = `${state.checklist.filter(item => item.completedAt).length} / ${state.checklist.length} reviewed`;
    for (const item of state.checklist) {
        const review = state.reviews[String(item.id)];
        const ownJob = state.job?.taskId === item.id ? state.job : null;
        $(`task-check-${item.id}`).checked = Boolean(item.completedAt);
        $(`task-status-${item.id}`).textContent = item.completedAt ? "Reviewed" : "To review";
        $(`task-status-${item.id}`).className = `badge${item.completedAt ? " reviewed" : ""}`;
        $(`task-reviewed-${item.id}`).textContent = item.completedAt ? stamp(item.completedAt) : "";
        $(`review-status-${item.id}`).textContent = ownJob?.status === "pending" ? "Copilot review queued / running. Previous response retained until completion." :
            ownJob?.status === "error" || ownJob?.status === "canceled" ? ownJob.error :
                review ? `Response ${stamp(review.updatedAt)}` : "No Copilot review yet.";
        $(`answer-${item.id}`).textContent = review?.answer ?? "";
    }
    const pending = state.job?.status === "pending";
    for (const id of ["refresh", "ask", "filter-ai", "workspace", "hours"]) $(id).disabled = pending;
    document.querySelectorAll("[data-prompt]").forEach(button => { button.disabled = pending; });
    document.querySelectorAll("[data-review-button]").forEach(button => { button.disabled = pending; });
    document.querySelectorAll("[data-review-cancel]").forEach(button => { button.hidden = !pending || Number(button.dataset.reviewCancel) !== state.job.taskId; });
    document.querySelectorAll("[data-review-clear]").forEach(button => {
        const taskId = button.dataset.reviewClear === "overview" ? null : Number(button.dataset.reviewClear);
        const ownJob = state.job && (state.job.taskId ?? null) === taskId;
        button.disabled = Boolean(ownJob && pending) || !(state.reviews[button.dataset.reviewClear] || (taskId === null && state.answer) || ownJob);
    });
    $("cancel").hidden = !pending || state.job.taskId != null;
    $("job-badge").textContent = pending ? "Copilot request queued / running" : state.job?.status === "error" ? "Action needs attention" : "ARM MCP";
    $("job-notice").hidden = !state.job || state.job.status === "done";
    $("job-notice").className = `notice${state.job?.status === "error" ? " error" : ""}`;
    $("job-notice").textContent = pending ? `${state.job.taskId ? `Task ${state.job.taskId} review` : state.job.kind} requested ${stamp(state.job.startedAt)}. Copilot runs this through the current conversation; tool/permission approval may be needed. Results appear in the requesting panel. Previous data remains visible until new results arrive.` : state.job?.error ?? "";
    $("answer").textContent = state.reviews.overview?.answer ?? state.answer;
}
async function update(force = false) {
    if (loading) return;
    loading = true;
    try {
        const next = await api("/state");
        const signature = JSON.stringify(next);
        state = next;
        if (force || signature !== rendered) {
            render(); rendered = signature;
        }
    } catch (e) { error(`Dashboard connection: ${e.message}`); } finally { loading = false; }
}
async function ask(kind, prompt, taskId = null) { await act("/request", { kind, prompt, taskId }); }
$("refresh").addEventListener("click", () => ask("refresh"));
$("refresh-interval").addEventListener("change", () => act("/refresh-schedule", { minutes: Number($("refresh-interval").value) }));
$("theme").addEventListener("change", () => {
    themeOverride = null;
    act("/appearance", { theme: $("theme").value });
});
$("cancel").addEventListener("click", () => act("/cancel", {}));
$("clear-review-overview").addEventListener("click", () => act("/clear-review", { taskId: null }));
$("clear").addEventListener("click", () => act("/filters", Object.fromEntries(["search", "type", "status", "resourceGroup", "location", "resourceId"].map(key => [key, ""]))));
for (const key of ["type", "status", "resourceGroup", "location"]) $(key).addEventListener("change", () => act("/filters", { [key]: $(key).value }));
$("search").addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => act("/filters", { search: $("search").value }), 300); });
$("ask-form").addEventListener("submit", event => { event.preventDefault(); ask("question", $("question").value); });
$("filter-ai").addEventListener("click", () => ask("filter", $("question").value));
$("settings-form").addEventListener("input", () => { settingsDirty = true; });
for (const id of ["all-subscriptions", "subscriptions", "all-resource-groups"]) $(id).addEventListener("change", () => {
    settingsDirty = true;
    const draft = scopeDraft();
    if (draft.resourceGroupIds && id !== "all-resource-groups") {
        draft.resourceGroupIds = draft.resourceGroupIds.filter(group => draft.subscriptionIds === null || draft.subscriptionIds.some(sub => group.toLowerCase().startsWith(`/subscriptions/${sub.toLowerCase()}/`)));
    }
    scopeOptions(state.scopeOptions, draft);
    $("scope-options-status").textContent = "Selection not saved. Load resource groups if you want specific groups in the selected subscriptions, then save.";
});
async function loadScopeOptions(includeGroups) {
    const draft = scopeDraft();
    scopeLoading = true;
    settingsDirty = true;
    renderSettings();
    $("scope-options-status").textContent = includeGroups ? "Loading resource groups for the selected subscriptions from Azure CLI..." : "Loading subscriptions from the Azure CLI signed-in catalog...";
    try {
        error("");
        const subscriptions = await api("/scope-options", { subscriptionsOnly: true });
        state.scopeOptions = subscriptions;
        scopeOptions(subscriptions, draft);
        const catalog = includeGroups ? await api("/scope-options", { subscriptionIds: draft.subscriptionIds }) : subscriptions;
        state.scopeOptions = catalog;
        scopeLoading = false;
        scopeOptions(catalog, draft);
        $("scope-options-status").textContent = includeGroups ? `Loaded ${catalog.resourceGroups.length} resource groups for the selected subscriptions. Save settings to apply your selection.` : `Loaded ${catalog.subscriptions.length} subscriptions. Choose specific subscriptions or all; load resource groups only if needed, then save settings.`;
        await update(true);
    } catch (e) {
        error(e.message);
        scopeOptions(state.scopeOptions, draft);
        $("scope-options-status").textContent = "Scope discovery failed. Any refreshed subscription choices remain available; choose an accessible selection and retry. Existing scope settings were not replaced.";
    } finally {
        scopeLoading = false;
        renderSettings();
    }
}
$("load-scopes").addEventListener("click", () => loadScopeOptions(false));
$("load-resource-groups").addEventListener("click", () => loadScopeOptions(true));
$("settings-form").addEventListener("submit", async event => {
    event.preventDefault();
    try {
        error("");
        await api("/settings", scopeDraft());
        settingsDirty = false;
        appSelection = null;
        await update(true);
        $("scope-options-status").textContent = "Settings saved. Refresh data if the scope changed.";
    } catch (e) { error(e.message); }
});
document.querySelectorAll("[data-prompt]").forEach(button => button.addEventListener("click", () => ask(button.dataset.kind, button.dataset.prompt)));
await update();
setInterval(() => { if (!document.hidden) update(); }, 2000);
