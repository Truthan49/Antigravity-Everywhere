const fs = require('fs');
const lark = require('@larksuiteoapi/node-sdk');

const configStr = fs.readFileSync('/Users/hanyi/.gemini/antigravity/feishu-config.json', 'utf8');
const config = JSON.parse(configStr);

const client = new lark.Client({ appId: config.appId, appSecret: config.appSecret });

console.log("AppID:", config.appId);
client.bot.bot.get().then(res => console.log('Bot info:', res)).catch(err => console.error('Bot error:', err));
