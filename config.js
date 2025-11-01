const fs = require('fs');
if (fs.existsSync('config.env')) require('dotenv').config({ path: './config.env' });

function convertToBool(text, fault = 'true') {
    return text === fault ? true : false;
}
module.exports = {
SESSION_ID: process.env.SESSION_ID || "MdFhFB5J#hk69apv0u1YM58X_FFlUb_NFmfWb7pqL6p1N0XJUDzA",
ALIVE_IMG: process.env.ALIVE_IMG || "https://github.com/Oshada123456/OshadaNew1-BOT/blob/main/images/Picsart_25-04-03_21-30-50-609.jpg?raw=true",
ALIVE_MSG: process.env.ALIVE_MSG || "*Hello👋 Oshi-BOT Is Alive Now😍*",
BOT_OWNER: '94788345811',  // Replace with the owner's phone number



};
