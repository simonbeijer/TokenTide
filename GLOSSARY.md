# TokenTide

TokenTide is a macOS menu bar app that starts Claude Code at chosen times, so that a usage window can begin or work can get done while the user is away.

## Language

**Entry**:
One item in the app's list: something that starts Claude at a Start time, exactly once. An Entry is either a Wake or a Run.
_Avoid_: Row, job, task, item

**Wake**:
An Entry whose only purpose is to start a Window. It sends a minimal message and does no work.
_Avoid_: Ping, keep-alive

**Run**:
An Entry that does unattended work: a prompt carried out in a Project.
_Avoid_: Job, task, execution, session

**Attempt**:
One start of Claude on behalf of an Entry. An Entry can need several Attempts.
_Avoid_: Try, execution

**Retry**:
A choice on a Wake: keep making Attempts until one succeeds. Without it, a Wake makes a single Attempt.
_Avoid_: Repeat, loop

**Project**:
A folder on the user's machine in which a Run does its work.
_Avoid_: Repo, workspace, directory

**Start time**:
The moment an Entry is due: either now, or the next occurrence of a clock time.
_Avoid_: Schedule, trigger time

**Hard stop**:
An optional clock time after which a Run must not be running. A Run still Waiting at its Hard stop never starts.
_Avoid_: Timeout, deadline, stop time

## Windows

**Window**:
The 5-hour usage period of the user's Claude plan. It starts with the first message sent after the previous Window has ended.
_Avoid_: Session, session window, and "window" for the app's own window (say "app window")

**Window end**:
The clock time when the current Window ends. From then on a new Window can start.
_Avoid_: Reset time, next window start

**Weekly reset**:
The weekday and clock time when the plan's weekly usage limit resets. It is the same every week.
_Avoid_: Week end, weekly limit

**Status panel**:
The area at the top of the app that shows the current Window, the next Window and the time left until the Weekly reset.
_Avoid_: Dashboard, header, panel

## Entry statuses

**Waiting**:
The Entry has not started: its Start time has not come, or it is a Run queued behind another Run.
_Avoid_: Pending, queued, scheduled

**Running**:
Claude is working on the Entry right now.
_Avoid_: Active, in progress

**Done**:
Claude finished the Entry and reported success.
_Avoid_: Completed, succeeded, finished

**Limit reached**:
The Entry ended because the plan's usage limit was hit.
_Avoid_: Rate limited, out of tokens

**Stopped**:
The Entry was ended on purpose, by the user or by its Hard stop.
_Avoid_: Cancelled, aborted, killed

**Failed**:
The Entry ended for any other reason, including never starting.
_Avoid_: Error, crashed

**Note**:
A short text on the Entry that says why it got its status, such as "missed start time".
_Avoid_: Reason, message, comment
