var Promise = require('bluebird');

module.exports = [
    {
      pattern: 'echo',
      parameters: [],
      fn: async function(self, fromChannelId, body) {
        return body;
      }
    },
    {
      pattern: 'listCommands',
      parameters: [],
      fn: async function(self, fromChannelId, body) {
        return self.possibleCommands.reduce(function(prev, possibleCommand) {
          var commandOutput = '';

          commandOutput += `* ${possibleCommand.pattern}`;

          if (possibleCommand.parameters.length) {
            commandOutput += ': ';

            possibleCommand.parameters.forEach(function(parameter) {
              if (parameter.required) {
                commandOutput += `${parameter.name} `;
              }

              else {
                commandOutput += `[${parameter.name}] `;
              }
            });
          }

          return prev + commandOutput + '\n';
        }, 'Possible commands include:\n');
      }
    },
    {
      pattern: 'getListOfPrivateConversations',
      parameters: [],
      fn: async function(self, fromChannelId, body) {
        var msgId = self.getListOfPrivateConversations();

        var response = await self.waitForMessage(msgId);

        return JSON.stringify(response);
      }
    },
    {
      pattern: 'getListOfChannels',
      parameters: [],
      fn: async function(self, fromChannelId, body) {
        var msgId = self.getListOfChannels();

        var response = await self.waitForMessage(msgId);

        return JSON.stringify(response);
      }
    },
    {
      pattern: 'getListOfResolvedChannels',
      parameters: [],
      fn: async function(self, fromChannelId, body) {
        var response = await self.getListOfResolvedChannels();

        return JSON.stringify(response);
      }
    },
    {
      pattern: 'getListOfUsersInChannel',
      parameters: [
        {
          name: 'channelId',
          required: true
        }
      ],
      fn: async function(self, fromChannelId, parameters) {
        var msgId = self.getListOfUsersInChannel(parameters.channelId);

        var response = await self.waitForMessage(msgId);

        return JSON.stringify(response);
      }
    },
    {
      pattern: 'requestUserVCard',
      parameters: [
        {
          name: 'userId',
          required: true
        }
      ],
      fn: async function(self, fromChannelId, parameters) {
        var msgId = self.requestUserVCard(parameters.userId);

        var response = await self.waitForMessage(msgId);

        return JSON.stringify(response);
      }
    },
    {
      pattern: 'getMessageHistory',
      parameters: [
        {
          name: 'userId',
          required: true
        },
        {
          name: 'numMessages',
          required: true
        },
        {
          name: 'before',
          required: false
        }
      ],
      fn: async function(self, fromChannelId, parameters) {
        var queryId = self.getMessageHistory(parameters.userId, parameters.numMessages, parameters.before);

        await Promise.delay(5000);

        /* TODO: cleanup self.queryResponses with finished queryId */

        return self.queryResponses.filter(function(queryResponse) {
          return queryResponse.$.queryid === queryId;
        }).map(function(queryResponse) {
          var from = queryResponse.forwarded[0].message[0].$.from;
          var body = queryResponse.forwarded[0].message[0].body[0];
          var time = queryResponse.forwarded[0].delay[0].$.stamp;

          return `FROM: ${from}
TIME: ${time}
BODY: ${body}`;
        });
      }
    }
];
