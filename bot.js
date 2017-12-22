var Promise = require('bluebird');
var rp = require('request-promise');
var WebSocket = require('ws');
var xml2js = require('xml2js').parseString;
var uuid = require('uuid/v4');
var URL = require('url');

var Bot = function(emailAddress, password) {
  var self = this;

  self.ws = null;
  self.responses = [];

  self.emailAddress = emailAddress;
  self.password = password;

  self.clientName = 'web-client||9719';

  self.possibleCommands = [
    {
      pattern: 'echo',
      fn: function(fromChannelId, body) {
        return Promise.resolve(body);
      }
    }
  ];
};

Bot.prototype.login = async function() {
  var self = this;

  var cookieJar = rp.jar();

  var options = {
    method: 'POST',
    uri: 'https://authentication.logmeininc.com/login',
    form: {
      emailAddress: self.emailAddress,
      password: self.password,
      submit: 'Sign in',
      rememberMe: 'on',
      _eventId: 'submit',
      lt: '',
      execution: ''
    },
    qs: {
      service: 'https://authentication.logmeininc.com/oauth/authorize?client_id=a3f8c466-be7b-4e6c-b539-c688fa06afb7&login_theme=g2m&redirect_uri=https%3A%2F%2Fmessenger.gotomeeting.com%2F&response_type=token&scope=social-graph',
      theme: 'g2m'
    },
    resolveWithFullResponse: true,
    followRedirect: false,
    simple: false,
    jar: cookieJar
  };

  var response = await rp(options);

  if (!response.headers.location) {
    throw new Error('Login failed');
  }

  var options = {
    method: 'GET',
    uri: response.headers.location,
    followRedirect: false,
    simple: false,
    resolveWithFullResponse: true,
    jar: cookieJar
  };

  var response = await rp(options);

  var parsedUrl = URL.parse(response.headers.location.replace('#', '?'), true);

  self.jwt = parsedUrl.query.access_token;

  var options = {
    method: 'GET',
    uri: 'https://iam.servers.getgo.com/identity/v1/Users/me',
    headers: {
      'Authorization': `Bearer ${self.jwt}`
    },
    followRedirect: false,
    simple: false,
    resolveWithFullResponse: true
  };

  var response = await rp(options);

  var splitLocation = response.headers.location.split('/');

  self.userId = `${splitLocation[splitLocation.length - 1]}@chat.platform.getgo.com`;

  self.authToken = Buffer.concat([
    Buffer.from('${self.userId}'), 
    Buffer.from([0x00]), 
    Buffer.from(`${self.userId.split('@')[0]}`), 
    Buffer.from([0x00]), 
    Buffer.from(`{Bearer}${self.jwt}`)
  ]).toString('base64');
};

Bot.prototype.waitForMessage = async function() {
  var self = this;

  await Promise.delay(166)
  
  if (!self.responses.length) {
    return self.waitForMessage();
  }

  return self.responses.pop();
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

Bot.prototype.waitForMessages = async function() {
  var self = this;

  await Promise.delay(500)

  await Promise.each(self.responses, async function(response, index) {
    if (!response.message || response.message.body[0].indexOf('@bot') === -1) {
      return;
    }

    await self.handleBotMessage(response.message.$.from, response.message.body[0].replace('@bot', '').trim());

    self.responses.splice(index, 1);
  });

  return self.waitForMessages();
};

Bot.prototype.handleBotMessage = async function(from, body) {
  var fromChannelId = from.split('/')[0];
  var fromUserId = from.split('/')[1];

  var matchingCommand = this.possibleCommands.find(function(possibleCommand) {
    return body.indexOf(possibleCommand.pattern) !== -1;
  });

  if (!matchingCommand) {
    this.sendMessage(fromChannelId, `Unknown command: ${body}`);
    return;
  }

  var response = await matchingCommand.fn(fromChannelId, body)

  self.sendMessage(fromChannelId, response);
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

Bot.prototype.auth = async function() {
  var self = this;

  self.send(`<open xmlns='urn:ietf:params:xml:ns:xmpp-framing' to='chat.platform.getgo.com' version='1.0'/>`);
  await self.waitForMessage()
  await self.waitForMessage();

  self.send(`<auth xmlns='urn:ietf:params:xml:ns:xmpp-sasl' mechanism='PLAIN'>${self.authToken}</auth>`);
  await self.waitForMessage();

  self.send(`<open xmlns='urn:ietf:params:xml:ns:xmpp-framing' to='chat.platform.getgo.com' version='1.0'/>`);
  await self.waitForMessage();

  self.send(`<iq type='set' id='_bind_auth_2' xmlns='jabber:client'><bind xmlns='urn:ietf:params:xml:ns:xmpp-bind'><resource>${self.clientName}</resource></bind></iq>`);
  await self.waitForMessage();

  self.send(`<iq type='set' id='_session_auth_2' xmlns='jabber:client'><session xmlns='urn:ietf:params:xml:ns:xmpp-session'/></iq>`);
  await self.waitForMessage();
};

Bot.prototype.subscribeToChannels = async function() {
  var self = this;

  var msgId = self.getListOfChannels();

  await Promise.delay(3000);

  var matchingResponse = self.responses.find(function(response) {
    return response.iq && response.iq.$.id.indexOf(msgId) !== -1;
  });

  var channelIds = matchingResponse.iq.subscriptions[0].subscription.map(function(subscription) {
    return subscription.$.jid;
  });

  channelIds.forEach(function(channelId) {
    self.ws.send(`<presence from='${self.userId}/${self.clientName}' to='${channelId}/${self.userId}' xmlns='jabber:client'><x xmlns='http://jabber.org/protocol/muc'><history maxstanzas='0'/></x></presence>`);
  });

  await Promise.delay(1000);
};

Bot.prototype.run = async function() {
  var self = this;

  await self.connect()

  await self.auth();

  await self.subscribeToChannels();

  console.log(new Date(), 'Listening for messages!');

  await self.waitForMessages();
};

(async function() {
  var emailAddress = process.argv[2];
  var password = process.argv[3];

  if (!emailAddress || !password) {
    console.error('usage: bot emailAddress password');
    process.exit(1);
  }
  
  var bot = new Bot(emailAddress, password);

  await bot.login()

  await bot.run();
})();

process.on('unhandledRejection', function(err) {
 console.error(err.stack);
 process.exit(1);
});
