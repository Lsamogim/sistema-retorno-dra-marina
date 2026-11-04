import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const REMOTE_URL_FILE = path.join(DATA_DIR, 'remote-url.txt');

const CLOUDFLARED_PATHS = [
  'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
  'C:\\Program Files\\cloudflared\\cloudflared.exe',
  'cloudflared',
];

function findCloudflared() {
  for (const p of CLOUDFLARED_PATHS) {
    if (p === 'cloudflared' || fs.existsSync(p)) return p;
  }
  return 'cloudflared';
}

function getLocalWifiUrls(port = 3456) {
  const nets = os.networkInterfaces();
  const urls = [];
  for (const list of Object.values(nets)) {
    if (!list) continue;
    for (const net of list) {
      if (net.family === 'IPv4' && !net.internal) {
        urls.push(`http://${net.address}:${port}`);
      }
    }
  }
  return urls;
}

async function isServerRunning() {
  try {
    const res = await fetch('http://127.0.0.1:3456/api/health');
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  console.log('======================================================================');
  console.log('  SERVIDOR CENTRAL DRA. MARINA CARBONERA (ACESSO REMOTO + LOGIN)');
  console.log('======================================================================\n');

  // Evitar suspensão automática enquanto conectado na tomada
  try {
    execSync('powercfg /change standby-timeout-ac 0', { stdio: 'ignore' });
    console.log('[Energia] Suspensão automática na tomada desativada para manter o servidor online.');
  } catch {
    // ignore
  }

  const running = await isServerRunning();
  if (!running) {
    console.log('[1/2] Iniciando servidor de banco de dados na porta 3456...');
    const srv = spawn(process.execPath, [path.join(__dirname, 'index.js')], {
      cwd: ROOT_DIR,
      stdio: 'inherit',
    });
    srv.on('error', (err) => console.error('[Erro Servidor]', err.message));
    await new Promise((r) => setTimeout(r, 1800));
  } else {
    console.log('[1/2] Servidor central já está ativo na porta 3456.');
  }

  const wifiUrls = getLocalWifiUrls(3456);
  if (wifiUrls.length > 0) {
    console.log(`\n-> Acesso na mesma rede Wi-Fi: ${wifiUrls.join('  ou  ')}`);
  }

  console.log('\n[2/2] Iniciando túnel HTTPS seguro para acesso de qualquer lugar (4G/5G/Casa)...\n');

  const bin = findCloudflared();
  const tunnel = spawn(bin, ['tunnel', '--url', 'http://127.0.0.1:3456'], {
    cwd: ROOT_DIR,
  });

  let foundUrl = false;
  const handleChunk = (data) => {
    const text = data.toString('utf8');
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (match && !foundUrl) {
      foundUrl = true;
      const url = match[0];
      try {
        fs.writeFileSync(REMOTE_URL_FILE, url, 'utf8');
      } catch {
        // ignore
      }
      console.log('======================================================================');
      console.log('  LINK PRONTO PARA ACESSAR DE QUALQUER CELULAR OU PC:');
      console.log(`  >>>  ${url}  <<<`);
      console.log('----------------------------------------------------------------------');
      console.log('  Login padrão:  dramarina');
      console.log('  Senha padrão:  clinica2026  (pode alterar nas Configurações)');
      console.log('======================================================================\n');
    }
  };

  tunnel.stdout.on('data', handleChunk);
  tunnel.stderr.on('data', handleChunk);
}

main();
