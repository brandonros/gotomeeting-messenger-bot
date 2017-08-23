var Promise = require('bluebird');
var WebSocket = require('ws');
var xml2js = require('xml2js').parseString;
var uuid = require('uuid/v4');

var Bot = function() {
  var self = this;

  self.ws = null;
  self.responses = [];

  /* curl -v 'https://login.citrixonline.com/login?service=https%3A%2F%2Fauthentication.citrixonline.com%2Foauth%2Fauthorize%3Fresponse_type%3Dtoken%26client_id%3Da3f8c466-be7b-4e6c-b539-c688fa06afb7%26redirect_uri%3Dhttps%253A%252F%252Fmessenger.gotomeeting.com%252F%26scope%3Dsocial-graph%26login_theme%3Dg2m' -H 'Content-Type: application/x-www-form-urlencoded' --data 'emailAddress=john@aol.com&password=password&submit=Sign+in&rememberMe=on&_eventId=submit&lt=&execution=' */

  self.jwt = 'responseCookieFromCurlRequest';
  self.userId = '1234567890123456789@chat.platform.getgo.com'; /* you should probably find this on your own */
  self.clientName = 'web-client||9719';

  self.authToken = Buffer.concat([
    Buffer.from('${self.userId}'), 
    Buffer.from([0x00]), 
    Buffer.from(`${self.userId.split('@')[0]}`), 
    Buffer.from([0x00]), 
    Buffer.from(`{Bearer}${self.jwt}`)
  ]).toString('base64');

  self.possibleCommands = [
    {
      pattern: 'echo',
      fn: function(fromChannelId, body) {
        return Promise.resolve(body);
      }
    }
  ];
};

Bot.prototype.waitForMessage = function() {
  var self = this;

  return Promise.delay(166)
    .then(function() {
      if (!self.responses.length) {
        return self.waitForMessage();
      }

      return self.responses.pop();
    });
};

Bot.prototype.send = function(msg) {
  console.log('> ' + msg);

  this.ws.send(msg);
};

Bot.prototype.xml2js = function(xml) {
  return new Promise(function(resolve, reject) {
    xml2js(xml, function(err, res) {
      if (err) {
        return reject(err);
      }

      resolve(res);
    });
  }); 
};

Bot.prototype.connect = function() {
  var self = this;

  return new Promise(function(resolve, reject) {
    self.ws = new WebSocket('wss://xmpp.servers.getgo.com/websocket');

    self.ws.on('message', function(data) {
      console.log('< ' + data);

      self.xml2js(data)
      .then(function(response) {
        self.responses.push(response);
      });
    });

    self.ws.on('open', function() {
      console.log(new Date(), 'Connected');

      resolve();
    });
  });
};

Bot.prototype.waitForMessages = function() {
  var self = this;

  return Promise.delay(500)
    .then(function() {
      self.responses.forEach(function(response, index) {
        if (!response.message || response.message.body[0].indexOf('@bot') === -1) {
          return;
        }

        self.handleBotMessage(response.message.$.from, response.message.body[0].replace('@bot', '').trim());

        self.responses.splice(index, 1);
      });

       return self.waitForMessages();
    });
};

Bot.prototype.handleBotMessage = function(from, body) {
  var fromChannelId = from.split('/')[0];
  var fromUserId = from.split('/')[1];

  var matchingCommand = this.possibleCommands.find(function(possibleCommand) {
    return body.indexOf(possibleCommand.pattern) !== -1;
  });

  if (!matchingCommand) {
    this.sendMessage(fromChannelId, `Unknown command: ${body}`);
    return;
  }

  matchingCommand.fn(fromChannelId, body)
  .then(function(response) {
    self.sendMessage(fromChannelId, response);
  });
};

Bot.prototype.getListOfChannels = function() {
  var msgId = uuid();

  this.send(`<iq type='get' to='conference.chat.platform.getgo.com' xmlns='jabber:client' id='${msgId}:sendIQ'><subscriptions xmlns='urn:xmpp:mucsub:0'/></iq>`);

  return msgId;
};

Bot.prototype.getListOfPrivateConversations = function() {
  var msgId = uuid();

  this.send(`<iq type='get' id='${msgId}:roster' xmlns='jabber:client'><query xmlns='jabber:iq:roster'/></iq>`);

  return msgId;
};

Bot.prototype.requestChannelInfo = function(channelId) {
  var msgId = uuid();

  this.send(`<iq to='${channelId}' type='get' xmlns='jabber:client' id='${msgId}:sendIQ'><query xmlns='http://jabber.org/protocol/disco#info'/></iq>`);

  return msgId;
};

Bot.prototype.sendMessage = function(to, body) {
  var msgId = uuid();

  this.send(`<message from='${this.userId}/${this.clientName}' msgid='${msgId}' to='${to}' type='chat' xmlns='jabber:client'><body>${body}</body><origin-id xmlns='urn:xmpp:sid:0' id='${msgId}'/></message>`);

  return msgId;
};

Bot.prototype.auth = function() {
  var self = this;

  self.send(`<open xmlns='urn:ietf:params:xml:ns:xmpp-framing' to='chat.platform.getgo.com' version='1.0'/>`);

  return self.waitForMessage()
    .then(function() {
      return self.waitForMessage();
    })
    .then(function() {
      self.send(`<auth xmlns='urn:ietf:params:xml:ns:xmpp-sasl' mechanism='PLAIN'>${self.authToken}</auth>`);

      return self.waitForMessage();
    })
    .then(function() {
      self.send(`<open xmlns='urn:ietf:params:xml:ns:xmpp-framing' to='chat.platform.getgo.com' version='1.0'/>`);

      return self.waitForMessage();
    })
    .then(function() {
      self.send(`<iq type='set' id='_bind_auth_2' xmlns='jabber:client'><bind xmlns='urn:ietf:params:xml:ns:xmpp-bind'><resource>${self.clientName}</resource></bind></iq>`);

      return self.waitForMessage();
    })
    .then(function() {
      self.send(`<iq type='set' id='_session_auth_2' xmlns='jabber:client'><session xmlns='urn:ietf:params:xml:ns:xmpp-session'/></iq>`);

      return self.waitForMessage();
    });
};

Bot.prototype.subscribeToChannels = function() {
  var self = this;

  var msgId = self.getListOfChannels();

  return Promise.delay(3000)
    .then(function() {
      var matchingResponse = self.responses.find(function(response) {
        return response.iq && response.iq.$.id.indexOf(msgId) !== -1;
      });

      var channelIds = matchingResponse.iq.subscriptions[0].subscription.map(function(subscription) {
        return subscription.$.jid;
      });

      channelIds.forEach(function(channelId) {
        self.ws.send(`<presence from='${self.userId}/${self.clientName}' to='${channelId}/${self.userId}' xmlns='jabber:client'><x xmlns='http://jabber.org/protocol/muc'><history maxstanzas='0'/></x></presence>`);
      });

      return Promise.delay(1000);
    });
};

Bot.prototype.run = function() {
  var self = this;

  self.connect()
  .then(function() {
    return self.auth();
  })
  .then(function() {
    return self.subscribeToChannels();
  })
  .then(function() {
    console.log(new Date(), 'Listening for messages!');

    return self.waitForMessages();
  });
};

var bot = new Bot();

bot.run();
