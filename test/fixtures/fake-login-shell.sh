#!/bin/sh
# Stand-in for the user's login shell. Tests never read the real one.
# It prints noise, as a shell profile may, then runs the script it is given with a PATH of its own.
#
# FAKE_SHELL_PATH:   the PATH the "profile" sets
# FAKE_SHELL_RECORD: path of a file to write the arguments to
if [ -n "$FAKE_SHELL_RECORD" ]; then printf '%s\n' "$@" > "$FAKE_SHELL_RECORD"; fi
echo "Welcome back! (noise from a profile)"
PATH="$FAKE_SHELL_PATH"
export PATH
# The last argument is the script, after the flags.
for script; do :; done
eval "$script"
