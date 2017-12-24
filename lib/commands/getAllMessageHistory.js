var Promise = require('bluebird');
var moment = require('moment');
var low = require('lowdb');
var FileSync = require('lowdb/adapters/FileSync');

function generateMicroSeconds(input) {
  return moment(input).valueOf() + input.substr(-4).substr(0, 3);
}

async function getMessages(self, id, type, before) {
  var queryId = self.getMessageHistory(id, type, 50, before || '');

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
      microseconds: parseInt(generateMicroSeconds(queryResponse.forwarded[0].delay[0].$.stamp))
    };
  });

  var pluckedMicroseconds = mappedMessages.map(function(mappedMessage) {
    return mappedMessage.microseconds;
  });

  var oldest = Math.min.apply(null, pluckedMicroseconds);
  var newest = Math.max.apply(null, pluckedMicroseconds);

  return {
    oldest: oldest,
    newest: newest,
    messages: mappedMessages
  };
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

function getTimestampEntry(db, id) {
  return db.get('timestamps')
    .find({ id: id })
    .value();
}

function updateTimestampEntry(db, id, oldest, newest) {
  var timestampEntry = getTimestampEntry(db, id);

  if (timestampEntry) {
    if (newest > timestampEntry.newest || oldest < timestampEntry.oldest) {
      var model = {};

      if (newest > timestampEntry.newest) {
        model.newest = newest;
      }

      if (oldest < timestampEntry.oldest) {
        model.oldest = oldest;
      }

      db.get('timestamps')
        .find({ id: id })
        .assign(model)
        .write();

      console.log(new Date(), `Updated existing timestamp entry; id: ${id}, model: ${JSON.stringify(model)}`);
    }
  } else {
    db.get('timestamps')
      .push({ 
        id:  id, 
        newest: newest,
        oldest: oldest
      })
      .write();

    console.log(new Date(), `Wrote new timestamp entry; id: ${id}, newest: ${newest}, oldest: ${oldest}`);
  }
}

async function getAllMessages(self, id, type, before) {
  var db = initDb();

  var timestampEntry = getTimestampEntry(db, id);

  if (before && timestampEntry && timestampEntry.oldest < before) {
    before = timestampEntry.oldest;
  }

  var {oldest, newest, messages} = await getMessages(self, id, type, before);

  updateTimestampEntry(db, id, oldest, newest);

  var numStoredMessages = storeMessages(db, messages);

  console.log(new Date(), `Stored ${numStoredMessages} messages...`);

  if (messages.length !== 0) {
    numStoredMessages += await getAllMessages(self, id, type, oldest);
  }

  return numStoredMessages;
}

module.exports = async function(self, fromChannelId, parameters) {
  var numStoredMessages = await getAllMessages(self, parameters.id, parameters.type);

  return `Wrote ${numStoredMessages} new messages to file`;
};
