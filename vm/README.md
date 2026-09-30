# Portfolio Linux VM

The terminal boots Linux 6.8.12 under v86 and connects xterm.js to ttyS0.
The browser sends keystrokes; Linux interprets commands. There is no JavaScript
shell parser. The site remains static and can run on the existing S3/CloudFront
hosting.

## What is included

- A vendored Buildroot kernel with an embedded root filesystem (about 9.7 MiB).
- BusyBox ash and 250+ utility applets: ls, find, grep, sed, awk, sort, tree,
  tar, gzip, vi, less, ps, top, and more. `commands` lists the installed applets.
- Additional tools including GNU nano 9.2, curl 8.22.0 with HTTPS, Lua, joe, ed, and links. Guest networking is
  disconnected, so network clients cannot fetch remote resources.
- Upstream terminal games: vitetris, New BSD Games, and 2048.c under `/opt`.
- A generated initramfs overlay with the public portfolio and startup scripts.
- An unprivileged `guest` account, writable home and /tmp, and automatic login.
- Per-visit memory only. Restart/reload discards changes.

These are BusyBox utilities, not the full GNU toolset. Flags vary by program;
`COMMAND --help` describes the installed version. Bash, Python, Git, apt, and apk
are not bundled. Native programs must support 32-bit x86; x86-64 binaries do not
run in v86.

## Build and test

```sh
npm ci
npm run build
npm test
npm run test:vm
npx playwright install chromium
npm run dev
# In a second terminal:
npm run test:browser
```

`cd site && npx eleventy` also builds the image automatically. No Docker, root,
cross-compiler, network download, or host cpio installation is required for a
normal site build. `npm ci` needs the package registry; subsequent builds use
vendored VM images and installed dependencies.

`scripts/build-vm.cjs` verifies the SHA-256 hashes in `vm/assets.json`, generates
an ordered newc archive, compresses it, and copies the runtime to
`site/_site/vm/<content-hash>/`. The content hash includes the image, overlay,
portfolio, emulator, and terminal assets. The terminal starts automatically as
guest, showing boot messages one at a time inside the terminal area. Each line stays
visible briefly before completion. When startup finishes, the ASCII art
appears first, followed by the welcome paragraph after 0.4 seconds. The guest
prompt and cursor follow 0.8 seconds after the paragraph. Each pause starts
when its content is visible; switching to Browse or hiding the tab resets the
current pause. Input stays disabled until the prompt appears. The browser
buffers the guest's output between stages and clears the timer on disposal. Direct links to Browse skip the VM download
until the visitor switches to Terminal. Expect about 16–17 MiB for a first
session and 128 MiB of guest RAM, plus emulator/browser overhead. Performance
varies by device. Browse works without booting the VM or enabling JavaScript.

## Nano

`nano notes.txt` opens the bundled editor. Save with **Ctrl+O**, press **Enter**
to confirm the filename, then exit with **Ctrl+X**. `EDITOR` and `VISUAL` default
to nano. Files remain temporary and are cleared by `reboot` or a page refresh.

Nano is compiled from the official 9.2 source as a static 32-bit x86 executable.
It is installed at `/usr/local/bin/nano` by the image builder, with its SHA-256
checked alongside the kernel and firmware. Its xterm-256color terminal definition is bundled too. It needs no guest package manager
or internet connection. The existing `vi`, `joe`, and `ed` remain available.

To rebuild it (Docker is needed only for this maintenance step):

```sh
docker build -f vm/programs/nano/Dockerfile \
  --output type=local,dest=/tmp/portfolio-nano vm
cp /tmp/portfolio-nano/nano-i386 vm/assets/nano-i386
cp /tmp/portfolio-nano/xterm-256color vm/assets/xterm-256color
cp /tmp/portfolio-nano/build-packages.txt vm/programs/nano/build-packages.txt
sha256sum vm/assets/nano-i386 vm/assets/xterm-256color
# Record these checksums in the matching vm/assets.json entries.
npm run test:vm
npm run build
```

When upgrading, update the pinned source archive, source checksum in the
Dockerfile and `vm/assets.json`, binary checksum, notices, and version checks.
The source archive, recipe, dependency versions, and license notices are also
published beside the VM assets; they are not downloaded during normal boot.

## HTTPS and curl

The overlay replaces `/usr/bin/curl` with curl 8.22.0, statically linked to
OpenSSL 3.5.8, zlib, and musl. The base image's original curl had no TLS backend
and rejected `https`, including `--proto '=https'` used by many installers.
The replacement supports HTTPS and uses the bundled Mozilla-derived CA store at
`/etc/ssl/certs/ca-certificates.crt`. Certificate verification remains enabled.

HTTPS support and internet connectivity are separate. The current VM still has
no network relay, IP configuration, or DNS resolver; it cannot download software
until outbound networking is configured. Enabling TLS does not turn the image
into a full distribution: it still has no package manager, and downloaded
programs must support its 32-bit CPU and available libraries.

To rebuild curl:

```sh
docker build -f vm/programs/curl/Dockerfile \
  --output type=local,dest=/tmp/portfolio-curl vm
cp /tmp/portfolio-curl/curl-i386 vm/assets/curl-i386
cp /tmp/portfolio-curl/ca-certificates.crt vm/assets/ca-certificates.crt
cp /tmp/portfolio-curl/build-packages.txt vm/programs/curl/build-packages.txt
sha256sum vm/assets/curl-i386 vm/assets/ca-certificates.crt
# Update the matching vm/assets.json checksums, then run the VM and browser checks.
```

The final link uses libtool's `-all-static` so Alpine shared libraries are not
needed in the guest. The source archive, build recipe, dependency receipt, and
license notices are published beside the VM assets. Keep those versions and
checksums together when updating curl or its TLS dependencies.

## Games

The image includes upstream games with pinned sources and asset checksums:

- **vitetris 0.59.1**: `/opt/vitetris/bin/tetris` (BSD-2-Clause).
- **New BSD Games 6.0.2**: `/opt/nbsdgames/bin/`, including its menu and 22 games
  such as `mines`, `sudoku`, `battleship`, `snakeduel`, and `checkers` (CC0-1.0).
- **2048.c**, commit `afc8898691f54d43309497f4c32682fe90bb5f57`:
  `/opt/2048/bin/2048` (MIT).

Those directories are on the guest PATH. `games` launches the upstream
`nbsdgames` menu; `tetris` and `2048` launch separately. `help games` covers
controls and links to the original projects. The earlier custom `lander`
script has been replaced by this collection. No game directory is added to
`/home/guest`.

The programs run as guest. New BSD Games keeps scores in `/var/opt/nbsdgames`;
vitetris uses `/var/opt/vitetris/hiscores` and its normal per-user configuration.
Scores and settings are temporary, like other files in the VM. No shared
leaderboard or network service is involved.

Tetris (using its curses backend) and 2048 are static i586 binaries. New BSD
Games shares its own musl loader and ncurses library under `/opt/nbsdgames/lib`, with an explicit ELF
interpreter and library search path. This avoids duplicating the libraries
inside every game, and uses no libraries from the base Buildroot image.
Sources, licenses, manuals, and the dependency receipt are included; source
archives are published beside the VM assets and are not fetched during boot.

To rebuild (Docker is needed only for this maintenance step):

```sh
docker build -f vm/programs/games/Dockerfile \
  --output type=local,dest=/tmp/portfolio-games vm
node vm/programs/games/import.cjs /tmp/portfolio-games
npm run test:vm
npm run build
# With site/_site being served:
npm run test:browser
```

`vm/programs/games/sources.json` pins all upstream revisions and archive hashes.
When upgrading, update those records, archives, and Dockerfile checksums,
then import the build outputs. Game rules and interfaces remain upstream;
vitetris needs `-Wno-error=implicit-int` for an old declaration with GCC 15.

## Clipboard and session files

Select text and use **Ctrl+C** or **Ctrl+Shift+C** to copy; use **Ctrl+V** or
**Ctrl+Shift+V** to paste. macOS uses **Cmd+C/Cmd+V**. The browser context menu
also provides copy/paste. With no selection, Ctrl+C still interrupts the running
command. Multiline paste goes through xterm's normal paste handling, including
bracketed paste when the guest application enables it. Clipboard access comes
from browser gestures; guest escape sequences cannot read or replace it.

Files live in guest RAM. Reloading, closing the page, restarting, or returning
later in the same browser starts from the image again. Switching to Browse just
pauses the current VM and keeps its files. There is no filesystem or VM snapshot
in IndexedDB.

## Portfolio files

The guest home contains six sections:

```text
/home/guest/
  about/
    intro.txt                 Introduction and technical focus
    hobbies.txt               Life outside work
  projects/
    www.chasefarrant.com/
      readme.txt              Short overview, status, tools, and links
      article.txt             Full writeup, when available
      page.url                Project page
      github.url              Public source repository, when available
    ...
  career/
    2022_veritone/
      role.txt
      work.txt
      tools.txt
    2020_artisan-viagio/
      role.txt
      work.txt
      tools.txt
    2017_balanceinnovations-brinks/
      role.txt
      work.txt
      tools.txt
    2014_billsoft-eztax-avalara/
      role.txt
      work.txt
      tools.txt
    2013_payless/
      role.txt
      work.txt
      tools.txt
    2010_kansas-state/
      role.txt
      work.txt
      tools.txt
  notes/
    2023-02-23_cloudformation/
      readme.txt
      article.txt
      page.url
    2023-12-06_startup-infrastructure/
      readme.txt
      article.txt
      page.url
  contact/
    email.url
    github.url
    linkedin.url
    meeting.url
    resume.url                Public HTTPS URL of the résumé
  documents/
    ChaseFarrant-Resume.pdf    The actual résumé PDF
```

Every employer directory contains the same three files:

- `role.txt`: title, dates, location, summary, and company history when relevant.
- `work.txt`: detailed responsibilities and accomplishments, grouped by topic
  or position. Avalara's two positions retain their separate dates.
- `tools.txt`: the technical stack.

Start-year prefixes sort the employer directories chronologically. Directory
names come from the `directory` field in `site/_data/career.json`. Dashes
separate company names after acquisitions or renames:

```sh
cd ~/career/2014_billsoft-eztax-avalara
cat role.txt
less work.txt
cat tools.txt
```

The Browse view uses the same complete career content as the terminal.
`open ~/documents/ChaseFarrant-Resume.pdf` and `open ~/contact/resume.url` both
print the public URL `https://www.chasefarrant.com/ChaseFarrant-Resume.pdf`.
Click the terminal link to open it, or use the link in the top bar. On the
production origin, the top bar offers **Download PDF**; local previews link
to the public copy. The Browse contact section also has a direct download link.
The guest contains the actual PDF bytes, built from `site/ChaseFarrant-Resume.pdf`,
which is also the published browser copy. Replace that source file and rebuild
to update both copies.

Project summaries include `open ~/projects/<slug>/github.url` when a public
repository is available. `page.url` opens the project writeup or other public
project page. Private repositories do not get public GitHub shortcuts. Note
directories use `YYYY-MM-DD_<slug>`, with the date taken from the article's
frontmatter. Each note retains its own overview, article, and browser link.
Prose wraps at 72 columns; code retains its formatting.
Article links are collected at the end so URLs do not interrupt the paragraphs.
Use `less` for long files. The generated files belong to the guest account.

Project directories come from the explicit `slug` in `site/_data/catalog.json`.
Add the title, description, highlights, category, materials, year, status, and
optional `url` and public `repository` URL there. Internal project URLs also include their Markdown article
as `article.txt`. The project index and Browse view use the same records.

`site/_data/notes.json` lists the articles included in the guest, with a short
slug, source path, summary, and takeaways. It currently includes the completed
CloudFormation and startup infrastructure articles. The S3QL and microservices
drafts, two placeholder project articles, and duplicate deck/basement article
are not included in the guest catalogs. Their original source pages remain in
the repository.

Edit the biography in `site/_data/profile.json` and work history in
`site/_data/career.json`. Each career record uses `directory`, company and role
metadata, `summary`, optional company `history`, `sections` (a heading, optional
dates, and items), and `tools`. Source notes and reconciled dates are
recorded in [career-sources.md](career-sources.md).

`help` covers navigation; `help keys` covers shortcuts; `help session` covers
files, networking, and resets; `help games` covers the bundled games. These guides live in
`vm/overlay/usr/local/share/portfolio/`. `commands` groups useful tools by task;
`commands --all` lists all BusyBox applets and the additional programs.

## Add a script or program

For a shell script, create `vm/overlay/usr/local/bin/my-command`:

```sh
#!/bin/sh
printf 'Hello from a real Linux process.\n'
```

Build the site. The archive builder marks files in `usr/local/bin` executable;
`my-command` will be on the guest's PATH. Files under `etc/init.d` are executable
too. The build reads their bytes and never executes guest programs on the host.

For Lua programs, use `#!/usr/bin/lua`. For native programs, place a compatible
**32-bit x86 Linux** binary in the same directory. A statically linked binary is
the easiest option. Dynamically linked programs also need their matching loader
and shared libraries under `vm/overlay/lib` or `vm/overlay/usr/lib`. Check the
binary's architecture and license, then exercise it with `npm run test:vm` or in
the browser. Existing Buildroot libraries are not interchangeable with arbitrary
Alpine/Debian libraries.

For a larger package selection, rebuild a compatible Buildroot image with the
required packages or switch the base to a 32-bit Alpine image. Alpine provides
`apk`; the current image does not. Build-time package installation keeps the
public VM disconnected and produces the same toolset for every visitor.
Interactive `apk add` would additionally need a guest network backend and would
only affect that temporary session.

When replacing the base image:

1. Keep serial-console support, devtmpfs, procfs, sysfs, and external initramfs
   enabled. The current overlay expects BusyBox init, getty, su, and /bin/sh.
2. Replace the matching file in `vm/assets/`, and update its source URL and
   SHA-256 in `vm/assets.json`. Do not bypass the checksum check.
3. Update `vm/SOURCES.txt` and retain the upstream licenses and corresponding
   source/build configuration for redistributed packages. For your own Buildroot
   build, use its `make legal-info` output as part of that release process.
4. Run the unit, real-VM, and browser tests. A distro switch needs an adjusted
   init/login setup; changing the binary alone is not sufficient.

Useful upstream references:

- [v86 and supported guests](https://github.com/copy/v86)
- [v86 Alpine image builder](https://github.com/copy/v86/tree/master/tools/docker/alpine)
- [Buildroot manual](https://buildroot.org/downloads/manual/manual.html)

## Customize behavior and content

| Change | Source |
| --- | --- |
| Login message and ASCII art | `vm/overlay/usr/local/bin/welcome` |
| Prompt, aliases, shell defaults | `vm/overlay/home/guest/.shrc`, `vm/overlay/etc/profile` |
| Boot and login behavior | `vm/overlay/etc/inittab`, `vm/overlay/etc/init.d/portfolio` |
| Commands connecting to the browser | `vm/overlay/usr/local/bin/open`, `browse` |
| Project records and guest directory names | `site/_data/catalog.json` and existing project Markdown |
| Biography | `site/_data/profile.json` |
| Selected technical notes | `site/_data/notes.json` and the referenced Markdown |
| Shell help topics | `vm/overlay/usr/local/share/portfolio/` |
| Career | `site/_data/career.json` (résumé history and supplied LinkedIn details) |
| Guest directory layout | `site/_lib/portfolio.cjs` |
| Article formatting for the terminal | `site/_lib/terminal-text.cjs` |
| Browser bridge and URL validation | `site/js/vm-bridge.mjs` |
| Terminal rendering, lifecycle, and memory setting | `site/js/vm-terminal.js`, `scripts/build-vm.cjs` |
| Boot screen, navbar, and Browse view | `site/index.njk`, `site/css/terminal.css` |

The generated portfolio and Browse view share the same content model. Published
articles and old URLs remain available. `/home/guest` contains `projects`,
`about`, `career`, `contact`, `notes`, and `documents`. Linux paths are case-sensitive.

The terminal uses JetBrains Mono, sized at 16px on desktop and 14px on small
screens. To change the site font, update `site/js/vm-terminal.js`, the font styles
in `site/css/terminal.css`, and the preload in `site/_includes/layouts/terminal.njk`.

`open path.url` or `open https://example.com` prints a clickable link in the
terminal and offers the same link in the navbar. Clicking a terminal URL opens
a new browser tab, using the browser connection even while guest networking is
disabled. Plain web URLs and OSC 8 hyperlinks share the URL validation used by
the guest bridge. Opening a tab requires a click; printing guest output alone
does not navigate. New tabs use `noopener,noreferrer`.

`browse` switches to the HTML portfolio. `games` launches the upstream New BSD Games menu.

The initial terminal size is passed in the boot arguments so the welcome banner
fits before login finishes. The ttyS1 serial channel carries numeric rows/columns to a root-owned resize
loop. It never evaluates commands. ttyS0 handles the interactive session, which
supports ordinary terminal applications and signals.

`reboot` asks the browser to restart the VM. Refreshing the page also starts a fresh session.
The command shows a short shutdown log, leaves the terminal blank for 0.75
seconds, then starts the boot sequence, restores the original image, and logs
in as guest. Shutdown closes terminal input and stops the VM; switching views
cannot resume it during shutdown or the blank pause.
All session files are discarded. The guest stays
unprivileged. `/usr/local/bin/reboot` sends a fixed control message through the
serial terminal; it does not invoke the privileged Linux reboot syscall.
`reboot --help` describes this behavior.

## Security boundaries and limitations

The emulator runs on the visitor's device. There is no server shell, shared VM,
SSH service, backend command endpoint, host filesystem mount, or network relay.
Guest shell operations affect that visitor's in-memory Linux filesystem.
A guest account is useful for avoiding accidental system changes, but it is not
the primary isolation boundary; that boundary is v86 plus the browser sandbox.

Every image and overlay file is public. Never include private keys, cloud
credentials, personal files, or build environment secrets. Only the explicit
`vm/overlay` files and generated public portfolio are packaged. The builder does
not copy the repository or environment wholesale.

The guest-to-browser bridge accepts only a view switch, login-stage
signals, a restart of the current VM, and bounded HTTP/HTTPS/mailto links. URL schemes, control characters,
credentials in URLs, and malformed messages are rejected. Guest text is not
inserted as HTML. Links require a click and use `noopener noreferrer`. No
guest clipboard-read/write or arbitrary JS bridge is installed. Browser copy/paste
shortcuts operate only on user gestures. The homepage CSP
limits scripts and connections to this origin and permits the WebAssembly and
local worker needed by v86.

Risks still exist:

- Bugs in v86, xterm.js, WebAssembly, or the browser can weaken isolation. Pin and
  update these dependencies; this is not a guarantee that arbitrary hostile
  software is safe to execute.
- The stock Linux image is an older upstream demo image, not a maintained Linux
  distribution with automated security updates. It is currently disconnected.
  Replace it with a maintained build before enabling broader capabilities.
- Busy loops or excessive output can consume CPU and memory in the visitor's
  tab. Guest RAM and terminal scrollback are bounded; output has backpressure,
  and the VM pauses in Browse or while the document is hidden. This is not a
  strict CPU quota. A visitor can close the tab or restart the session.
- Offering a web/mail link still allows an intentional visitor action to contact
  another site. Validation does not make the destination trustworthy.
- Enabling guest networking would change the threat model. A relay must enforce
  destination restrictions and protect private networks/metadata services; an
  unrestricted public relay can be abused. It is deliberately absent here.

The release preparation upgraded Eleventy, Markdown, and image tooling and
removed the older favicon and lazy-image plugins. `npm audit` reported zero
vulnerabilities after the update. Both CI systems rerun the audit and stop on
moderate or higher findings. See [the release guide](../docs/releasing.md) for
build validation, browser coverage, caching, and rollback. Dependency auditing
does not assess the vendored guest kernel or certify browser isolation.

## Browser compatibility

The bundled v86 scheduler keeps its worker blob URL until the scheduler is
disposed. This avoids a WebKit startup race caused by revoking the URL before
the worker loads. `scripts/build-vm.cjs` applies an exact patch to the pinned
v86 version and fails if an upgrade changes the affected code. Browser checks
cover boot and reboot after opening an external link.

The terminal also invalidates xterm 6.0's cached link targets when output changes
while no link is hovered. This uses pinned-version internals to prevent a click
from opening an older URL at the same screen position. Browser checks click each
public project link in sequence; review this workaround when upgrading xterm.
