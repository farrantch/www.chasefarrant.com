---
date: '2026-09-26'
description: Local push-to-talk dictation for Linux/X11, with OpenASR transcription, optional Ollama cleanup, and personal vocabulary.
layout: layouts/base.njk
tags:
  - projects
  - software
  - python
title: Cap To Talk
---

# {{ title }}

Cap To Talk turns Caps Lock into a dictation key across a Linux desktop. Hold
the key, speak, and release it to insert the resulting text into the window
where you started. The default setup runs speech recognition and text cleanup
locally, without a cloud API key.

[Source on GitHub](https://github.com/farrantch/cap-to-talk) ·
[Releases](https://github.com/farrantch/cap-to-talk/releases)

## From speech to text

The application connects a few small pieces:

1. An X11 shortcut captures the key press and remembers the active window.
2. Python records the microphone while the key is held.
3. OpenASR transcribes the recording using a local speech model.
4. An optional Ollama model cleans up the wording before the text is inserted
   into the original window.

Holding **Shift + Caps Lock** skips cleanup and inserts the raw transcript.
If the cleanup service fails, the application also falls back to the transcript.
The status window and desktop notifications show recording, transcription,
cleanup, and insertion progress.

## Personal vocabulary

Names and technical terms need more context than ordinary dictation. A hotword
file supplies focused recognition hints to OpenASR. A separate, larger glossary
provides relevant spellings to the cleanup model, selected using the transcript.

The cleanup prompt asks the model to retain details, corrections, uncertainty,
and the speaker's tone while removing filler and repeated fragments. The raw
mode remains useful when the exact transcription is preferable.

## Desktop setup

The installer supports starting the application on demand or automatically at
login. It installs the local services and models while preserving existing
settings. The `cap-to-talk check` command checks the setup when a microphone,
shortcut, or service is not working.

Temporary audio is removed after each transcription request. Transcript logging
is disabled by default. Service addresses, audio settings, output behavior,
and vocabulary files are configurable.

## Current scope

This is an alpha project for Linux with an X11 desktop session. The documented
setup targets Ubuntu 24.04 or a compatible Debian-based distribution and Python
3.12 or newer. Native Wayland support is not implemented yet.

The application is written in Python and released under the MIT License.
OpenASR, Ollama, and the speech and language models have their own licenses.

[Installation and configuration](https://github.com/farrantch/cap-to-talk#readme)
