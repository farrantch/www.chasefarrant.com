const path = require('node:path');
const { spawn } = require('node:child_process');
(async () => {
  let server;
  try {
    let url = process.env.TERMINAL_URL;
    if (!url) {
      server = require('./preview.cjs')(path.resolve(__dirname, '../site/_site'));
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      url = `http://127.0.0.1:${server.address().port}`;
    }
    await require('./check-hosted.cjs')(url);
    const script = process.argv.includes('--smoke') ? 'browsers.smoke.cjs' : 'terminal.browser.cjs';
    const child = spawn(process.execPath, [path.resolve(__dirname, '../tests', script)], { stdio: 'inherit', env: { ...process.env, TERMINAL_URL: url } });
    const stop = () => child.kill('SIGTERM');
    process.once('SIGTERM', stop); process.once('SIGINT', stop);
    const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', (code, signal) => resolve(signal ? 1 : code)); });
    process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop);
    if (code !== 0) throw new Error(`${script} exited with ${code}`);
  } finally { if (server) await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
