const { cmd } = require("../command");
const ytdl = require("@distube/ytdl-core");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { promisify } = require("util");
const { pipeline } = require("stream");
const cookies = fs.existsSync("youtube_cookies.txt") ? { cookies: fs.readFileSync("youtube_cookies.txt", "utf8") } : {};
const yts = require("yt-search");
const { ytmp3 } = require("@vreden/youtube_scraper");

cmd(
  {
    pattern: "video",
    react: "🎶",
    desc: "Download video",
    category: "download",
    filename: __filename,
  },
  async (
    danuwa,
    mek,
    m,
    {
      from,
      quoted,
      body,
      isCmd,
      command,
      args,
      q,
      isGroup,
      sender,
      senderNumber,
      botNumber2,
      botNumber,
      pushname,
      isMe,
      isOwner,
      groupMetadata,
      groupName,
      participants,
      groupAdmins,
      isBotAdmins,
      isAdmins,
      reply,
    }
  ) => {
    try {
      if (!q) return reply("❌ *Please provide a video name or YouTube link*");

      const search = await yts(q);
      const data = search.videos[0];
      const url = data.url;

      let desc = `
Song downloader
🎬 *Title:* ${data.title}
⏱️ *Duration:* ${data.timestamp}
📅 *Uploaded:* ${data.ago}
👀 *Views:* ${data.views.toLocaleString()}
🔗 *Watch Here:* ${data.url}
`;

      await danuwa.sendMessage(
        from,
        { image: { url: data.thumbnail }, caption: desc },
        { quoted: mek }
      );

      const quality = "360";
      const videoData = await ytmp4(url, quality);

      let durationParts = data.timestamp.split(":").map(Number);
      let totalSeconds =
        durationParts.length === 3
          ? durationParts[0] * 3600 + durationParts[1] * 60 + durationParts[2]
          : durationParts[0] * 60 + durationParts[1];

      if (totalSeconds > 7200) {
        return reply("⏳ *Sorry, video files longer than 30 minutes are not supported.*");
      }

      await danuwa.sendMessage(
        from,
        {
          audio: { url: videoData.download.url },
          mimetype: "video/mp4",
        },
        { quoted: mek }
      );

      await danuwa.sendMessage(
        from,
        {
          document: { url: videoData.download.url },
          mimetype: "video/mp4",
          fileName: `${data.title}.mp4`,
          caption: "🎶 *Your video is ready to be played!*",
        },
        { quoted: mek }
      );

      return reply("✅ Thank you");
    } catch (e) {
      console.log(e);
      reply(`❌ *Error:* ${e.message} 😞`);
    }
  }
);

