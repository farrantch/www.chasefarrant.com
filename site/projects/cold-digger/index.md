---
date: '2026-09-26'
description: Offline raw disk-image analysis and recovery, with crypto wallet detection, deleted files, browser history, and searchable reports.
layout: layouts/base.njk
tags:
  - projects
  - software
  - python
title: Cold Digger
---

# {{ title }}

Cold Digger brings disk-image analysis, file recovery, and crypto wallet
investigation into one local workflow. It reads a raw image, saves its findings
in a separate case directory, and produces reports that can be opened offline.
This is the project previously listed here as Disk Analyzer.

[Source on GitHub](https://github.com/farrantch/cold-digger) ·
[Releases](https://github.com/farrantch/cold-digger/releases)

## One image, one case

The scan reads the source image without mounting or modifying its filesystems.
Partition discovery identifies volumes, Sleuth Kit inventories and extracts
files, and PhotoRec searches the whole image for recoverable file content.

A SQLite case database connects findings to their source locations and records
which parts of the image each tool could examine. Recovered artifacts are
identified by content hashes, so repeated findings can be grouped while their
individual source locations are preserved.

Scans save progress and can resume after interruption. Reports can be rebuilt
from the saved case without repeating the scan. Some recovery stages, including
PhotoRec carving, restart their work when resumed.

## What it can find

- Crypto wallet material, with candidate validation and public-address derivation.
- Allocated and deleted files, plus content recovered through file carving.
- Browser history from supported Chromium, Firefox, and Internet Explorer stores.
- Documents, images, and videos for review in a file explorer and media gallery.

The reports distinguish potential leads from broader observations. A matching
filename or wallet structure is a starting point for investigation; recovery
and validation results retain their supporting evidence and coverage limits.

## Reviewing the results

The offline HTML dashboard links to crypto findings, a searchable file explorer,
and the media gallery. Large inventories load in chunks so the browser does not
need to render every file at once. An optional local server can read individual
files from the source image on demand.

```bash
cold-digger doctor
cold-digger scan /mnt/images/old-pc.img --output /mnt/recovery/old-pc
cold-digger status /mnt/recovery/old-pc
```

The resulting `report.html` is the entry point for reviewing a case. Scanning
and report generation run locally. Public-address balance checks are separate,
explicit commands that use network services.

## Current scope

The alpha release supports single-file raw images such as `.img`, `.dd`, and
`.raw`, with Ubuntu 24.04 and Python 3.11–3.13 documented for setup. It does not
repair filesystems, unlock encrypted volumes, or guarantee recovery of overwritten
or fragmented files.

The Python application is released under the MIT License and builds on Sleuth
Kit, PhotoRec, and other tools with their own licenses.

[Usage reference](https://github.com/farrantch/cold-digger/blob/main/docs/reference.md) ·
[Architecture and supported formats](https://github.com/farrantch/cold-digger/blob/main/docs/architecture.md)
