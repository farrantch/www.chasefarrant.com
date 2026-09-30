import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { V86 } from 'v86';
import buildVM from '../scripts/build-vm.cjs';
import portfolio from '../site/_lib/portfolio.cjs';

const content = portfolio();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = mkdtempSync(path.join(tmpdir(), 'portfolio-vm-test-'));
const config = buildVM(output);
const file = name => ({ buffer: Uint8Array.from(readFileSync(path.join(output, config.base, name))).buffer });
let transcript = '';
let sequence = 0;
const waitFor = async (pattern, timeout = 30000) => {
  const deadline = Date.now() + timeout;
  while (!pattern.test(transcript)) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${pattern}\n${transcript.slice(-5000)}`);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
};
const vm = new V86({
  wasm_path: path.join(root, 'node_modules/v86/build/v86.wasm'),
  bios: file('seabios.bin'), vga_bios: file('vgabios.bin'), bzimage: file('buildroot-bzimage68.bin'), initrd: file('portfolio.cpio.gz'),
  memory_size: 128 * 1024 * 1024, uart1: true, disable_keyboard: true, autostart: true,
  cmdline: 'console=ttyS0 quiet tsc=reliable mitigations=off random.trust_cpu=on portfolio.size=35x153'
});
vm.add_listener('serial0-output-byte', byte => { transcript += String.fromCharCode(byte); });
const run = async command => {
  transcript = '';
  const tag = `RESULT_${++sequence}`;
  vm.serial0_send(`${command}; printf '\\n%s:%s\\n' '${tag}' "$?"\n`);
  await waitFor(new RegExp(`\r\n${tag}:\\d+\r\n`));
  assert.match(transcript, new RegExp(`${tag}:0`), transcript);
  return transcript;
};
try {
  const started = Date.now();
  await waitFor(/\x1b\]777;ready\x07/, 60000);
  await waitFor(/guest@chasefarrant\.com:~\$/);
  await run('stty -echo');
  await run('test "$(hostname)" = chasefarrant.com && test "$(hostname -f)" = chasefarrant.com');
  assert.match(await run('stty size'), /35 153/);
  assert.match(await run('uname -s; id; pwd'), /Linux[\s\S]*uid=1000\(guest\)[\s\S]*\/home\/guest/);
  assert.match(await run('cat projects/www.chasefarrant.com/readme.txt; cat career/2022_veritone/role.txt'), /chasefarrant.com[\s\S]*Veritone/);
  assert.match(await run("printf 'pear\\napple\\npear\\n' | sort | uniq -c | awk '{print $2 \":\" $1}'"), /apple:1[\s\S]*pear:2/);
  await run("mkdir sandbox; printf '#!/bin/sh\\nprintf SCRIPT_OK\\n' > sandbox/run; chmod +x sandbox/run; sandbox/run | grep SCRIPT_OK");
  await run("cp about/intro.txt sandbox/copy; ln -s copy sandbox/link; cmp sandbox/link about/intro.txt; find sandbox -type f | grep copy");
  await run('grep -ri cloud projects | head -n 3; tree -L 1; vi --help >/dev/null 2>&1; command -v less');
  assert.match(await run('help'), /Navigation[\s\S]*Portfolio[\s\S]*Reference/);
  await run('help > /tmp/help.txt; cmp /tmp/help.txt /usr/local/share/portfolio/help.txt');
  await run('help invalid >/tmp/help-error.txt 2>&1; test "$?" -eq 1 && grep -q Usage /tmp/help-error.txt');
  const narrowHelp = await run('stty cols 40; NO_COLOR=1 help; stty cols 153');
  const helpText = narrowHelp.slice(narrowHelp.indexOf('Navigation'), narrowHelp.indexOf('Command options') + 'Command options'.length);
  assert.match(helpText, /  ls \[path\]\r\n    List directory contents/);
  assert.doesNotMatch(helpText, /\x1b/);
  assert(helpText.split('\r\n').every(line => line.length <= 40), helpText);
  assert.match(await run('cd /tmp; help keys; help session; commands; cd ~'), /Clipboard[\s\S]*No network access[\s\S]*Tools by task/);
  await run('test ! -e readme.txt && test ! -e employment && test ! -e about.txt && test ! -e projects/index.txt && test ! -e notes/index.txt');
  await run('for file in about/readme.txt career/overview.txt contact/readme.txt notes/readme.txt projects/readme.txt; do test ! -e "$file" || exit 1; done');
  await run('test -s about/intro.txt && test -s about/hobbies.txt');
  assert.match(await run('cat about/hobbies.txt'), /skiing[\s\S]*Catch\s+Amy/);
  assert.match(await run('cat /secrets.txt'), /If you want to keep a secret, you must also hide it from yourself\.[\s\S]*George Orwell, 1984/);
  assert.match(await run("cat ~/career/2014_billsoft-eztax-avalara/role.txt"), /BillSoft \/ EZTax \/ Avalara/);
  assert.match(await run("cat ~/career/2017_balanceinnovations-brinks/work.txt"), /Balance Innovations/);
  for (const role of content.career.roles) {
    const directory = `career/${role.directory}/`;
    await run(`test -d ${directory} && test -s ${directory}role.txt && test -s ${directory}work.txt && test -s ${directory}tools.txt && cat ${directory}*.txt >/dev/null`);
  }
  await run('test ! -e career/readme.txt && test ! -e career/avalara.txt && test ! -e career/balance-innovations.txt');
  assert.match(await run('cat notes/2023-02-23_cloudformation/readme.txt'), /Working with CloudFormation/);
  for (const tool of 'ls pwd tree find cp mv rm mkdir ln chmod cat less head tail grep sort uniq wc cut sed awk nano vi joe ed tar gzip gunzip unzip ps top kill sleep uname hostname id date uptime free df du sh lua curl ping wget links'.split(' ')) {
    await run(`command -v ${tool} >/dev/null`);
  }
  assert.match(await run('nano --version; echo $EDITOR'), /GNU nano, version 9\.2[\s\S]*nano/);
  assert.match(await run('mines -h; test "$?" -eq 1'), /mines|Mines|Usage/);
  assert.match(await run('2048 test'), /All 13 tests executed successfully/);
  assert.match(await run('tetris -help'), /vitetris 0\.59\.1/i);
  const gameAssets = JSON.parse(readFileSync(path.join(root, 'vm/assets.json')))
    .filter(asset => /^opt\/[^/]+\/bin\//.test(asset.guestPath || ''));
  assert.equal(gameAssets.length, 25);
  for (const asset of gameAssets) {
    const command = path.posix.basename(asset.guestPath);
    await run(`test "$(command -v ${command})" = /${asset.guestPath} && test -x /${asset.guestPath} && test ! -w /${asset.guestPath}`);
  }
  await run('test -w /var/opt/nbsdgames && test -w /var/opt/vitetris/hiscores && test ! -e games');
  assert.match(await run('help games'), /New BSD Games[\s\S]*2048/);
  const curlVersion = await run('curl --version');
  assert.match(curlVersion, /curl 8\.22\.0[\s\S]*OpenSSL\/3\.5\.8/);
  assert.match(curlVersion, /Protocols:.*\bhttps\b/);
  await run('test -s /etc/ssl/certs/ca-certificates.crt');
  const httpsProbe = await run('curl --proto \"=https\" --connect-timeout 1 https://127.0.0.1:1 2>&1; test \"$?\" -eq 7');
  assert.doesNotMatch(httpsProbe, /unrecognized protocol|not supported/);
  await run('test -s contact/resume.url && test ! -e career/resume.url && test ! -e documents/resume.url');
  assert((await run('open contact/resume.url')).includes(content.resumeURL));
  const resumeHash = createHash('sha256').update(readFileSync(path.join(root, 'site/ChaseFarrant-Resume.pdf'))).digest('hex');
  assert.match(await run('sha256sum documents/ChaseFarrant-Resume.pdf'), new RegExp(resumeHash));
  assert((await run('open ~/documents/ChaseFarrant-Resume.pdf')).includes(content.resumeURL));
  assert((await run('cd documents; open ./ChaseFarrant-Resume.pdf; cd ~')).includes(content.resumeURL));
  assert((await run('ln -s ~/documents/ChaseFarrant-Resume.pdf /tmp/resume.pdf; open /tmp/resume.pdf')).includes(content.resumeURL));
  assert.match(await run('open contact/github.url'), /\x1b\]777;open=/);
  for (const project of content.projects.filter(project => project.repository)) {
    const result = await run(`open projects/${project.slug}/github.url`);
    const message = result.match(/\x1b\]777;open=([^\x07]+)\x07/);
    assert(message, `Browser link for ${project.slug}`);
    assert.equal(Buffer.from(message[1], 'base64').toString(), project.repository);
    assert(result.includes(project.repository));
  }
  const rebootHelp = await run('reboot --help');
  assert.match(rebootHelp, /All session files are discarded/);
  assert.doesNotMatch(rebootHelp, /\x1b\]777;reboot\x07/);
  assert.doesNotMatch(await run('! reboot --invalid'), /\x1b\]777;reboot\x07/);
  assert.match(await run('reboot > /tmp/reboot.log'), /\x1b\]777;reboot\x07/);
  vm.serial_send_bytes(1, new TextEncoder().encode('31 104\n'));
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.match(await run('stty size'), /31 104/);
  transcript = '';
  vm.serial0_send('sleep 30\n');
  await new Promise(resolve => setTimeout(resolve, 100));
  vm.serial0_send('\x03');
  await run('echo INTERRUPT_OK');
  await run("! test -e /home/chase; ! test -w /etc/passwd; test -z \"$(ip route)\"");
  console.log(`Real Linux VM passed: boot, guest identity, content, pipelines, files, scripts, helpers, resize, Ctrl+C, and isolation (${((Date.now() - started) / 1000).toFixed(1)}s).`);
} finally {
  await vm.destroy();
  rmSync(output, { recursive: true, force: true });
}
