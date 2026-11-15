# Plan: TokenTide, an app that wakes and queues Claude Code

Nov 14, 2026 · @Simpa

**Status:** locked on Nov 15, 2026. The plan changes only when the user has decided it.

Capitalised terms such as Entry, Run and Window are defined in `GLOSSARY.md`.

## MVP: what gets built now

The MVP is a macOS menu bar app. The Status panel is at the top. Below it are "+ Add" and a single list. The user adds Entries with "+ Add", and each Entry starts Claude at a chosen time.

There are two kinds of Entry. They share one list but are different features.

|  | Wake | Run |
| --- | --- | --- |
| Purpose | Start a 5-hour Window | Do work unattended |
| Project (folder) | No, it runs in an empty folder | Yes |
| Prompt | No, the app sends one character | Yes |
| Permission mode | Not needed | Auto or Skip all prompts |
| Model | The cheapest | Chosen per Entry |
| Start time | Now or a clock time | Now or a clock time |
| Retry | Checkbox | No |
| Hard stop | No | Optional clock time |

### The "+ Add" flow

1. Choose the kind: Wake (checkbox) or Run.
2. For a Wake: tick Retry to keep trying until it works.
3. For a Run: choose Project, permission mode and model. Write the prompt. A Hard stop is optional, and the field is empty by default.
4. Choose the Start time: Now or a clock time. A clock time means the next time the clock shows it, within 24 hours. No date is chosen.
5. The Entry lands in the list with status Waiting.

### Status panel

The Status panel shows the Windows. It is there first of all for the user to look at.

| Part | What it shows |
| --- | --- |
| Bar 1: current Window | A bar that fills, with the time left, for example "ends in 2 h". |
| Bar 2: next Window | When the next Window can start, for example "in 2 h". |
| Weekly time | The time left until the Weekly reset. |

The user types in two values:

- **Window end:** a clock time, when the current Window ends.
- **Weekly reset:** a weekday and a clock time. It repeats every week.

The app recalculates the Window when a Wake or a Run gets an answer from Claude after the Window end, or when no Window end is set. The new Window counts from the start of that Attempt. Claude rounds the start of a Window down to the nearest 10 minutes, so a Wake at 10:01 gives a Window from 10:00 to 15:00.

An Entry that starts inside the known Window changes nothing. The user can always type over the value.

When the Window end has passed and nothing new has started, bar 1 shows no Window and bar 2 shows that a Window can start now.

The app only shows the Weekly reset. No rule uses it.

### Rules

| Rule | Description |
| --- | --- |
| One Run at a time | While a Run is Running, the next one waits until it has ended. Two agents then never write to the same files. The queue goes in Start time order. Runs with the same Start time go in the order they were added. |
| Wake does not wait | A Wake is sent at its Start time, even while a Run is Running. |
| Retry | A Wake has a Retry checkbox. Ticked: the app makes an Attempt once a minute until one succeeds or the user presses Stop, and the Wake is Running meanwhile. Empty: the app makes a single Attempt, and the Wake gets Failed if it fails. An Attempt with no answer after 2 minutes counts as failed. Once Claude has answered, the Window is running and nothing more is needed. |
| Wake inside a Window | A Wake whose Start time is at or before the Window end starts no new Window. The app shows a warning on the Entry. It does not block the Wake or change its time, because the Window end is typed by hand and can be old or wrong. Such a Wake does not recalculate the Window. The exception is a Wake with Retry whose successful Attempt comes after the Window end: it recalculates the Window. The time of the successful Attempt decides. |
| Once | Each Entry applies once. Nothing repeats daily. Finished Entries stay in the list until the user removes them. A Waiting Entry can be removed but not edited. |
| Missed Start time | An Entry that is more than 5 minutes late because the computer slept or the app was closed does not start. It gets Failed with the text "missed start time". A Run that waited for its turn in the queue does not count as late. A Wake with Retry is the exception: it starts trying as soon as the computer is awake. |
| Limit reached | The Run ends with status Limit reached. It does not continue on its own in the MVP. Runs behind it in the queue start at their Start time as usual and may get Limit reached themselves. The app does not pause the queue. |
| Stop | Every Run has a stop button, and so has a Wake with Retry. A Run can also have a Hard stop. When the Hard stop passes, a Running Run is stopped, and a Run that is still Waiting never starts. Both get Stopped. A Run without a Hard stop has no stop time. |
| App quits | On Quit the app asks first and then stops the Running Run, which gets Stopped. After a crash, Entries still marked Running get Failed at the next start. Nothing restarts on its own. |
| Status | Waiting, Running, Done, Limit reached, Stopped, Failed. |
| Status in three cases | Denied actions with exit code 0 give Done, with the number of denied actions on the log line. A stop caused by login gives Failed with the text "not logged in". A Hard stop gives Stopped with the text "hard stop". |
| Log | One line per event: time, Project, status, session id and the last line from Claude. The full output of every Run is also saved in its own file. |
| Least privilege | Claude gets only the access an Entry needs, as far as possible. A Wake can only send one character and get an answer: no tools, no skills and no MCP servers. MCP servers are off in Runs too. Runs get no other limits in the MVP, see Later. |
| Awake | The computer is kept awake as long as an Entry is Waiting or Running. A charger and an open lid are required. |
| Menu bar | The app stays in the menu bar when the app window is closed. |
| Saved | Projects and Entries survive restarts. |

## Two examples

The examples show how the two kinds of Entry are used in the MVP.

### Example 1: Wake at 10:00

The user is away from the computer at 10 and wants a new Window to start anyway.

1. "+ Add", tick Wake, choose 10:00.
2. At 10:00 the app starts Claude in the background and sends one character.
3. The Window counts from 10:00. If the current Window ends at exactly 10:00, the user chooses 10:01 instead. Claude rounds down, so the Window still counts from 10:00.

An early start gives more Windows. A start at 05:00 gives 05–10, 10–15 and 15–20. A start at 09:00 gives 09–14 and 14–19.

### Example 2: Night Run before the Weekly reset

The week resets at 05:00 the next morning. It is 23:00 and there are tokens left. The Project has a plan and a list of issues.

1. "+ Add", Run, choose Project, mode Auto, model Opus, Start time Now. Prompt: "Continue where you left off, solve one issue, report and exit."
2. "+ Add" again with the same settings and the same prompt, Start time 04:00.

Result: one issue is solved at 23:00 and one at 04:00. More issues need more Entries, or a prompt that says "solve them all, one at a time".

## Build order

The app is built in five vertical slices. Each slice works from the UI to a start of Claude.

1. **Wake.** "+ Add", Wake, time. The app sends one character and logs the result.
2. **Status panel.** The two bars and the weekly time. A successful Wake recalculates the Window, and later a Run does too.
3. **One Run.** "+ Add" with Project, prompt, mode, model and time. Status and log are shown.
4. **Several Entries.** The list handles several Entries. One Run at a time.
5. **Menu bar and awake.** The app stays alive when the app window is closed and keeps the computer awake.

Wake is built first. It is the smallest and uses the same start of Claude as the Runs.

## Later

This is not part of the MVP.

| Thing | When | Description |
| --- | --- | --- |
| Resume | v2 | When tokens run out, the app continues the same Run in the next Window, until Claude ends by itself. Technically: `--resume <session-id>`. |
| Repeat | Later | The same prompt starts again until a clock time. The app cannot know when all issues are done, so that has to be solved first. |
| Read the Window end automatically | Later | The app reads the Window end from Claude instead of the user typing it in. Needs a test, see Open. |
| Least privilege for Runs | Later | Settings for what a Run may access. |
| Push block | Later | A technical block so that Claude never pushes in an unattended Run. |
| Last Start time | Later | The list stops starting new Runs after a clock time. That protects the day's Window. |

## Outside the app

The user handles three things, and three risks are known.

| Thing | Handling |
| --- | --- |
| Weekly reset | The user keeps track. The Status panel shows the time left once the user has typed it in. The app does nothing else with it. |
| Login | The user makes sure Claude Code is logged in. The app warns when a Run is stopped by login: the Entry gets Failed with the text "not logged in". |
| Design | The UI is drawn separately in Claude Design. |

### Known risks

| Risk | State |
| --- | --- |
| `claude -p` may be moved off the subscription | Anthropic planned this in May 2026 and paused the plan in June. Today `-p` draws from the subscription. Nothing is built for this risk now. |
| `--bare` may become the default for `-p` | The documentation says this happens in a future version. Bare mode does not use the subscription login. |
| Usage credits | With usage credits turned on, a Run does not stop at the limit. It continues on paid credits. |

## Tech

The app is built with Electron, React, TypeScript and Vite, with Vitest for tests.

| Part | Choice |
| --- | --- |
| Starting Claude | `claude -p`. Claude runs the prompt and exits by itself. |
| Output | `--output-format stream-json --verbose` gives one JSON line per event. Status is read from there, not from text. |
| Done signal | The last line is a `result` event. Exit code 0 means the Run succeeded. |
| Permissions | `--permission-mode` is always given for a Run. `--permission-prompts none` says that nobody can answer prompts. |
| MCP | `--strict-mcp-config` is always given, for both Wake and Run. It turns the MCP servers off. |
| Wake access | A Wake also gets `--tools ""` and `--disable-slash-commands`: no tools and no skills. |
| Retry | One Attempt a minute. An Attempt is ended after 2 minutes without an answer. |
| Denied actions | The result lists them in `permission_denials`. Needs Claude Code v2.1.259 or later. |
| Stop | The stop button sends SIGINT (interrupt) and then SIGTERM (terminate). |
| Clock | The list is compared with the computer's clock every 30 seconds. A long timer stops when the computer sleeps. |
| Window maths | A Window starts at the time of its first message, rounded down to 10 minutes. The Window end is 5 hours later. |
| Path | The app tries `~/.local/bin/claude` first and otherwise asks the login shell. It saves the link, not the version folder the link points to, because that folder changes with every update. The path can be changed in the app. |
| PATH | The app passes the login shell's PATH on to Claude. An app started from Finder does not get the terminal's PATH. |
| Packaging | The app is built as `TokenTide.app` and can be started from Finder. The path and PATH handling is checked in the built app. |
| Awake | Electron `powerSaveBlocker`. No terminal and no caffeinate are needed. |
| Data | JSON in the app's data folder. The full output of every Run is saved in its own file. |
| Folder | `~/dev/tokentide`. The app is called TokenTide. |

### Commands

```bash
# Wake, in an empty folder
claude -p "!" --model haiku --tools "" --disable-slash-commands --strict-mcp-config --output-format stream-json --verbose

# Run, in the Project's folder
claude -p "<prompt>" --permission-mode auto --permission-prompts none --strict-mcp-config --model <model> --output-format stream-json --verbose
```

The mode "Skip all prompts" replaces `--permission-mode auto` with `--dangerously-skip-permissions`.

A Wake must not use `--bare`. Bare mode does not use the subscription login and then starts no Window.

## Facts the plan builds on

The rows with a link come from Anthropic's own pages. The last three do not, and each names its source.

| Fact | Source |
| --- | --- |
| A 5-hour Window starts with the first message and resets 5 hours later. | [Anthropic support: usage limits](https://support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work) |
| The weekly limit resets at a fixed time that belongs to the account. | [Anthropic support: usage limits](https://support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work) |
| `claude -p` draws from the subscription's limits when logged in with a plan. | [Anthropic support: Agent SDK and plan](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan) |
| Usage credits let work continue on paid credits after the limit. | [Anthropic support: usage credits](https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans) |
| `claude -p` runs without a chat. The last line in `stream-json` is a `result` event. Exit code 0 means a successful run. | [Claude Code: headless](https://code.claude.com/docs/en/headless) |
| `--resume <session-id>` continues a specific conversation. `--continue` continues the latest one. | [Claude Code: headless](https://code.claude.com/docs/en/headless) |
| `--permission-prompts none` is meant for unattended runs. | [Claude Code: headless](https://code.claude.com/docs/en/headless) |
| A `-p` run without a chosen mode starts in Manual. Actions that need approval are denied. | [Claude Code: permission modes](https://code.claude.com/docs/en/permission-modes) |
| In auto mode a reviewing model judges every action. Force push is stopped, ordinary push is allowed. Deny rules apply in all modes. | [Claude Code: permission modes](https://code.claude.com/docs/en/permission-modes) |
| Claude Desktop has its own scheduled tasks. They do not know about the Windows and skip a task that collides. | [Claude Code: desktop scheduled tasks](https://code.claude.com/docs/en/desktop-scheduled-tasks) |
| The start of a Window is rounded down to the nearest 10 minutes. First messages at 07:08, 20:03 and 00:25 gave Window ends at 12:00, 01:00 and 05:20. | The user's own session logs, October and November 2026. Not in Anthropic's documentation. |
| In a session log, a reached limit is a message with `apiError: "usage_limit_reached"`. Its `rate_limit_info` holds `status`, `resetsAt` (the end time) and `rateLimitType` (`five_hour` or `seven_day`). | The user's own session logs. Not tested with `-p`. |
| The event `rate_limit_event` exists in `stream-json` and carries status and end time. | Bug reports from users. Not in Anthropic's documentation. Not tested. |

## Open

Four things are to be tested. Nothing is left to decide.

| Question | Settled by |
| --- | --- |
| How does Limit reached show in the `stream-json` output? | Seen the first time a Run reaches the limit. The session logs show the fields, see Facts. The full output is saved, so it can be read afterwards. |
| Does the output of an ordinary Wake contain the Window end? | Read the output after a Wake in slice 1. |
| Does `--strict-mcp-config` also turn off the claude.ai connectors? | Read the output after a Wake in slice 1. |
| Is the start of a Window rounded down to 10 minutes, as the logs show? | Compare the end time in Claude with the time of a Wake in slice 1. |

## Ways of working

The app is built with Claude Code under six rules.

- TDD red-green-refactor. The time logic is written first, as pure functions that can be tested without Claude.
- Vertical slices: every step gives something that works from the UI to a start of Claude.
- Claude is never author or co-author of commits and never pushes. The user approves the commits and does the pushing.
- The user answers the permission prompts in Claude Code.
- The user and Claude talk in Swedish. Everything else is in English: UI, code, commits, docs and issues.
- The plan is locked. It changes only when the user has decided it.
