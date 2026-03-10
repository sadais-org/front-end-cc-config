#!/usr/bin/env node
/**
 * Universal Web Scraper
 *
 * Usage:
 *   node scrape.mjs <url> [options]
 *
 * Options:
 *   --wait <ms>          SPA 模式等待时间（默认 8000ms）
 *   --intercept          拦截并输出所有 API 请求（JSON 格式）
 *   --output <file>      保存结果到文件（默认输出到 stdout）
 *   --force-spa          强制走 SPA 流程（跳过检测）
 *   --force-curl         强制走 curl 流程（跳过检测）
 *   --selector <css>     SPA 模式：等待指定元素出现后再提取
 *   --user-agent <ua>    自定义 User-Agent
 */

import { execSync, exec } from 'child_process';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { promisify } from 'util';
import { tmpdir, platform } from 'os';
import { join } from 'path';

const execAsync = promisify(exec);

// ─── 参数解析 ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const url = args[0];

if (!url || url.startsWith('--')) {
  console.error('Usage: node scrape.mjs <url> [--wait <ms>] [--intercept] [--output <file>] [--force-spa] [--force-curl]');
  process.exit(1);
}

const opts = {
  wait: parseInt(getArg('--wait') || '8000'),
  intercept: args.includes('--intercept'),
  output: getArg('--output'),
  forceSpa: args.includes('--force-spa'),
  forceCurl: args.includes('--force-curl'),
  selector: getArg('--selector'),
  userAgent: getArg('--user-agent') || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
};

function getArg(name) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

// ─── SPA 检测 ────────────────────────────────────────────────────────────────
const SPA_PATTERNS = [
  /<div[^>]+id=["'](root|app|main|__next|__nuxt)["']\s*>(\s*)<\/div>/i,
  /<div[^>]+id=["'](root|app)["'][^>]*>\s*<\/div>/i,
  /window\.__INITIAL_STATE__/,
  /window\.__REDUX_STATE__/,
];

function detectSpa(html) {
  if (!html || html.length < 200) return true;

  // 提取 body 中的纯文字
  const bodyText = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 文字极短说明是空壳
  if (bodyText.length < 300) return true;

  // 匹配 SPA 空 root div 模式
  if (SPA_PATTERNS.some(p => p.test(html))) return true;

  // script 标签占比高
  const scriptMatches = html.match(/<script/gi) || [];
  if (scriptMatches.length > 10 && bodyText.length < 1000) return true;

  return false;
}

// ─── curl 流程 ───────────────────────────────────────────────────────────────
async function curlFetch(targetUrl) {
  console.error('[web-scraper] 模式：curl（普通页面）');
  const { stdout } = await execAsync(
    `curl -s -L -A "${opts.userAgent}" --max-time 30 "${targetUrl}"`,
    { maxBuffer: 10 * 1024 * 1024 }
  );

  // 提取纯文字
  const text = stdout
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, '\n')
    .trim();

  // 提取 title
  const titleMatch = stdout.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';

  // 提取链接
  const links = [];
  const linkRe = /<a[^>]+href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = linkRe.exec(stdout)) !== null) {
    const href = m[1].startsWith('http') ? m[1] : new URL(m[1], targetUrl).href;
    const linkText = m[2].replace(/<[^>]+>/g, '').trim();
    if (linkText) links.push({ href, text: linkText });
  }

  return { mode: 'curl', url: targetUrl, title, text, links: links.slice(0, 50), html: stdout };
}

// ─── 查找可用浏览器 ───────────────────────────────────────────────────────────
function findBrowser() {
  const isWin = platform() === 'win32';

  if (isWin) {
    // 1. 查注册表（覆盖自定义安装位置）
    const regKeys = [
      'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe',
      'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe',
      'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe',
      'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe',
    ];
    for (const key of regKeys) {
      try {
        const out = execSync(`reg query "${key}" /ve`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
        const match = out.match(/REG_SZ\s+(.+)/);
        if (match) {
          const p = match[1].trim();
          if (existsSync(p)) return p;
        }
      } catch {}
    }

    // 2. where 命令（PATH 中的浏览器）
    for (const bin of ['msedge', 'chrome', 'chromium']) {
      try {
        const p = execSync(`where ${bin}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).split('\n')[0].trim();
        if (p && existsSync(p)) return p;
      } catch {}
    }

    // 3. 回退：标准安装路径
    const pf = process.env.ProgramFiles || '';
    const pf86 = process.env['ProgramFiles(x86)'] || '';
    const localAppData = process.env.LOCALAPPDATA || '';
    for (const p of [
      join(pf86, 'Microsoft\\Edge\\Application\\msedge.exe'),
      join(pf, 'Microsoft\\Edge\\Application\\msedge.exe'),
      join(pf, 'Google\\Chrome\\Application\\chrome.exe'),
      join(pf86, 'Google\\Chrome\\Application\\chrome.exe'),
      join(localAppData, 'Google\\Chrome\\Application\\chrome.exe'),
      join(localAppData, 'Chromium\\Application\\chrome.exe'),
    ]) {
      if (p && existsSync(p)) return p;
    }
  } else {
    // 1. which 命令（PATH 中的浏览器，覆盖非标准安装）
    for (const bin of ['google-chrome', 'chromium-browser', 'chromium']) {
      try {
        const p = execSync(`which ${bin}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
        if (p && existsSync(p)) return p;
      } catch {}
    }

    // 2. 回退：标准安装路径
    for (const p of [
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/google-chrome',
    ]) {
      if (existsSync(p)) return p;
    }
  }

  return null;
}

// ─── puppeteer 流程 ───────────────────────────────────────────────────────────
async function puppeteerFetch(targetUrl) {
  console.error('[web-scraper] 模式：puppeteer（SPA 页面）');

  // 动态 import puppeteer（避免未安装时报错）
  let puppeteer;
  try {
    puppeteer = (await import('puppeteer-core')).default;
  } catch {
    try {
      const pkgPath = join(PUPPETEER_DIR, 'node_modules', 'puppeteer-core', 'index.js');
      puppeteer = (await import(`file://${pkgPath}`)).default;
    } catch {
      throw new Error(`puppeteer-core 未安装，请先运行：\n  cd "${PUPPETEER_DIR}" && npm install puppeteer-core`);
    }
  }

  const browserPath = findBrowser();
  if (!browserPath) {
    throw new Error('未找到可用浏览器（Edge/Chrome/Chromium），请安装后重试');
  }
  console.error(`[web-scraper] 使用浏览器：${browserPath}`);

  const isWin = platform() === 'win32';
  const browser = await puppeteer.launch({
    executablePath: browserPath,
    headless: true,
    args: [
      '--no-sandbox',
      ...(!isWin ? ['--disable-setuid-sandbox', '--disable-dev-shm-usage'] : []),
    ],
    timeout: 60000,
  });

  const page = await browser.newPage();
  await page.setUserAgent(opts.userAgent);
  await page.setViewport({ width: 1440, height: 900 });

  const intercepted = [];
  if (opts.intercept) {
    page.on('response', async (res) => {
      const resUrl = res.url();
      const ct = res.headers()['content-type'] || '';
      if (ct.includes('json')) {
        try {
          const json = await res.json();
          intercepted.push({ url: resUrl, data: json });
        } catch {}
      }
    });
  }

  await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 45000 });

  if (opts.selector) {
    try {
      await page.waitForSelector(opts.selector, { timeout: 10000 });
    } catch {}
  }

  await new Promise(r => setTimeout(r, opts.wait));

  const result = await page.evaluate(() => ({
    title: document.title,
    url: window.location.href,
    text: document.body.innerText || '',
    links: Array.from(document.querySelectorAll('a[href]'))
      .map(a => ({ href: a.href, text: (a.innerText || '').trim() }))
      .filter(l => l.text && l.href.startsWith('http'))
      .slice(0, 50),
  }));

  await browser.close();
  return { mode: 'puppeteer', ...result, intercepted: opts.intercept ? intercepted : undefined };
}

// ─── 安装 puppeteer-core（若未安装）─────────────────────────────────────────
const PUPPETEER_DIR = join(tmpdir(), 'web-scraper-deps');

async function ensurePuppeteer() {
  try {
    await import('puppeteer-core');
    return true;
  } catch {
    if (existsSync(join(PUPPETEER_DIR, 'node_modules', 'puppeteer-core'))) {
      return true;
    }
    console.error('[web-scraper] 正在安装 puppeteer-core...');
    mkdirSync(PUPPETEER_DIR, { recursive: true });
    execSync('npm install puppeteer-core --silent', { cwd: PUPPETEER_DIR, stdio: 'inherit' });
    return true;
  }
}

// ─── 主流程 ──────────────────────────────────────────────────────────────────
(async () => {
  try {
    let result;

    if (opts.forceCurl) {
      result = await curlFetch(url);
    } else if (opts.forceSpa) {
      await ensurePuppeteer();
      result = await puppeteerFetch(url);
    } else {
      // 自动检测：先用 curl 探测
      console.error('[web-scraper] 正在探测页面类型...');
      let html = '';
      try {
        const { stdout } = await execAsync(
          `curl -s -L -A "${opts.userAgent}" --max-time 15 "${url}"`,
          { maxBuffer: 5 * 1024 * 1024 }
        );
        html = stdout;
      } catch {}

      const isSpa = detectSpa(html);
      console.error(`[web-scraper] 检测结果：${isSpa ? 'SPA（动态渲染）' : '普通页面（静态内容）'}`);

      if (isSpa) {
        await ensurePuppeteer();
        result = await puppeteerFetch(url);
      } else {
        // curl 结果直接处理（避免重复请求）
        const text = html
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
          .replace(/\s+/g, '\n').trim();
        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
        const links = [];
        const linkRe = /<a[^>]+href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let m;
        while ((m = linkRe.exec(html)) !== null) {
          try {
            const href = m[1].startsWith('http') ? m[1] : new URL(m[1], url).href;
            const linkText = m[2].replace(/<[^>]+>/g, '').trim();
            if (linkText) links.push({ href, text: linkText });
          } catch {}
        }
        result = { mode: 'curl', url, title, text, links: links.slice(0, 50) };
      }
    }

    const output = JSON.stringify(result, null, 2);
    if (opts.output) {
      writeFileSync(opts.output, output, 'utf-8');
      console.error(`[web-scraper] 结果已保存：${opts.output}`);
    } else {
      process.stdout.write(output);
    }
  } catch (err) {
    console.error(`[web-scraper] 错误：${err.message}`);
    process.exit(1);
  }
})();
