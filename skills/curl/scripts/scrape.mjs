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
import { writeFileSync, existsSync } from 'fs';
import { promisify } from 'util';

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
  const candidates = [
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
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
      puppeteer = (await import('file:///tmp/web-scraper-deps/node_modules/puppeteer-core/index.js')).default;
    } catch {
      throw new Error('puppeteer-core 未安装，请先运行：\n  cd /tmp/web-scraper-deps && npm install puppeteer-core');
    }
  }

  const browserPath = findBrowser();
  if (!browserPath) {
    throw new Error('未找到可用浏览器（Edge/Chrome/Chromium），请安装后重试');
  }
  console.error(`[web-scraper] 使用浏览器：${browserPath}`);

  const browser = await puppeteer.launch({
    executablePath: browserPath,
    headless: 'shell',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
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
async function ensurePuppeteer() {
  try {
    await import('puppeteer-core');
    return true;
  } catch {
    const tmpDir = '/tmp/web-scraper-deps';
    if (existsSync(`${tmpDir}/node_modules/puppeteer-core`)) {
      return true;
    }
    console.error('[web-scraper] 正在安装 puppeteer-core...');
    execSync(`mkdir -p ${tmpDir} && cd ${tmpDir} && npm install puppeteer-core --silent 2>/dev/null`, { stdio: 'inherit' });
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
