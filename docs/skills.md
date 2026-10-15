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

## Settings

Open **Settings → Agents & skills → Skills**. For each skill you can choose:

- **Auto**: the agent uses it when a request fits (the default).
- **Manual**: only when you pick it with `/` or "+". Manual skills are not listed to the agent, which keeps requests a little smaller.
- **Off**: never used.

Built-in skills can't be edited. **Customize** makes your own copy with the same name, which replaces the built-in until you delete it; **Revert to built-in** deletes the copy.

You can also create skills, import `.zip` or `.skill` packages and download skills there. In a chat, ask the agent to "save what we just did as a skill" to turn a finished task into one.

If the descriptions of your Auto skills get long, the Skills page shows a warning: set skills you rarely need to Manual, or shorten their descriptions.
