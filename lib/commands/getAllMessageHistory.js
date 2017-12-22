var Promise = require('bluebird');
var moment = require('moment');
var low = require('lowdb');
var FileSync = require('lowdb/adapters/FileSync');

function generateMicroSeconds(input) {
  return moment(input).valueOf() + input.substr(-4).substr(0, 3);
}

async function getMessages(self, parameters, before, after) {
  var queryId = self.getMessageHistory(parameters.id, parameters.type, 50, before || '');

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
    return mappedMessages.concat(await getMessages(self, parameters, mappedMessages[0].microseconds, after));
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
  messages.sort(function(a, b) {
    return a.microseconds - b.microseconds;
  });

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

module.exports = async function(self, fromChannelId, parameters) {
  var db = initDb();

  var timestampEntry = db.get('timestamps')
    .find({ id: parameters.id })
    .value();

  var messages;

  if (!timestampEntry) {
    messages = await getMessages(self, parameters);
  } else {
    messages = await getMessages(self, parameters, undefined, timestampEntry.newest);
  }

  var numStoredMessages = storeMessages(db, messages);

  updateTimestampEntry(db, messages, parameters);

  return `Wrote ${numStoredMessages} new messages to file`;
};
