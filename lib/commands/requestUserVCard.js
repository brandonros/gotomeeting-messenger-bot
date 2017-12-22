module.exports = async function(self, fromChannelId, parameters) {
  var msgId = self.requestUserVCard(parameters.userId);

  var response = await self.waitForMessage(msgId);

  return '```\n' + JSON.stringify(response, undefined, 2) + '\n```';
};
