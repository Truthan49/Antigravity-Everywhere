"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.feishuConfigStore = void 0;
var fs_1 = require("fs");
var path_1 = require("path");
var os_1 = require("os");
var CONFIG_PATH = (0, path_1.join)((0, os_1.homedir)(), '.gemini', 'antigravity', 'feishu-config.json');
exports.feishuConfigStore = {
    get: function () {
        try {
            if (!(0, fs_1.existsSync)(CONFIG_PATH)) {
                return { appId: '', appSecret: '' };
            }
            return JSON.parse((0, fs_1.readFileSync)(CONFIG_PATH, 'utf-8'));
        }
        catch (_a) {
            return { appId: '', appSecret: '' };
        }
    },
    set: function (config) {
        try {
            (0, fs_1.mkdirSync)((0, path_1.dirname)(CONFIG_PATH), { recursive: true });
            (0, fs_1.writeFileSync)(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
        }
        catch (e) {
            console.error('Failed to save feishu config', e);
        }
    }
};
