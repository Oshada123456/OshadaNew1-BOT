const { cmd, commands } = require("../command");
const ytdl = require("ytdl-core");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { pipeline } = require("stream");
const { promisify } = require("util");
const pump = promisify(pipeline);

ffmpeg.setFfmpegPath(ffmpegPath);

function tmpName(prefix = "ytdl2") {
  return path.join(os.tmpdir(), `${prefix}_${Date.now()}_${Math.floor(Math.random()*10000)}`);
}

async function withRetry(fn, { retries = 2, delay = 1000 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < retries) await new Promise(res => setTimeout(res, delay * (i+1)));
    }
  }
  throw lastErr;
}

cmd(
  {
    pattern: "ytdl2",
    react: "⬇️",
    desc: "YouTube downloader with file size display (.ytdl2 <url> <360|720|1080|audio>)",
    category: "download",
    filename: __filename,
  },
  async (danuwa, mek, m, { from, q, reply }) => {
    const cleanupFiles = [];
    const cleanup = () => cleanupFiles.forEach(f => { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {} });

    try {
      if (!q) return reply("❌ *Provide a YouTube URL and quality.*\nExample: .ytdl2 https://youtu.be/XYZ 720");

      const [url, qualityArgRaw] = q.trim().split(/\s+/);
      const qualityArg = (qualityArgRaw || "720").toLowerCase();
      if (!ytdl.validateURL(url)) return reply("❌ *Invalid YouTube URL.*");

      reply("⏳ *Preparing download...*");
      const info = await withRetry(() => ytdl.getInfo(url));
      const titleSafe = info.videoDetails.title.replace(/[\\\/\?%\\*:|"<>]/g, "_").slice(0, 100);
      const tmpBase = tmpName(titleSafe);

      if (qualityArg === "audio" || qualityArg === "mp3") {
        const audioFmt = ytdl.filterFormats(info.formats, "audioonly").sort((a,b)=> (b.audioBitrate||0)-(a.audioBitrate||0))[0];
        if (!audioFmt) throw new Error("No audio format available for this video.");
        const outPath = tmpBase + ".mp3";
        const audioStream = ytdl.downloadFromInfo(info, { format: audioFmt });
        await new Promise((res, rej) => ffmpeg(audioStream).audioBitrate(192).format("mp3").save(outPath).on("end", res).on("error", rej));
        const sizeMB = (fs.statSync(outPath).size / (1024 * 1024)).toFixed(2);
        await danuwa.sendMessage(from, { document: fs.createReadStream(outPath), mimetype: "audio/mpeg", fileName: `${titleSafe}.mp3`, caption: `🎵 ${info.videoDetails.title}\n💾 *File Size:* ${sizeMB} MB` }, { quoted: mek });
        reply(`✅ *Audio sent!* (💾 ${sizeMB} MB)`); cleanup(); return;
      }

      const targetMap = { "360": 360, "720": 720, "1080": 1080 };
      const targetHeight = targetMap[qualityArg] || 720;
      const videoFormats = info.formats.filter(f => f.container === "mp4" && f.hasVideo && !f.hasAudio);
      const sorted = videoFormats.sort((a,b)=> (b.height||0)-(a.height||0));
      const vidFmt = sorted.find(f => (f.height||0) <= targetHeight) || sorted[0];

      // fallback to progressive mp4 (contains audio) if no separate video-only available
      let progressiveFmt;
      if (!vidFmt) {
        progressiveFmt = info.formats.filter(f => f.container === "mp4" && f.hasVideo && f.hasAudio).sort((a,b)=> (b.contentLength||0)-(a.contentLength||0))[0];
        if (!progressiveFmt) throw new Error("No suitable MP4 format available to download.");
      }

      // If progressive matches or separate not available, download progressive directly
      if (progressiveFmt && (!vidFmt || progressiveFmt.qualityLabel === (vidFmt && vidFmt.qualityLabel))) {
        const outPath = tmpBase + ".mp4";
        cleanupFiles.push(outPath);
        reply(`⏳ *Downloading progressive MP4 (${progressiveFmt.qualityLabel || 'selected'})...*`);
        await withRetry(() => pump(ytdl.downloadFromInfo(info, { format: progressiveFmt }), fs.createWriteStream(outPath)), { retries: 2, delay: 1200 });
        const sizeMB = (fs.statSync(outPath).size / (1024 * 1024)).toFixed(2);
        await danuwa.sendMessage(from, { video: fs.createReadStream(outPath), caption: `🎬 ${info.videoDetails.title}\n📺 *Quality:* ${progressiveFmt.qualityLabel}\n💾 *File Size:* ${sizeMB} MB` }, { quoted: mek });
        reply(`✅ *Video sent!* (💾 ${sizeMB} MB)`); cleanup(); return;
      }

      const audioFmt = ytdl.filterFormats(info.formats, "audioonly").sort((a,b)=> (b.audioBitrate||0)-(a.audioBitrate||0))[0];
      if (!vidFmt || !audioFmt) throw new Error("Video/audio format not found");

      const videoPath = tmpBase + ".video.mp4", audioPath = tmpBase + ".audio.mp3", outPath = tmpBase + ".mp4";
      cleanupFiles.push(videoPath, audioPath, outPath);

      reply(`⏳ *Downloading ${vidFmt.qualityLabel || vidFmt.height+'p'}...*`);
      await pump(ytdl.downloadFromInfo(info, { format: vidFmt }), fs.createWriteStream(videoPath));
      await pump(ytdl.downloadFromInfo(info, { format: audioFmt }), fs.createWriteStream(audioPath));
      await new Promise((res, rej) => ffmpeg().input(videoPath).input(audioPath).outputOptions(["-c:v copy","-c:a aac"]).save(outPath).on("end", res).on("error", rej));
      const sizeMB = (fs.statSync(outPath).size / (1024 * 1024)).toFixed(2);
      await danuwa.sendMessage(from, { video: fs.createReadStream(outPath), caption: `🎬 ${info.videoDetails.title}\n📺 *Quality:* ${vidFmt.qualityLabel}\n💾 *File Size:* ${sizeMB} MB` }, { quoted: mek });
      reply(`✅ *Video sent!* (💾 ${sizeMB} MB)`); cleanup();
    } catch (err) {
      console.error("ytdl2 error:", err);
      // user friendly fallback
      const msg = err && err.statusCode ? `HTTP ${err.statusCode}` : (err && err.message ? err.message : String(err));
      if (err && (err.statusCode === 410 || msg.includes('410'))) {
        reply("⚠️ *YouTube responded 410 Gone — the video may have been removed, private, or region-blocked.*");
      } else if (err && (err.statusCode === 403 || msg.includes('403'))) {
        reply("⚠️ *Request blocked (403). YouTube may be restricting access from the current environment.*");
      } else if (err && (err.statusCode === 404 || msg.includes('404'))) {
        reply("⚠️ *Video not found (404). Check the link or whether the video is deleted.*");
      } else {
        reply(`❌ *Download failed:* ${msg}`);
      }
      cleanup();
    }
  }
);
