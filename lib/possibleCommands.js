module.exports = [
    {
      pattern: 'echo',
      parameters: [],
      fn: require('./commands/echo.js')
    },
    {
      pattern: 'listCommands',
      parameters: [],
      fn: require('./commands/listCommands.js')
    },
    {
      pattern: 'getListOfPrivateConversations',
      parameters: [],
      fn: require('./commands/getListOfPrivateConversations.js')
    },
    {
      pattern: 'getListOfChannels',
      parameters: [],
      fn: require('./commands/getListOfChannels.js')
    },
    {
      pattern: 'getListOfResolvedChannels',
      parameters: [],
      fn: require('./commands/getListOfResolvedChannels.js')
    },
    {
      pattern: 'getListOfUsersInChannel',
      parameters: [
        {
          name: 'channelId',
          required: true
        }
      ],
      fn: require('./commands/getListOfUsersInChannel.js')
    },
    {
      pattern: 'requestUserVCard',
      parameters: [
        {
          name: 'userId',
          required: true
        }
      ],
      fn: require('./commands/requestUserVCard.js')
    },
    {
      pattern: 'getAllMessageHistory',
      parameters: [
        {
          name: 'id',
          required: true
        },
        {
          name: 'type',
          required: true
        }
      ],
      fn: require('./commands/getAllMessageHistory.js')
    }
];
