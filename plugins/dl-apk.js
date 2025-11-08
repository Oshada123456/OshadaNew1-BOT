// plugins/dl-apk.js
const axios = require("axios");
const path = require("path");
const fs = require("fs");

let malvin;
try {
  // plugin files expected in plugins/ so malvin.js at project root -> ../malvin
  malvin = require("../malvin");
} catch (e) {
  console.error("Failed to require malvin.js - check path. Error:", e);
  // create a noop to avoid crash if malvin isn't available (so require won't throw further)
  malvin = () => {};
}

malvin({
  pattern: "apk",
  alias: ["modapk", "apkdownload"],
  react: '📦',
  desc: "Download APK files using NexOracle API.",
  category: "download",
  use: ".apk <app name>",
  filename: __filename
}, async (conn, mek, m, { from, reply, args }) => {
  try {
    const appName = (args || []).join(" ").trim();
    if (!appName) {
      return await safeReply(conn, from, m, 'Please provide an app name. Example: `.apk whatsapp`', reply);
    }

    // indicate processing (try react or simple text)
    await safeReactOrText(conn, from, m, '⏳');

    const apiUrl = `https://api.nexoracle.com/downloader/apk`;
    const params = {
      apikey: process.env.NEXORACLE_API_KEY || 'free_key@maher_apis', // use env var if set
      q: appName,
    };

    // set timeout and validate status
    const response = await axios.get(apiUrl, { params, timeout: 15000, validateStatus: s => s < 500 });

    if (!response || !response.data) {
      console.error("Empty response from NexOracle", response && response.status);
      return await safeReply(conn, from, m, '❌ Unable to find the APK. API returned empty response.', reply);
    }

    // Support different response shapes
    const result = response.data.result || (response.data.data && response.data.data.result) || null;
    if (!result) {
      console.error("No result field in API response:", response.data);
      return await safeReply(conn, from, m, '❌ Unable to find the APK. No result returned by API.', reply);
    }

    // try common keys for download link and metadata
    const name = result.name || result.title || appName;
    const lastup = result.lastup || result.updated_at || result.last_update || 'Unknown';
    const packageName = result.package || result.pkg || result.package_name || 'unknown';
    const size = result.size || result.file_size || 'unknown';
    const icon = result.icon || result.thumbnail || null;
    const dllink = result.dllink || result.download || (result.downloads && result.downloads[0]) || null;

    if (!dllink) {
      console.error("No download link found in result:", result);
      return await safeReply(conn, from, m, '❌ Download link not found for that app. Try a different name.', reply);
    }

    // send thumbnail + "Downloading..." message if icon exists
    if (icon) {
      try {
        await safeSend(conn, from, { image: { url: icon }, caption: `📦 Downloading ${name}... Please wait.` }, { quoted: mek });
      } catch (e) {
        // ignore thumb send error, continue
        console.warn("Failed to send icon thumbnail:", e && e.message);
      }
    } else {
      await safeReply(conn, from, m, `📦 Downloading ${name}... Please wait.`, reply);
    }

    // download APK (with timeout)
    let apkBuffer;
    try {
      const apkResponse = await axios.get(dllink, { responseType: 'arraybuffer', timeout: 60000, maxContentLength: 200 * 1024 * 1024 });
      if (!apkResponse || !apkResponse.data) throw new Error('Empty APK response');
      apkBuffer = Buffer.from(apkResponse.data, 'binary');
    } catch (e) {
      console.error("Failed to download APK:", e && e.message);
      return await safeReply(conn, from, m, '❌ Failed to download the APK file. The download URL may be invalid or the file is too large.', reply);
    }

    // prepare caption with details
    const message = `📦 *APK DETAILS* 📦\n\n` +
      `🔖 *Name*: ${name}\n` +
      `📅 *Last update*: ${lastup}\n` +
      `📦 *Package*: ${packageName}\n` +
      `📏 *Size*: ${size}\n\n` +
      `> © Powered By Lucky Tech Hub`;

    // send as document
    try {
      await safeSend(conn, from, {
        document: apkBuffer,
        mimetype: 'application/vnd.android.package-archive',
        fileName: `${sanitizeFileName(name)}.apk`,
        caption: message
      }, { quoted: mek });
    } catch (e) {
      console.error("Failed to send APK file via safeSend:", e && e.message);
      // fallback: write to temp file and try to send from file path if connection supports
      try {
        const tmpPath = path.join(__dirname, `../tmp/${Date.now()}_${sanitizeFileName(name)}.apk`);
        fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
        fs.writeFileSync(tmpPath, apkBuffer);
        await safeSend(conn, from, { document: fs.createReadStream(tmpPath), fileName: `${sanitizeFileName(name)}.apk`, mimetype: 'application/vnd.android.package-archive', caption: message }, { quoted: mek });
        // delete temp file after short delay
        setTimeout(() => { try { fs.unlinkSync(tmpPath); } catch (e) {} }, 10_000);
      } catch (e2) {
        console.error("Fallback send (file) also failed:", e2 && e2.message);
        await safeReply(conn, from, m, '❌ Failed to send the APK file to the chat. The file might be too large or the bot cannot send files.', reply);
      }
    }

    // indicate success
    await safeReactOrText(conn, from, m, '✅');
  } catch (error) {
    console.error('Error in dl-apk plugin:', error && (error.stack || error.message || error));
    try { await safeReply(conn, from, m, '❌ Unable to fetch APK details. Please try again later.', reply); } catch(e){}
    try { await safeReactOrText(conn, from, m, '❌'); } catch(e){}
  }
});

/**
 * Helpers
 */

function sanitizeFileName(name = '') {
  return name.replace(/[^a-z0-9_\-\. ]/gi, '_').slice(0, 120);
}

async function safeReply(conn, from, m, text, replyFn) {
  // if plugin passed a reply function, use it
  if (typeof replyFn === 'function') {
    try { await replyFn(text); return; } catch(e){}
  }
  // try conn.sendMessage simple text variant
  try {
    await conn.sendMessage(from, { text });
    return;
  } catch (e) {
    // last resort: log
    console.error("safeReply failed:", e && e.message);
  }
}

async function safeSend(conn, from, payload, options = {}) {
  // try common signature: conn.sendMessage(jid, content, options)
  try {
    if (typeof conn.sendMessage === 'function') {
      return await conn.sendMessage(from, payload, options);
    }
  } catch (e) {
    // try alternate signature: conn.sendMessage(jid, content)
    try {
      return await conn.sendMessage(from, payload);
    } catch (e2) {
      console.warn("conn.sendMessage attempts failed:", e && e.message, e2 && e2.message);
    }
  }

  // try conn.sendFile if exists (some libs)
  try {
    if (typeof conn.sendFile === 'function') {
      // sendFile(jid, file, filename, caption, quoted)
      const doc = payload.document || payload.image || payload.video || payload.audio;
      if (doc) {
        // if doc is buffer, write temp
        if (Buffer.isBuffer(doc)) {
          const tmpPath = path.join(__dirname, `../tmp/${Date.now()}_file`);
          fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
          fs.writeFileSync(tmpPath, doc);
          const filename = payload.fileName || 'file';
          return await conn.sendFile(from, tmpPath, filename, payload.caption || '', options.quoted).finally(() => {   try { fs.unlinkSync(tmpPath); } catch (e) {} });
