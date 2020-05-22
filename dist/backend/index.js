"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

require("bluebird-global");

var _twilio = require("./twilio");

let service;

const onServerStarted = async bp => {
  service = new _twilio.TwilioService(bp);

  try {
    await service.initialize();
  } catch (err) {
    bp.logger.attachError(err).warn('Channel misconfigured');
  }
};

const onBotMount = async (bp, botId) => {
  await service.mountBot(botId);
};

const onBotUnmount = async (bp, botId) => {
  await service.unmountBot(botId);
};

const onModuleUnmount = async bp => {
  bp.events.removeMiddleware('twilio.sendMessages');
  bp.http.deleteRouterForBot('channel-twilio');
};

const entryPoint = {
  onServerStarted,
  onBotMount,
  onBotUnmount,
  onModuleUnmount,
  definition: {
    name: 'channel-twilio',
    noInterface: true,
    fullName: 'Twilio Channel'
  }
};
var _default = entryPoint;
exports.default = _default;
//# sourceMappingURL=index.js.map