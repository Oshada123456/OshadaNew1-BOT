const { cmd, commands } = require("../command");
const { downloadAnyApk } = require("../apk-downloader-plugin/universal-apk-downloader");
const fs = require("fs");

cmd(
  {
    pattern: "apk",
    react: "📦",
    desc: "Download any Android APK file by app name",
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
      reply,
    }
  ) => {
    try {
      if (!q) return reply("❌ *Please type app name or APK link.*\nExample: .apk WhatsApp");

      await reply(`🔍 Searching for "${q}" app...`);

      const result = await downloadAnyApk({
        queryOrUrl: q,
        folder: "./downloads",
        filename: `${q.replace(/\s+/g, "_")}.apk`,
      });

      const apkPath = result.savedTo;

      if (!fs.existsSync(apkPath)) {
        return reply("❌ *Download failed.* File not found.");
      }

      await danuwa.sendMessage(
        from,
        {
          document: { url: apkPath },
          mimetype: "application/vnd.android.package-archive",
          fileName: `${q.replace(/\s+/g, "_")}.apk`,
          caption: `✅ *Downloaded from ${result.source}*\n📥 ${result.apkUrl}`,
        },
        { quoted: mek }
      );

      return reply("✅ *Your APK is ready!* 📱");
    } catch (err) {
      console.error(err);
      return reply(`❌ *Error:* ${err.message}`);
    }
  }
);
