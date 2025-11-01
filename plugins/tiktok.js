const { cmd, commands } = require("../command");
const TikTokScraper = require("tiktok-scraper");

cmd(
  {
    pattern: "tt",
    react: "🎥",
    desc: "Download TikTok Video (No Watermark)",
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
      if (!q) return reply("❌ *Please provide a TikTok video link!*");

      reply("⏳ *Fetching TikTok video...*");

      const videoMeta = await TikTokScraper.getVideoMeta(q);

      if (!videoMeta || !videoMeta.collector || !videoMeta.collector.length)
        return reply("❌ *Unable to fetch video details. Make sure the link is correct.*");

      const data = videoMeta.collector[0];
      const videoUrl = data.videoUrlNoWaterMark || data.videoUrl;

      if (!videoUrl) return reply("❌ *Couldn't find no-watermark video link.*");

      let caption = `
🎬 *Title:* ${data.text || "No caption"}
👤 *Author:* ${data.authorMeta.name}
🎵 *Music:* ${data.musicMeta.musicName}
❤️ *Likes:* ${data.diggCount}
💬 *Comments:* ${data.commentCount}
🔗 *Link:* ${q}
`;

      await danuwa.sendMessage(
        from,
        { video: { url: videoUrl }, caption },
        { quoted: mek }
      );

      return reply("✅ *Here is your TikTok video (No Watermark)* 🎉");

    } catch (err) {
      console.error(err);
      reply(`❌ *Error:* ${err.message}`);
    }
  }
);
