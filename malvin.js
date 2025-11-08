// malvin.js
// Simple plugin registry + dispatcher compatible with plugins like dl-apk.js
// Usage: const { malvin, handleMessage, loadPlugins } = require('./malvin');

const fs = require('fs');
const path = require('path');

const commands = new Map();

/**
 * Register a plugin/command.
 * @param {Object} meta - metadata: pattern, alias, react, desc, category, use, filename
 * @param {Function} handler - async function(conn, mek, m, context) => {}
 */
function malvin(meta = {}, handler) {
  if (!meta || !handler) throw new Error('malvin requires meta and handler');
  // normalize aliases
  const aliases = Array.isArray(meta.alias) ? meta.alias : (meta.alias ? [meta.alias] : []);
  const key = (meta.pattern || aliases[0] || meta.use || `cmd_${commands.size+1}`).toString();
  commands.set(key, { meta: { ...meta, alias: aliases }, handler });
}

/**
 * Try to find a command by name (alias or pattern).
 * @param {String} name
 */
function findCommandByName(name) {
  if (!name) return null;
  for (const [, cmd] of commands) {
    const { meta } = cmd;
    const aliases = meta.alias || [];
    const pattern = (meta.pattern || '').toString();
    if (pattern && pattern.toLowerCase() === name.toLowerCase()) return cmd;
    if (aliases.find(a => a.toLowerCase() === name.toLowerCase())) return cmd;
  }
  return null;
}

/**
 * Helper to safely extract text from incoming message object (Baileys-like).
 */
function getMessageText(mek) {
  if (!mek) return '';
  const msg = mek.message || mek.messages || mek;
  if (!msg) return '';
  // Common paths:
  if (msg.conversation) return msg.conversation;
  if (msg.extendedTextMessage && msg.extendedTextMessage.text) return msg.extendedTextMessage.text;
  if (msg.imageMessage && msg.imageMessage.caption) return msg.imageMessage.caption;
  if (msg.videoMessage && msg.videoMessage.caption) return msg.videoMessage.caption;
  // Fallback: try JSON stringify
  return '';
}

/**
 * Call this from your main message handler to dispatch commands.
 * @param {*} conn - your bot connection object (used by plugins to reply/send)
 * @param {*} mek - the incoming message object (Baileys message.upsert event item)
 */
async function handleMessage(conn, mek) {
  try {
    // adapt to common event shapes: Baileys message.upsert => { messages: [msgObj], type: 'notify' }
    const messageObj = mek.messages ? mek.messages[0] : mek;
    const messageText = getMessageText(messageObj);
    if (!messageText) return;

    // prefix and parsing - default prefix '.'
    const prefix = '.';
    if (!messageText.startsWith(prefix)) return;

    // remove prefix, split
    const withoutPrefix = messageText.slice(prefix.length).trim();
    if (!withoutPrefix) return;

    const parts = withoutPrefix.split(/\s+/);
    const commandName = parts[0].toLowerCase();
    const args = parts.slice(1);

    const cmd = findCommandByName(commandName);
    if (!cmd) return; // no matching plugin

    // build helper reply function for plugin
    const from = (messageObj.key && messageObj.key.remoteJid) || (messageObj.key && messageObj.key.fromMe ? (messageObj.key.participant || messageObj.key.remoteJid) : null) || null;
    const m = messageObj; // plugin expects m variable sometimes (quoted message)
    const reply = async (text) => {
      // try common conn.sendMessage signature (Baileys)
      try {
        if (!from) {
          // fallback: try to find sender in message
          const jid = (messageObj.key && messageObj.key.remoteJid) || (messageObj.key && messageObj.participant) || null;
          if (!jid) return;
          from = jid;
        }
        await conn.sendMessage(from, { text });
      } catch (e) {
        // last resort console
        console.error('Reply failed:', e);
      }
    };

    // Call the plugin handler
    await cmd.handler(conn, mek, m, { from, reply, args });
  } catch (err) {
    console.error('malvin.handleMessage error:', err);
  }
}

/**
 * Auto-load all plugin files from a plugins directory.
 * Each plugin file should require('../malvin') OR require('./malvin') depending on structure.
 * This function will require every .js file under given folder.
 * @param {String} pluginsDir - folder path (default './plugins')
 */
function loadPlugins(pluginsDir = path.join(__dirname, 'plugins')) {
  if (!fs.existsSync(pluginsDir)) return;
  const files = fs.readdirSync(pluginsDir).filter(f => f.endsWith('.js'));
  for (const f of files) {
    try {
      require(path.join(pluginsDir, f));
    } catch (e) {
      console.error('Failed to load plugin', f, e);
    }
  }
}

module.exports = { malvin, handleMessage, loadPlugins };
