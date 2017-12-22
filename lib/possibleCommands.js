var Promise = require('bluebird');
var moment = require('moment');
var low = require('lowdb');
var FileSync = require('lowdb/adapters/FileSync');

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
        var output = 'Possible commands include:\n```';

        output += self.possibleCommands.reduce(function(prev, possibleCommand) {
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
        }, '');

        output += '```';

        return output;
      }
    },
    {
      pattern: 'getListOfPrivateConversations',
      parameters: [],
      fn: async function(self, fromChannelId, body) {
        var msgId = self.getListOfPrivateConversations();

        var response = await self.waitForMessage(msgId);

        return '```\n' + JSON.stringify(response, undefined, 2) + '\n```';
      }
    },
    {
      pattern: 'getListOfChannels',
      parameters: [],
      fn: async function(self, fromChannelId, body) {
        var msgId = self.getListOfChannels();

        var response = await self.waitForMessage(msgId);

        return '```\n' + JSON.stringify(response, undefined, 2) + '\n```';
      }
    },
    {
      pattern: 'getListOfResolvedChannels',
      parameters: [],
      fn: async function(self, fromChannelId, body) {
        var response = await self.getListOfResolvedChannels();

        return '```\n' + JSON.stringify(response, undefined, 2) + '\n```';
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

        return '```\n' + JSON.stringify(response, undefined, 2) + '\n```';
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

        return '```\n' + JSON.stringify(response, undefined, 2) + '\n```';
      }
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
      fn: async function(self, fromChannelId, parameters) {
        function generateMicroSeconds(input) {
          return moment(input).valueOf() + input.substr(-4).substr(0, 3);
        }

        async function getMessages(before, after) {
          var queryId = self.getMessageHistory(parameters.id, parameters.type, 100, before || '');

          await Promise.delay(5000);

          var mappedMessages = self.queryResponses.filter(function(queryResponse) {
            return queryResponse.$.queryid === queryId;
          }).map(function(queryResponse) {
            return {
              id: queryResponse.forwarded[0].message[0].$.id,
              from: queryResponse.forwarded[0].message[0].$.from,
              to: queryResponse.forwarded[0].message[0].$.to,
              body: queryResponse.forwarded[0].message[0].body[0],
              time: queryResponse.forwarded[0].delay[0].$.stamp,
              microseconds: generateMicroSeconds(queryResponse.forwarded[0].delay[0].$.stamp)
            };
          });

          if (mappedMessages.length === 0) {
            return mappedMessages;
          }

          mappedMessages.sort(function(a, b) {
            return a.microseconds - b.microseconds;
          });

          var newestMessageSeen = mappedMessages.some(function(mappedMessage) {
            return mappedMessage.microseconds === after;
          });

          if (newestMessageSeen) {
            return mappedMessages;
          } else {
            return mappedMessages.concat(await getMessages(mappedMessages[0].microseconds, after));
          }
        }

        function initDb() {
          var adapter = new FileSync('db.json');
          var db = low(adapter);

          var defaults = { 
            messages: [],
            timestamps: []
          };

          db.defaults(defaults)
            .write();

          return db;
        }

        function storeMessages(db, messages) {
          var numStoredMessages = 0;

          messages.forEach(function(message) {
            var messageEntry = db.get('messages')
              .find({ id: message.id })
              .value();

            if (!messageEntry) {
              db.get('messages')
                .push(message)
                .write();

              numStoredMessages += 1;
            }
          });

          return numStoredMessages;
        }

        function updateTimestampEntry(db, messages, parameters) {
          var timestampEntry = db.get('timestamps')
            .find({ id: parameters.id })
            .value();

          if (timestampEntry) {
            db.get('timestamps')
              .find({ id: parameters.id })
              .assign({ 
                newest: messages[messages.length - 1].microseconds,
                oldest: messages[0].microseconds
              })
              .write(); 
          } else {
            db.get('timestamps')
              .push({ 
                id:  parameters.id, 
                newest: messages[messages.length - 1].microseconds,
                oldest: messages[0].microseconds
              })
              .write();
          }
        }

        var db = initDb();

        var timestampEntry = db.get('timestamps')
          .find({ id: parameters.id })
          .value();

        var messages;

        if (!timestampEntry) {
          messages = await getMessages();
        } else {
          messages = await getMessages(undefined, timestampEntry.newest);
        }

        var numStoredMessages = storeMessages(db, messages);

        updateTimestampEntry(db, messages, parameters);

        return `Wrote ${numStoredMessages} new messages to file`;
      }
    }
];
