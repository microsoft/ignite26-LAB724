## Before you're done

This repo has been created for your Microsoft Ignite 2026 session. Here's how to get it ready.

**Easiest path — use the agent (recommended):**

- Open GitHub Copilot Chat and say `help me initialize repo`. The agent will walk you through getting the README populated.
- When you're ready to publish, say `help me finalize repo`. The agent will clean up unused folders, validate everything, and remove this "Before you're done" section and other extra stuff that attendees don't need to see.
- Curious how it works? Read the [agent workflow](.github/AGENT-WORKFLOW.md).

**Doing it manually?**

Fill in the sections below yourself, then:

- Delete any placeholder folders you don't need (`data/`, `infra/`, etc.)
- Delete this "Before you're done" section
- Delete `.github/agents/`, `.github/tests/`, `.github/copilot-instructions.md`, and `.github/AGENT-WORKFLOW.md` — these are template tooling, not part of your published repo

**Folder conventions:**

- Attendee step-by-step guidance goes in `instructions/`. If you use MkDocs or a docs site instead, put it in `docs/` and link to it from this README.
- Reference material and background reading go in `docs/`.
- You can add a `.devcontainer/` folder if needed.

---

<a name="start-building"></a>

<p align="center">
<img src="img/banner-ignite-26.png" alt="Microsoft Ignite 2026" width="100%"/>
</p>

# [Microsoft Ignite 2026](https://ignite.microsoft.com)

## 🔥LAB724: Govern your estate with Azure Arc and Azure Resource Manager MCP
### Session description

Roll up your sleeves for a 75-minute interactive lab. Use your own AI agents and Azure Resource Manager MCP Server to explore real-time inventory, policy compliance, cost insights, and user-controlled deployments. Onboard, monitor, govern, and secure Azure VMs and on-premises servers through Azure Arc. You’ll also enable Extended Security Updates for Windows Server 2016 while building a practical modernization plan for your hybrid estate.

### 🚀 Getting started

#### In a guided session

If you're following along during a live session:

1. Step 1
2. Step 2
3. Open [`instructions/`](instructions/README.md) when this session includes
   attendee step-by-step guidance

#### On your own

If you're learning at your own pace:

1. Clone this repository
2. Set up your environment
3. Follow the session guidance in [`instructions/`](instructions/README.md), or
   use the linked docs-site entry point when this repository uses that pattern

### 🎯 Learning outcomes

By the end of this session, you will be able to:

- Use GitHub Copilot and Azure Resource Manager MCP Server to explore real-time inventory, policy compliance, and perform user-controlled infrastructure management.
- Onboard, monitor, govern, and secure Azure VMs and on-premises servers through Azure Arc, using Essential Machine Management and Machine Configuration.
- Enable Extended Security Updates for Windows Server 2016 and build a practical modernization plan for your hybrid estate.
- Enable Hotpatch for Windows Server with Azure Arc
- Prepare for Kubernetes version upgrades with Upgrade Insights


### 💻 Technologies used

- GitHub Copilot
- Azure Resource Manager MCP Server
- Azure Arc
- Azure Virtual Machines
- Arc-enabled Kubernetes
- Essential Machine Management
- Machine Configuration
- Windows Server 2016 Extended Security Updates

### 📚 Continue your learning

Pick your next step based on your learning style:

| Resource | What you'll get |
|----------|-----------------|

| **[Arc and ARM MCP Documentation](https://aka.ms/arc/ignite2026)** | Documentation for the features and capabilities used in this lab |
| **[Ignite 2026 Next Steps](https://aka.ms/ignite26-next-steps)** | Additional session repos and materials from Microsoft Ignite 2026 |
| **[Microsoft AI Skills Navigator](https://aka.ms/ignite26-asn)** | Discover AI skills, learning paths, and resources for your next step |
| **[Microsoft Learn](https://aka.ms/ignite26-learn)** | Official documentation and guided learning paths on these topics |
| **[Microsoft Foundry Community](https://aka.ms/MicrosoftFoundryDiscord-Ignite26)** | Connect with other learners and experts in our Discord community |

### 🌟 Microsoft Learn MCP Server

<!-- Remove this section if the Microsoft Learn MCP Server is not relevant to the session. -->

The Microsoft Learn MCP Server gives your AI agent direct access to Microsoft's official documentation — grounded, up-to-date answers about the topics in this session.

**GitHub Copilot CLI** — Install with:

```shell
copilot plugin install microsoftdocs/mcp
```

**VS Code** — One-click install:  
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Microsoft_Learn_MCP-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://vscode.dev/redirect/mcp/install?name=microsoft-learn&config=%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Flearn.microsoft.com%2Fapi%2Fmcp%22%7D)

For more information, visit the [Learn MCP Server repo](https://aka.ms/learnmcp).

### 👥 Content owners

<!-- TODO: Add yourself as a content owner
1. Change the src in the image tag to {your github url}.png
2. Change INSERT NAME HERE to your name
3. Change the github url in the final href to your url. -->

<table>
<tr>
    <td align="center"><a href="https://github.com/usepowershell">
        <img src="https://github.com/usepowershell.png" width="100px;" alt="Steven Murawski"/><br />
        <sub><b>Steven Murawski</b></sub></a><br />
            <a href="https://github.com/usepowershell" title="talk">📢</a>
    </td>
    <td align="center"><a href="https://github.com/StevenBucher98">
        <img src="https://github.com/StevenBucher98.png" width="100px;" alt="Steven Bucher"/><br />
        <sub><b>Steven Bucher</b></sub></a><br />
            <a href="https://github.com/StevenBucher98" title="talk">📢</a>
    </td>
    <td align="center"><a href="https://github.com/MasonTorres">
        <img src="https://github.com/MasonTorres.png" width="100px;" alt="Mason Torres"/><br />
        <sub><b>Mason Torres</b></sub></a><br />
            <a href="https://github.com/MasonTorres" title="talk">📢</a>
    </td>
</tr></table>

### ⚖️ Trademarks

This project may contain trademarks or logos for projects, products, or services. Authorized use of Microsoft trademarks or logos is subject to and must follow [Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/legal/intellectualproperty/trademarks/usage/general). Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

Any use of third-party trademarks or logos are subject to those third-party's policies.
