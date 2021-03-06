module.exports = async function(self, fromChannelId, body) {
  var msgId = self.getListOfPrivateConversations();

  var response = await self.waitForMessage(msgId);

  return '```\n' + JSON.stringify(response, undefined, 2) + '\n```';
};
