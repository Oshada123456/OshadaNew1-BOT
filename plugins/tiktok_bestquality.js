const { cmd, commands } = require("../command");
const TikTokScraper = require("tiktok-scraper");
const fetch = require("node-fetch");

cmd(
  {
    pattern: "tiktok",
    react: "🎥",
    desc: "Download TikTok Video (Best Quality, No Watermark, Redirect Fix)",
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

      // Follow redirect for short TikTok links (vt.tiktok.com/...)
      let finalUrl = q;
      try {
        const res = await fetch(q, { redirect: "follow" });
        finalUrl = res.url;
      } catch (e) {
        console.log("Redirect error:", e.message);
      }

      const videoMeta = await TikTokScraper.getVideoMeta(finalUrl);

      if (!videoMeta || !videoMeta.collector || !videoMeta.collector.length)
        return reply("❌ *Unable to fetch video details. Make sure the link is correct.*");

      const data = videoMeta.collector[0];

      // Pick best available quality (HD > NoWatermark > Normal)
      const videoUrl =
        data.videoUrlNoWaterMarkHd ||
        data.videoUrlNoWaterMark ||
        data.videoUrl;

      if (!videoUrl) return reply("❌ *Couldn't find valid video link.*");

      let qualityLabel = data.videoUrlNoWaterMarkHd
        ? "HD (1080p)"
        : data.videoUrlNoWaterMark
        ? "No Watermark"
        : "Standard";

      let caption = `
🎬 *Title:* ${data.text || "No caption"}
👤 *Author:* ${data.authorMeta.name}
🎵 *Music:* ${data.musicMeta.musicName}
❤️ *Likes:* ${data.diggCount}
💬 *Comments:* ${data.commentCount}
📺 *Quality:* ${qualityLabel}
🔗 *Link:* ${finalUrl}
`;

      await danuwa.sendMessage(
        from,
        { video: { url: videoUrl }, caption },
        { quoted: mek }
      );

      return reply(`✅ *Here is your TikTok video (${qualityLabel})* 🎉`);

    } catch (err) {
      console.error(err);
      reply(`❌ *Error:* ${err.message}`);
    }
  }
);