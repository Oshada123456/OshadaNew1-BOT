const { cmd } = require("../command");
const ytdl = require("@distube/ytdl-core");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { promisify } = require("util");
const { pipeline } = require("stream");
const pump = promisify(pipeline);const ytdl = require("@distube/ytdl-core");
const fs = require("fs");
const cookies = fs.existsSync("youtube_cookies.txt") ? { cookies: fs.readFileSync("youtube_cookies.txt", "utf8") } : {};


ffmpeg.setFfmpegPath(ffmpegPath);

// temp file name generator
function tmpName(prefix = "yt") {
  return path.join(os.tmpdir(), `${prefix}_${Date.now()}_${Math.floor(Math.random()*10000)}`);
}

// auto cleanup
function cleanup(files = []) {
  for (const f of files) {
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
  }
}

// ---------- SONG DOWNLOAD COMMAND ----------
cmd({
  pattern: "ytsong",
  react: "🎵",
  desc: "Download YouTube song as MP3",
  category: "download",
  filename: __filename
}, async (danuwa, mek, m, { from, q, reply }) => {
  if (!q) return reply("❌ *Please provide a YouTube link.*");
  const url = q.trim();
  if (!ytdl.validateURL(url)) return reply("❌ *Invalid YouTube URL!*");

  try {
    reply("⏳ *Downloading audio...*");
    const info = await ytdl.getInfo(url, cookies);
    const audioFormat = ytdl.filterFormats(info.formats, "audioonly").sort((a,b)=> (b.audioBitrate||0)-(a.audioBitrate||0))[0];
    const title = info.videoDetails.title.replace(/[\\\/\?%*:|"<>]/g, "_").slice(0, 80);
    const outPath = tmpName("song") + ".mp3";

    const stream = ytdl.downloadFromInfo(info, { format: audioFormat });
    await new Promise((resolve, reject) => {
      ffmpeg(stream).audioBitrate(192).format("mp3").save(outPath)
      .on("end", resolve).on("error", reject);
    });

    const stats = fs.statSync(outPath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    await danuwa.sendMessage(from, {
      document: fs.createReadStream(outPath),
      mimetype: "audio/mpeg",
      fileName: `${title}.mp3`,
      caption: `🎵 *${info.videoDetails.title}*\n💾 *Size:* ${sizeMB} MB`
    }, { quoted: mek });

    reply("✅ *Song sent!*");
    cleanup([outPath]);
  } catch (err) {
    console.error(err);
    reply(`❌ *Error:* ${err.message}`);
  }
});

// ---------- VIDEO DOWNLOAD COMMAND ----------
cmd({
  pattern: "ytvideo",
  react: "🎬",
  desc: "Download YouTube video",
  category: "download",
  filename: __filename
}, async (danuwa, mek, m, { from, q, reply }) => {
  if (!q) return reply("❌ *Please provide a YouTube link and quality.*\nExample: .ytvideo https://youtu.be/xyz 720");
  const [url, qualityArg] = q.trim().split(/\s+/);
  const quality = qualityArg || "720";
  if (!ytdl.validateURL(url)) return reply("❌ *Invalid YouTube URL!*");

  try {
    reply("⏳ *Fetching video info...*");
    const info = await ytdl.getInfo(url);
    const title = info.videoDetails.title.replace(/[\\\/\?%*:|"<>]/g, "_").slice(0, 80);
    const tmpBase = tmpName("video");

    const targetMap = { "360": 360, "720": 720, "1080": 1080 };
    const targetHeight = targetMap[quality] || 720;

    const formats = info.formats.filter(f => f.container === "mp4" && f.hasVideo);
    const best = formats.sort((a,b)=>(b.height||0)-(a.height||0))
                        .find(f => (f.height||0) <= targetHeight) || formats[0];

    const outPath = tmpBase + ".mp4";
    await pump(ytdl.downloadFromInfo(info, { format: best }), fs.createWriteStream(outPath));

    const stats = fs.statSync(outPath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    await danuwa.sendMessage(from, {
      video: fs.createReadStream(outPath),
      caption: `🎬 *${info.videoDetails.title}*\n📺 *Quality:* ${best.qualityLabel}\n💾 *Size:* ${sizeMB} MB`
    }, { quoted: mek });

    reply("✅ *Video sent!*");
    cleanup([outPath]);
  } catch (err) {
    console.error(err);
    reply(`❌ *Error:* ${err.message}`);
  }
});

