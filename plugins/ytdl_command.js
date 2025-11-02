const { cmd, commands } = require("../command");
const ytdl = require("ytdl-core");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { pipeline } = require("stream");
const { promisify } = require("util");
const pump = promisify(pipeline);

ffmpeg.setFfmpegPath(ffmpegPath);

function uniqName(prefix = "ytdl") {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

cmd(
  {
    pattern: "yt",
    react: "⬇️",
    desc: "Download YouTube video or audio. Usage: .ytdl <url> [360|720|1080|audio]",
    category: "download",
    filename: __filename,
  },
  async (
    danuwa,
    mek,
    m,
    {
      from,
      q,
      reply,
    }
  ) => {
    try {
      if (!q) return reply("❌ *Please provide a YouTube video URL.*\nExample: .ytdl https://youtu.be/XYZ 720");

      const parts = q.trim().split(/\s+/);
      const url = parts[0];
      const quality = (parts[1] || "720").toString().toLowerCase(); // '360', '720', '1080', or 'audio'

      if (!ytdl.validateURL(url)) return reply("❌ *Invalid YouTube URL.*");

      reply("⏳ *Fetching video info...*");

      const info = await ytdl.getInfo(url);
      const titleSafe = info.videoDetails.title.replace(/[\\\/\?%\*:|"<>]/g, "_").slice(0, 120);
      const tmpDir = os.tmpdir();
      const baseName = uniqName(titleSafe);
      
      // AUDIO ONLY flow
      if (quality === 'audio' || quality === 'mp3') {
        const outPath = path.join(tmpDir, `${baseName}.mp3`);
        const audioFormat = ytdl.filterFormats(info.formats, 'audioonly').find(f => f.audioBitrate) || ytdl.filterFormats(info.formats, 'audioonly')[0];
        const audioStream = ytdl.downloadFromInfo(info, { format: audioFormat });

        await new Promise((resolve, reject) => {
          ffmpeg(audioStream)
            .audioBitrate(192)
            .format('mp3')
            .save(outPath)
            .on('end', resolve)
            .on('error', reject);
        });

        // send file
        await danuwa.sendMessage(from, { document: fs.createReadStream(outPath), mimetype: 'audio/mpeg', fileName: `${titleSafe}.mp3`, caption: `🎵 ${info.videoDetails.title}` }, { quoted: mek });
        fs.unlinkSync(outPath);
        return reply('✅ *Audio (MP3) sent!*');
      }

      // VIDEO flow: try to pick best available for requested quality
      const targetRes = quality === '1080' ? '1080p' : quality === '720' ? '720p' : '360p';
      // Find video-only format matching resolution and mp4
      const videoFormats = info.formats.filter(f => f.mimeType && f.mimeType.includes('video') && f.container === 'mp4' && f.hasVideo && !f.hasAudio);
      // Prefer exact resolution, otherwise pick highest <= requested, otherwise highest available
      function chooseVideoFmt(resWanted) {
        // try exact
        let exact = videoFormats.find(f => String(f.qualityLabel) === resWanted);
        if (exact) return exact;
        // try approximate by height
        const wantedNum = parseInt(resWanted);
        // sort by descending height
        const byHeight = videoFormats.slice().sort((a,b)=> (b.height||0)-(a.height||0));
        // pick first <= wantedNum if exists
        for (let f of byHeight) {
          if ((f.height||0) <= wantedNum) return f;
        }
        // fallback to highest
        return byHeight[0];
      }

      const vidFmt = chooseVideoFmt(parseInt(targetRes));
      const audioFmt = ytdl.filterFormats(info.formats, 'audioonly').sort((a,b)=> (b.bitrate||0)-(a.bitrate||0))[0];

      if (!vidFmt) {
        // try full formats that contain both audio+video
        const progressive = info.formats.filter(f=> f.container==='mp4' && f.hasVideo && f.hasAudio).sort((a,b)=>(b.contentLength||0)-(a.contentLength||0))[0];
        if (!progressive) return reply('❌ *No suitable video format found for this video.*');
        // send progressive directly
        reply('⏳ *Downloading progressive mp4...*');
        const outPath = path.join(tmpDir, `${baseName}.mp4`);
        const stream = ytdl.downloadFromInfo(info, { format: progressive });
        await pump(stream, fs.createWriteStream(outPath));
        await danuwa.sendMessage(from, { video: fs.createReadStream(outPath), caption: `🎬 ${info.videoDetails.title}` }, { quoted: mek });
        fs.unlinkSync(outPath);
        return reply('✅ *Video sent!*');
      }

      // If we have separate video and audio, merge with ffmpeg
      const outPath = path.join(tmpDir, `${baseName}.mp4`);

      reply(`⏳ *Downloading video (${vidFmt.qualityLabel || 'selected'}) and best audio, then merging...*`);

      const videoStream = ytdl.downloadFromInfo(info, { format: vidFmt });
      const audioStream2 = ytdl.downloadFromInfo(info, { format: audioFmt });

      await new Promise((resolve, reject) => {
        const ff = ffmpeg();
        ff.input(videoStream).inputOptions(['-re']);
        ff.input(audioStream2).inputOptions(['-re']);
        ff.outputOptions(['-c:v copy', '-c:a aac', '-strict -2']);
        ff.save(outPath).on('end', resolve).on('error', reject);
      });

      // send final file
      await danuwa.sendMessage(from, { video: fs.createReadStream(outPath), caption: `🎬 ${info.videoDetails.title} (${targetRes})` }, { quoted: mek });

      // cleanup
      fs.unlinkSync(outPath);
      return reply('✅ *Video sent!*');

    } catch (e) {
      console.error(e);
      reply(`❌ *Error:* ${e.message}`);
    }
  }
);
