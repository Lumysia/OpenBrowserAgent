# Skills

A skill is a set of instructions for one kind of task, such as filling in a form or tidying your tabs. OpenBrowserAgent comes with built-in skills, and you can write your own.

## Using a skill

There are three ways:

- **Let the agent choose.** Skills set to Auto are used on their own when your request fits, for example "fill in this form with my details" or "tidy up my tabs".
- **Type `/` in the side panel.** At the start of a message, `/` lists your skills. Keep typing to filter, use the arrow keys and Enter (or click) to pick one, then type your request. You can also type the whole thing, such as `/tidy-tabs close the duplicates`.
- **Use "+" → Skills** in the message box and pick one or more skills for the next message.

A skill you pick is used for that message.

## Built-in skills

| Skill                          | What it does                                                                                               |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `fill-form`                    | Fills in a form from details you give and checks every field. It submits only when you ask it to.          |
| `tidy-tabs`                    | Closes duplicate tabs and groups related ones. It asks before closing tabs unless you told it to go ahead. |
| `openbrowseragent-help`        | Answers questions about using and setting up OpenBrowserAgent, based on this documentation.                |
| `skill-creator`                | Creates or improves skills, including "save what we just did as a skill".                                  |
| `local-execution-bridge-setup` | Walks you through setting up the local execution bridge so the agent can run commands on your computer.    |

Built-in skills update with the extension.

## Record a skill

You can teach the agent a browser task by doing it once yourself:

1. Open the side panel on the page where the task starts and choose **+ → Record a skill**.
2. Optionally say what it is for and what changes each time (for example "the week and the project"), then choose **Start recording**. A **Recording · Stop** pill stays at the top of the page while it records.
3. Do the task. Each step shows up in the side panel: delete steps you did by mistake, mark a step **Changes each time**, or keep what you typed in a field as an example (never offered for passwords, codes or card numbers, and only while the page still shows it).
4. Choose **Stop** (in the side panel or on the pill). The model writes a skill from the steps: a name such as `submit-weekly-timesheet`, a description, and instructions with the inputs, steps and how to check the result.
5. Check the name and description, then choose **Save and check**. The skill runs once in a new tab: the agent asks for the inputs, asks you to fill passwords on the page yourself, and asks before the final submit, purchase, send or delete. When it works, the skill is marked **Verified** and you can let the agent use it automatically. **Skip, save as draft** saves it without the check.

If the check went differently, choose **Fix the steps** (the agent edits the skill from the run), **Record again from here** (records the rest again in the check tab, keeping the earlier steps), or **Save as draft**.

Recorded skills are ordinary skills: `SKILL.md` plus `references/demonstration.json`, the recorded steps with what each element is called on the page, used only as hints. They start as **Manual**, sync like your other skills and show **Recorded · Draft** or **Recorded · Verified** in Settings. Recording stops when its tab closes or after 15 minutes without a step, and the agent does not work in a tab while it is being recorded. Record short tasks: long recordings (over about 40 steps) make weaker skills, and at most 100 steps are kept. Sign in before you record. What recording captures is described in [Permissions and privacy](permissions-and-privacy.md#teach-mode-recording).

If you sync with a device that still runs OpenBrowserAgent 0.2.0, editing a recorded skill there (in Settings or by the agent) removes its **Recorded** and **Verified** marks on every device; the skill itself and its steps stay.

## Settings

Open **Settings → Agents & skills → Skills**. For each skill you can choose:

- **Auto**: the agent uses it when a request fits (the default).
- **Manual**: only when you pick it with `/` or "+". Manual skills are not listed to the agent, which keeps requests a little smaller.
- **Off**: never used.

Built-in skills can't be edited. **Customize** makes your own copy with the same name, which replaces the built-in until you delete it; **Revert to built-in** deletes the copy.

You can also create skills, import `.zip` or `.skill` packages and download skills there. In a chat, ask the agent to "save what we just did as a skill" to turn a finished task into one.

If the descriptions of your Auto skills get long, the Skills page shows a warning: set skills you rarely need to Manual, or shorten their descriptions.
