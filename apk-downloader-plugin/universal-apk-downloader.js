// universal-apk-downloader.js
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const cheerio = require('cheerio');

async function httpGet(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    },
    redirect: 'follow',
    timeout: 30000
  });
  return res;
}

async function streamToFile(res, destPath) {
  await new Promise((resolve, reject) => {
    const fileStream = fs.createWriteStream(destPath);
    res.body.pipe(fileStream);
    res.body.on('error', reject);
    fileStream.on('finish', resolve);
  });
  return destPath;
}

function isDirectApkUrl(url) {
  try {
    const u = new URL(url);
    return u.pathname.toLowerCase().endsWith('.apk');
  } catch (e) {
    return false;
  }
}

// APKPure helpers
async function findOnApkPure(appName) {
  try {
    const searchUrl = `https://apkpure.com/search?q=${encodeURIComponent(appName)}`;
    const r = await httpGet(searchUrl);
    const html = await r.text();
    const $ = cheerio.load(html);

    // try common selectors
    let link = $('a.dd').first().attr('href') || $('div.search-dl a').first().attr('href');
    if (!link) {
      // fallback: try any anchor with '/store/apps/details' like paths
      link = $('a').filter((i, el) => {
        const href = $(el).attr('href') || '';
        return href.startsWith('/') && href.split('/').length > 2;
      }).first().attr('href');
    }
    if (!link) return null;
    return link.startsWith('http') ? link : `https://apkpure.com${link}`;
  } catch (err) {
    return null;
  }
}

async function getApkDirectFromApkPure(appUrl) {
  try {
    const r = await httpGet(appUrl);
    const html = await r.text();
    const $ = cheerio.load(html);
    // download page link
    const dlRel = $('a.da').first().attr('href') || $('a[href*="/download?"]').first().attr('href');
    const dlPage = dlRel ? (dlRel.startsWith('http') ? dlRel : `https://apkpure.com${dlRel}`) : null;
    if (!dlPage) return null;
    const r2 = await httpGet(dlPage);
    const html2 = await r2.text();
    const match = html2.match(/https?:\/\/download\.apkpure\.com\/b\/[^\"]+/) || html2.match(/https?:\/\/r\d+\.apkpure\.com\/[^\"]+/);
    if (match) return match[0];
    const $2 = cheerio.load(html2);
    const direct = $2('a#download_link').attr('href') || $2('a[href*="download.apkpure.com"]').attr('href');
    if (direct) return direct.startsWith('http') ? direct : `https:${direct}`;
    return null;
  } catch (err) {
    return null;
  }
}

// APKCombo helpers (light)
async function findOnApkCombo(appName) {
  try {
    const searchUrl = `https://apkcombo.com/en/search/?s=${encodeURIComponent(appName)}`;
    const r = await httpGet(searchUrl);
    const html = await r.text();
    const $ = cheerio.load(html);
    const first = $('.search-list a').first().attr('href') || $('a.item-title').first().attr('href');
    if (!first) return null;
    return first.startsWith('http') ? first : `https://apkcombo.com${first}`;
  } catch (err) {
    return null;
  }
}

async function getApkDirectFromApkCombo(appUrl) {
  try {
    const r = await httpGet(appUrl);
    const html = await r.text();
    const $ = cheerio.load(html);
    const direct = $('a[href*="/dl/"]').first().attr('href') || $('a.btn-download').first().attr('href');
    if (!direct) return null;
    return direct.startsWith('http') ? direct : `https://apkcombo.com${direct}`;
  } catch (err) {
    return null;
  }
}

// master function
async function downloadAnyApk({ queryOrUrl, filename, folder = './downloads' }) {
  if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });

  if (isDirectApkUrl(queryOrUrl)) {
    const url = queryOrUrl;
    const name = filename || path.basename(new URL(url).pathname);
    const savePath = path.join(folder, name);
    const res = await httpGet(url);
    if (!res.ok) throw new Error(`Failed to download direct APK: ${res.status}`);
    await streamToFile(res, savePath);
    return { source: 'direct', savedTo: savePath, url };
  }

  const appName = queryOrUrl.trim();
  const sources = [
    async () => {
      const appUrl = await findOnApkPure(appName);
      if (!appUrl) return null;
      const apkUrl = await getApkDirectFromApkPure(appUrl);
      return apkUrl ? { apkUrl, sourcePage: appUrl, sourceName: 'apkpure' } : null;
    },
    async () => {
      const appUrl = await findOnApkCombo(appName);
      if (!appUrl) return null;
      const apkUrl = await getApkDirectFromApkCombo(appUrl);
      return apkUrl ? { apkUrl, sourcePage: appUrl, sourceName: 'apkcombo' } : null;
    }
  ];

  let found = null;
  for (const attempt of sources) {
    try {
      const res = await attempt();
      if (res && res.apkUrl) { found = res; break; }
    } catch (e) { /* ignore and continue */ }
  }

  
  if (!apkLink) {
  console.log("No APK link found, trying next source...");
  continue;
}

  if (!found) throw new Error('Unable to find APK link from sources');

  const finalUrl = found.apkUrl;
  const suggestedName = filename || `${appName.replace(/\s+/g, '_')}.apk`;
  const savePath = path.join(folder, suggestedName);

  const r = await httpGet(finalUrl);
  if (!r.ok) throw new Error(`Failed to download APK from ${finalUrl}: ${r.status}`);
  await streamToFile(r, savePath);

  return { source: found.sourceName || 'unknown', sourcePage: found.sourcePage, apkUrl: finalUrl, savedTo: savePath };
}

module.exports = { downloadAnyApk };

