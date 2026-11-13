# LAB724: Govern your estate with Azure Arc and Azure Resource Manager MCP

Welcome to LAB724: Hands-On: Govern your estate with AI and Azure Resource Manager MCP. 

To begin, log in to the virtual machine using the following credentials: {{LAB_VM_PASSWORD}}

# Initial Setup
We are going to be using both the Azure Portal and Visual Studio Code to interact with Azure resources!

## Sign In to Azure

Open up Microsoft Edge, it should default to [https://portal.azure.com/#home](https://portal.azure.com/#home). Sign in with your Microsoft Entra ID account: {{AZURE_USERNAME}}. When prompted, use the temporary access password provided for this account: {{AZURE_TEMPORARY_ACCESS_PASS}}.

## Setting up the Azure Resource Manager MCP server

The Azure Resource Manager (ARM) MCP Server enables AI agents to interact with and manage Azure resources. In this lab, we'll use it with GitHub Copilot in VS Code as the agent harness, but outside the lab, it can be connected to any MCP-compatible agent client, such as Claude or Codex.

1. Sign in to GitHub
In Microsoft Edge, navigate to {{GITHUB_ENTERPRISE_SSO_URL}} and use the already authenticated account or sign in with your Microsoft Entra ID account: {{AZURE_USERNAME}} and temporary access password: {{AZURE_TEMPORARY_ACCESS_PASS}}.

2. Open Visual Studio Code and sign in to GitHub Copilot
Open Visual Studio Code on the lab machine and sign in to GitHub Copilot by clicking the `Sign in` button in the top-right corner of the window.

![g1cw7ea0.png](https://labondemand.blob.core.windows.net/content/lab224874/instructions359508/g1cw7ea0.png)

Then choose "Continue with GitHub".

![vcwdxhcr.png](https://labondemand.blob.core.windows.net/content/lab224874/instructions359508/vcwdxhcr.png)

Authorize VS Code as prompted. Once authorization is complete, VS Code will reopen, and you will be signed in to GitHub Copilot.

3. Install the Azure Management MCP Server
In the browser, go to:

**https://aka.ms/JoinARMMCP**

Follow the prompts to install the Azure Management MCP Server in Visual Studio Code.

![inpws55g.png](https://labondemand.blob.core.windows.net/content/lab224874/instructions359508/inpws55g.png)

4. Sign in to Azure
During setup, you will be prompted to sign in to Azure.

![j2mbdcdl.png](https://labondemand.blob.core.windows.net/content/lab224874/instructions359508/j2mbdcdl.png)

Use your Microsoft Entra ID account: {{AZURE_USERNAME}} and temporary access password: {{AZURE_TEMPORARY_ACCESS_PASS}}.

Once authentication is complete, the Azure Management MCP Server will be available in Visual Studio Code.

5. Validate your demo environment is ready.
Open the chat window in VS Code and run the `/validate-azure-env` skill.

This skill will direct GitHub Copilot to use the ARM MCP server to get the details of your lab environment and ensure that all the resources are ready for your lab.

![Screenshot](https://labondemand.blob.core.windows.net/content/lab224874/screens/0r1cijdp.png)

Now let's continue to the next step of the lab! Click the **Next** button to continue.

===
# Discover & Understand your Distributed Estate with AI

In this section, we will use natural language and the ARM MCP server to investigate our estate and understand our resource infrastructure.

By only using the Copilot chat, try to answer the following questions about your estate: 

* List all servers across Azure and Arc. Group by subscription, OS, and hosting type.
* List Arc-connected Kubernetes clusters.
* List machines running Windows Server 2016.
* Show a breakdown of policies applied to these machines and their status.

Ask more questions of your choice to get a sense of your Azure environment!

## Discover Machine Inventory Across Azure and Azure Arc Machines
With the new solution from Azure, **Machine Inventory**, you can view key machine-level resources across both Azure VMs and Azure Arc-enabled servers, including:
* users
* groups
* applications
* services
* certificates

Start in the Azure portal to get a centralized inventory overview across your selected scope. This helps you quickly identify patterns, inconsistencies, and machines that need deeper review.

![fkt8ib3h.png](https://labondemand.blob.core.windows.net/content/lab224874/instructions359508/fkt8ib3h.png)

You will land on this overview page:

![4eo4tr0w.png](https://labondemand.blob.core.windows.net/content/lab224874/instructions359508/4eo4tr0w.png)

Using the portal, explore the experience to find the following:
- Find at least 3 services that are currently in a Running state.
- Find at least 5 installed applications on a selected machine.
- Identify the top 3 groups with the highest membership count.

After that, move to VS Code with GitHub Copilot + ARM MCP server to ask natural language questions against what you found in the inventory.

Example prompts:
* "From my machine inventory, show me a breakdown of users, the groups they belong to, and the machines they are on."
* "Which Arc-enabled machines have the highest number of installed applications, and what are the top differences vs Azure VMs?"
* "Find machines where critical services are stopped but should be running."
* "Help me see when the certificates expire and which machines they are on."

Ask any additional natural-language questions against Machine Inventory to surface insights that can directly support your day-to-day operations, troubleshooting, and security hygiene!

===
# Standardize Machine Management with the Essentials Machine Management Bundle
Discovery revealed some inconsistencies. Let's now standardize management across the estate so every machine is onboarded into the same core services and governance baseline.

Essential Machine Management (EMM) is a unified onboarding and standardization layer for both Azure virtual machines and Arc-connected machines. It enrolls servers into core services including Azure Update Manager, Change Tracking and Inventory, Machine Configuration, Defender for Cloud, and Azure Monitor, and it applies the Azure security baseline policy so you get an immediate baseline view of security posture. Instead of enabling each service separately, EMM provides a faster, more consistent, and typically lower-cost path to hybrid machine management at scale.

Now you have two options to carry out this standardization. 

Option 1: Use the ARM MCP server in VS Code.

Option 2: Use the Azure portal to enroll your subscription.

## Option 1

Open GitHub Copilot in VS Code and ask the ARM MCP server to help you enroll in Essentials machine management. This will use a SKILL.md file to help walk you through the experience.

Start by asking, "What Azure Management features does EMM enroll me in and which are optional?"

After that, you can simply ask, "Find my Azure subscriptions and help me enroll them in EMM." Follow Copilot's prompts and answer its questions.

> [!note] Enrolling in EMM may take some time to complete.


## Option 2

In the Azure portal, navigate to the Compute Infrastructure blade. Then, under the "Monitoring+Operation" dropdown, find the "Essentials Machine Management (Preview)" page.

Here is a direct link to copy and paste if you have difficulty finding it: `https://portal.azure.com/#view/Microsoft_Azure_ComputeHub/ComputeHubMenuBlade/~/machineenrollment`

1. Choose the subscription to enable by clicking **Enable**.

![zwjmqd63.png](https://labondemand.blob.core.windows.net/content/lab224874/instructions359508/zwjmqd63.png)

2. Create a new user-managed identity.

![acm4e1tq.png](https://labondemand.blob.core.windows.net/content/lab224874/instructions359508/acm4e1tq.png)

3. Select an existing Log Analytics workspace and an Azure monitoring workspace.

4. Continue to enrollment and enable the experience.

You should now see your subscription enrolled on the main Essentials machine management page.
===
# Security Baseline Remediation with Machine Configuration
In this act, you'll use the revamped **Machine Configuration** experience to remediate Azure and Azure Arc machines against security baseline rules, with emphasis on industry baselines such as **CIS** and **STIG**.

Azure Machine Configuration is a service for auditing and configuring OS settings as code across Azure and Arc-enabled machines, with enforcement modes including Audit, Apply and Monitor, and Apply and Autocorrect. You can learn more at [What is Azure Machine Configuration?](https://learn.microsoft.com/en-us/azure/governance/machine-configuration/overview/01-overview-concepts)

1. In the Azure portal's search bar, search for "Machine Configuration".

![32tttf9c.png](https://labondemand.blob.core.windows.net/content/lab224874/instructions359508/32tttf9c.png)

2. Explore the newly created "Machine Configuration" hub, which was built to help you navigate configurations on your Azure and Arc machines.
3. Under the "Solutions" dropdown, select "Security Baselines". This is where you can create policies that audit and remediate known standard baselines like CIS, STIG, and Azure Security Baseline.
- The **Definitions** tab is where you can create a new baseline assignment.
- The **Assignments** tab is where you can see the Azure Policy assignments created with these baselines.
- The **Reports** tab is where you can view individual reports on each machine's compliance status with the baselines' rules.
4. Navigate to **Reports** and select a CISLinuxSecurityBaseline report to see the compliance status for each rule on a machine. Find a machine with Ubuntu2204 mentioned in the name, for example, *ignite-dev-azure-ubuntu2404-mix*. Review the non-compliant and compliant rules. One rule you may see marked as non-compliant is "1.1.1.8 Ensure udf kernel module is not available". We are going to remediate these machines so that this rule is compliant across all our machines.
5. Back in the **Assignments** tab, select the checkbox for the CIS for Linux assignment and select "Edit Settings".

![AssignmentsTab.png](https://labondemand.blob.core.windows.net/content/lab224874/instructions359508/AssignmentsTab.png)

6. Select "Next" to modify the settings, and use the dropdown to select the "CIS Ubuntu Linux 24.04 LTS benchmark".

![edit.png](https://labondemand.blob.core.windows.net/content/lab224874/instructions359508/edit.png)


7. Let's set the first 9 rules, including the "**1.1.1.8 Ensure udf kernel module is not available**" rule, to "**Remediate**" so that these settings remain configured and compliant.

![wokxjwuo.png](https://labondemand.blob.core.windows.net/content/lab224874/instructions359508/wokxjwuo.png)

6. Select **Next** and scroll down to find the "**Edit policy assignment**" button. Click that button.
7. On the Assign Policy page, select **Next** to go to the "**Parameters**" tab. To modify these settings on the machine, make sure the "**Effect**" is "**DeployIfNotExists**".

![param.png](https://labondemand.blob.core.windows.net/content/lab224874/instructions359508/param.png)

![dine.png](https://labondemand.blob.core.windows.net/content/lab224874/instructions359508/dine.png)

8. Select all **Remediation locations** to ensure every region is included in remediation.

![remediationlocations.png](https://labondemand.blob.core.windows.net/content/lab224874/instructions359508/remediationlocations.png)

9. Continue through the remaining settings and select "**Review + Save**".

You can now remediate CIS for Linux rules across ALL the machines within the assignment's scope, in this case, across the subscription. After about 5-15 minutes, remediation will take place across all your machines. If you navigate back to the same "**Report**", you should see that the rules you selected are now compliant.

> [!note] Optional next step: Create a baseline from scratch.

As an optional step, you can create a brand-new baseline assignment.
1. Navigate to the Definitions tab, select "**[Preview] Official Security Technical Implementation Guide (STIG) for Linux Workloads by DISA**", and click "**modify settings**".
2. Select the Ubuntu 24.04 distribution, choose the settings you would like to remediate, and continue with the assignment. NOTE: Settings that do not support remediation will be grayed out.
3. To ensure machines are modified, you will have to:
    1. Check that the "**Effect**" parameter is set to "**DeployIfNotExists**".
    2. Select all **Remediation Locations**.
    3. Check the create remediation task tab to ensure all existing machines will be remediated.
4. Create the policy assignment. In about 5-15 minutes, the reports will be generated, and you can see how machines have been remediated according to your settings.

Expected outcomes:
* Learn how to navigate the new Machine Configuration experience and view assignments and reports.
* Learn how to modify baseline assignments and remediate specific rules.
* Learn how to create a new baseline remediation assignment.

===
Governance is now in place. Let's keep the environment connected, current, and ready for ongoing operations with help from AI.

In this final act, you will identify machines that need attention, enable Hotpatch and automatic Azure Connected Machine agent upgrades, prepare Windows Server 2016 machines for Extended Security Updates (ESUs), prioritize Azure Advisor recommendations, and Identify Upgrade Challenges in Your Kubernetes Environment.

**Estimated time:** 10 minutes. Start the configuration changes, then continue with the remaining tasks while Azure processes them.

## 1. Find Machines That Need Attention

Return to GitHub Copilot Chat in VS Code, using Agent mode with the ARM MCP server available. Start with a read-only assessment:

> [!hint] **Ask Copilot:**
Using the ARM MCP server, help me assess my Azure Arc estate. First confirm the lab subscription {{AZURE_SUBSCRIPTION_ID}} and resource group {{AZURE_RESOURCE_GROUP}} in {{AZURE_REGION}} with me. Within that scope, list Arc-enabled servers, their OS versions, and any reported health or connectivity issues. Also show the Connected Machine agent version, automatic agent upgrade setting, and Hotpatch and ESU status where available. Identify Windows Server 2016 machines that are not yet enrolled in ESUs, and flag any missing prerequisites or information you cannot verify. Mark unavailable information as unknown, not healthy or enabled. Do not make changes.

Review the results and identify:
* A Windows Server 2025 machine that is not yet enabled for Hotpatch.
* Arc-enabled servers without automatic agent upgrades enabled.
* Windows Server 2016 machines to assess for ESU enrollment.

**Checkpoint:** You have a scoped list of machines and the issues or missing capabilities to investigate. If the expected machines are missing, confirm your scope with the proctor.

## 2. Enable Hotpatch

Hotpatch reduces restarts for supported Windows security updates. To enable Hotpatch, use **Azure Arc Run Command** to enable Virtualization-based Security (VBS) on the target server.

1. From step 1 above we should have identified two Windows Server 2025 machines that do not have Hotpatch enabled.

2. Hotpatch requires a supported Windows Server 2025 edition and VBS running, including compatible physical or virtual hardware. Enabled VBS and restart the machines.  

> [!hint] **Ask Copilot:** Use **Azure Arc Run Command** to enable virtualization-based security (VBS) on the Azure Arc-enabled Windows Server 2025 machines by running the following PowerShell commands in order. The second command restarts each machine to apply the change. 
**New-ItemProperty -Path 'HKLM:\System\CurrentControlSet\Control\DeviceGuard' -Name 'EnableVirtualizationBasedSecurity' -PropertyType 'Dword' -Value 1 -Force** and **Restart-Computer**

   The restart temporarily interrupts workloads and the Arc connection. Allow the server to boot and confirm that it reports **Connected** again.

3. Use your agent to enable Hotpatch for the eligible Windows Server 2025 Arc-enabled machine. Review and approve the proposed changes before the agent applies them.

4. Alternatively, once VBS is enabled, you can enable Hotpatch via the Azure portal: open **Azure Arc > Machines**, select the eligible Windows Server 2025 server, then select **Hotpatch** and follow the enablement prompts.

![oren3i91.png](https://labondemand.blob.core.windows.net/content/lab224874/instructions359508/oren3i91.png)

5. Ask Copilot to read back the Hotpatch setting for the approved target. Hotpatch enablement can take about 10 minutes; continue with the next task while it processes.

> [!note] Azure Arc Run Command executes scripts remotely on the Arc-enabled server. If Copilot cannot submit a Run Command, review the reported error and use the [Azure PowerShell or Azure CLI instructions](https://learn.microsoft.com/en-us/azure/azure-arc/servers/run-command) with your proctor. Do not run the VBS or restart commands locally on your lab workstation.

**Checkpoint:** VBS is running and Hotpatch is enabled or its enablement is still in progress. Hotpatch does not eliminate all restarts; baseline updates can still require one. See [Hotpatch prerequisites and enablement](https://learn.microsoft.com/en-us/windows-server/get-started/enable-hotpatch-azure-arc-enabled-servers).

## 3. Enable Automatic Agent Upgrades

Automatic agent upgrades keep the **Azure Connected Machine agent** current; they do not enable OS patching or update other extensions.

> [!hint] **Ask Copilot:** Identify Arc-enabled servers in my assigned lab that do not have automatic Connected Machine agent upgrades enabled, including Windows and Linux machines. Check their connection status, agent versions, and upgrade prerequisites. Show the proposed changes and exact target resource IDs, flag any unmet prerequisites or blocked operations.

1. Review the targets and prerequisites. Automatic agent upgrades require agent version **1.67 or later**, plus the Windows or Linux prerequisites described in the [automatic agent upgrade guidance](https://learn.microsoft.com/en-us/azure/azure-arc/servers/automatic-agent-upgrade).
2. Ask Copilot to enable Automatic Agent upgrades for the all Azure Arc connected machines. 
3. Alternateively, use the Azure portal to enable auto upgrade. Open the Arc-enabled server's **Properties**. Under **Agent status**, select **Agent auto upgrade**, then enable automatic upgrades for the Arc connected machine agent.

![3ob5stca.png](https://labondemand.blob.core.windows.net/content/lab224874/instructions359508/3ob5stca.png)

4. Ask Copilot to read back the automatic agent upgrade setting for each approved target.

**Checkpoint:** Eligible Arc servers show automatic agent upgrades enabled. An enabled upgrade setting does not mean the agent version changes immediately.

## 4. Prepare Windows Server 2016 for Extended Security Updates

Windows Server 2016 reaches end of support on **January 12, 2027**. In this lab, you are preparing ESU enrollment ahead of that date, not installing post-end-of-support updates.

Complete this exercise entirely in the **Azure portal**, from identifying eligible machines to creating the license and verifying enrollment.

1. Open **Azure Arc > Machines** and filter to your assigned lab subscription and resource group: {{AZURE_RESOURCE_GROUP}}. Identify the Windows Server 2016 machines, then review each machine's OS details, connection status, and Connected Machine agent version in its **Overview** and **Properties**. Windows Server 2016 ESU enrollment requires Connected Machine agent version **1.62 or later**, connectivity to Azure Arc, and appropriate licensing coverage. Resolve any prerequisite blockers with your proctor before continuing.
2. Go to **Azure Arc > Licenses > ESU - Windows Server 2016** in the navigation. On **Eligible resources** tab, review the machines' ESU status and note the Windows Server 2016 machines that are not already enabled.
3. On the **Licenses** tab, select **Create**.

![xuv1pswp.png](https://labondemand.blob.core.windows.net/content/lab224874/instructions359508/xuv1pswp.png)

4. Enter the license details:
   * **Resource group:** Select your assigned lab resource group: {{AZURE_RESOURCE_GROUP}}
   * **License name:** Enter a unique name, such as `esu-ws2016-lab`.
   * **Activation status:** Select the option to activate the license so it can provide ESU coverage.
   * **Region:** Select the region specified for your lab: {{AZURE_REGION}}
   * **SKU:** Select the Windows Server 2016 Standard or Datacenter license specified by the lab's licensing guidance. Confirm the choice with your proctor if it is not provided.
   * **Number of cores:** Enter **24**.
5. Select **Review + create**, review the settings and complete the licensing attestation by checking the box. Select **Create**, then wait for the license resource to deploy.
6. Return to **Azure Arc > Licenses > ESU - Windows Server 2016** and select the **Eligible resources** tab. Locate the Windows Server 2016 Arc-enabled servers identified in the portal. Select the lab machines that are not already enabled, then select **Enable ESUs**.
7. In the **Enable ESUs** dialog, select **Physical cores** or **Virtual cores** based on your license SKU, choose the license you just created, and select **Enable**.
8. Refresh **Eligible resources** and confirm that each selected machine shows an **ESU status** of **Enabled**. If enrollment fails or remains pending, inspect the reported status or error and ask your proctor for help rather than creating another license.
9. Return to **Licenses**, open your license, and review its activation status, core count, and linked resources. Confirm that the intended lab machines are associated with this license.



**Checkpoint:** You used the Azure portal to identify enrollment candidates, create and assign the ESU license, and verify that the intended Windows Server 2016 Arc-enabled servers show ESU enrollment as **Enabled**. Enrollment does not install updates; update delivery remains a separate operation. See [Windows Server 2016 ESU requirements](https://learn.microsoft.com/en-us/azure/azure-arc/servers/prepare-extended-security-updates) and [ESU enrollment steps](https://learn.microsoft.com/en-us/azure/azure-arc/servers/deliver-extended-security-updates).

## 5. Prioritize Azure Advisor Recommendations

Azure Advisor provides reliability recommendations for Azure Arc-enabled servers that remain disconnected or have expired credentials. The currently documented recommendations are:

| Recommendation | Severity | When it appears | Recommended action |
| --- | --- | --- | --- |
| Restore connectivity for 30+ day disconnected Arc-enabled server | Medium | The server has been disconnected for 30 through 44 days. | Check agent services and network connectivity, restore the connection, and verify that the server reports **Connected**. |
| Reconnect Arc-enabled server before the managed identity certificate expires | High | The server has been disconnected for at least 45 days, but its managed identity certificate is still valid. | Restore connectivity promptly so the agent can renew its credential before it expires. |
| Re-onboard expired Arc-enabled server | High | The server reports **Expired**, or its managed identity certificate has expired. | Re-onboard the server using onboarding credentials if it should remain managed by Arc. If it is retired, remove the stale resource instead. |

Prioritize the high-severity recommendations to restore management access or prevent credential expiration.

> [!note] This is a reference-only section. The lab does not simulate the extended disconnection periods or expired credentials needed to demonstrate these recommendations, so no live Advisor validation is required.

For detailed remediation steps, see [Resolve Azure Advisor recommendations for Azure Arc-enabled servers](https://learn.microsoft.com/en-us/azure/azure-arc/servers/resolve-azure-advisor-recommendations).

## 6. Identify Upgrade Challenges in Your Kubernetes Environment

Kubernetes releases come frequently, and keeping clusters up to date is important for security and for unlocking new features. Upgrading a Kubernetes version can be complex, with lots of potential for problems. Upgrade Insights allows you to review your Arc-connected Kubernetes clusters and the configurations and features in use to surface potential areas of concern.

From the **Azure portal**, navigate to **Azure Arc > Infrastructure > Kubernetes clusters**. There you'll see any Arc-connected Kubernetes clusters and a tab for **Upgrade Insights (preview)**. Click **Upgrade Insights (preview)**. This will open a report showing critical and other issues that may impact your ability to upgrade. Scroll through the report and expand the various sections to see what needs to be resolved before you upgrade.

![Screenshot](https://labondemand.blob.core.windows.net/content/lab224874/screens/abcozmvt.png)

From GitHub Copilot in VS Code:
* Ask Copilot to find any Arc-enabled Kubernetes clusters.
* Then ask about upgrading the Kubernetes version of your Arc-enabled Kubernetes cluster. Example:

> I want to upgrade the Kubernetes version of my Arc-enabled Kubernetes cluster. What should I be aware of?

## Validate Your Operational Changes

Finish by asking Copilot:

> Recheck the machines we worked on in the lab. Summarize before and after status for connectivity, Hotpatch, automatic Connected Machine agent upgrades, and Windows Server 2016 ESU enrollment. Separate verified results from pending operations, failed operations, and blocked steps. Include the next action for anything unresolved. Do not make further changes.

You have now completed the operator loop: **discover an issue, assess the options, approve a scoped action, and verify the outcome**. Before leaving the lab, also revisit the Machine Configuration assignment from the previous section to check whether its compliance results have refreshed.
