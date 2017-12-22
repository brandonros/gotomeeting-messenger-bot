module.exports = async function(self, fromChannelId, body) {
  var response = await self.getListOfResolvedChannels();

  return '```\n' + JSON.stringify(response, undefined, 2) + '\n```';
};
