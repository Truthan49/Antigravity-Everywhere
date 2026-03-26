import * as lark from '@larksuiteoapi/node-sdk';
import * as fs from 'fs';
const feishuConfigPath = require('path').join(__dirname, 'data', 'feishu-config.json');
const rawConfig = fs.readFileSync(feishuConfigPath, 'utf8');
const config = JSON.parse(rawConfig);
console.log('AppId:', config.appId);

const client = new lark.Client({ appId: config.appId, appSecret: config.appSecret });
client.im.message.patch({
  path: { message_id: 'om_x100b530ebc0d24b4c4c3291e5e651f3' },
  data: { content: JSON.stringify({ text: "Test patch update from backend!" }) }
}).then(console.log).catch(console.error);
