var Promise = require('bluebird');
var rp = require('request-promise');
var WebSocket = require('ws');
var uuid = require('uuid/v4');
var URL = require('url');

var utilities = require('./utilities.js');
var possibleCommands = require('./possibleCommands.js');

var Bot = function(emailAddress, password) {
  var self = this;

  self.ws = null;
  self.responses = [];
  self.queryResponses = [];

  self.emailAddress = emailAddress;
  self.password = password;

  self.botName = '@bot';
  self.clientName = 'web-client||9719';

  self.possibleCommands = possibleCommands;

  self.debug = false;
};

Bot.prototype.connect = function() {
  var self = this;

  return new Promise(function(resolve, reject) {
    self.ws = new WebSocket('wss://xmpp.servers.getgo.com/websocket');

    self.ws.on('message', function(data) {
      utilities.xml2js(data)
      .then(function(response) {
        if (self.debug) {
          console.log('< ' + JSON.stringify(response));
        }

        self.responses.push(response);

        if (response.message && response.message.result) {
          self.queryResponses.push(response.message.result[0]);
        }
      });
    });

    self.ws.on('open', function() {
      console.log(new Date(), 'Connected...');

      resolve();
    });
  });
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
    Buffer.from(`${self.userId}`), 
    Buffer.from([0x00]), 
    Buffer.from(`${self.userId.split('@')[0]}`), 
    Buffer.from([0x00]), 
    Buffer.from(`{Bearer}${self.jwt}`)
  ]).toString('base64');

  console.log(new Date(), `Logged in...`);
};

Bot.prototype.waitForMessage = async function(pattern) {
  var self = this;

  await Promise.delay(166);
  
  if (!self.responses.length) {
    return self.waitForMessage(pattern);
  }

  var poppedResponse = self.responses.pop();

  if (pattern) {
    if (JSON.stringify(poppedResponse).indexOf(pattern) !== -1) {
      return poppedResponse;
    }

    return self.waitForMessage(pattern);
  }

  return poppedResponse;
};

Bot.prototype.send = function(msg) {
  if (this.debug) {
    console.log('> ' + msg);
  }

  this.ws.send(msg);
};

Bot.prototype.waitForMessages = async function() {
  var self = this;

  await Promise.delay(500);

  await Promise.each(self.responses, async function(response, index) {
    if (!response.message || !response.message.body || response.message.body[0].indexOf(self.botName) === -1) {
      return;
    }

    await self.handleBotMessage(response.message.$.from, response.message.body[0].replace(self.botName, '').trim());

    self.responses.splice(index, 1);
  });

  return self.waitForMessages();
};

Bot.prototype.handleBotMessage = async function(from, body) {
  var self = this;

  var fromChannelId = from.split('/')[0];
  var fromUserId = from.split('/')[1];

  var matchingCommand = self.possibleCommands.find(function(possibleCommand) {
    return body.indexOf(possibleCommand.pattern) !== -1;
  });

  if (!matchingCommand) {
    self.sendMessage(fromChannelId, `Unknown command: ${body}`);
    return;
  }

  console.log(new Date(), `Received command: ${matchingCommand.pattern}...`);

  body = body.replace(`${matchingCommand.pattern} `, '');

  var response;

  if (matchingCommand.parameters.length) {
    var splitBody = body.split(' ');

    var reqiredParametersMet = matchingCommand.parameters.every(function(parameter, index) {
      return splitBody[index];
    });

    if (!reqiredParametersMet) {
      var parameterNames = matchingCommand.parameters.reduce(function(prev, parameter) {
        if (parameter.required) {
          return prev + parameter.name + ' ';
        }

        return prev + `[${parameter.name}] `;
      }, '');

      self.sendMessage(fromChannelId, `Usage: ${matchingCommand.pattern} ${parameterNames}`)
      return;
    }

    var parametersMap = {};

    matchingCommand.parameters.forEach(function(parameter, index) {
      parametersMap[parameter.name] = splitBody[index];
    });

    response = await matchingCommand.fn(self, fromChannelId, parametersMap);
  }

  else {
    response = await matchingCommand.fn(self, fromChannelId, body);
  }

  console.log(new Date(), `Handled command: ${matchingCommand.pattern}...`);

  self.sendMessage(fromChannelId, response);
};

Bot.prototype.getListOfResolvedChannels = function() {
  var self = this;
  
  var options = {
    method: 'GET',
    uri: 'https://xmpp.servers.getgo.com/rest/v1/hosts/chat.platform.getgo.com/members/me/rooms?startIndex=0&itemsPerPage=100',
    headers: {
      'Authorization': `Bearer ${self.jwt}`
    },
    json: true
  };

  return rp(options);
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

Bot.prototype.getListOfUsersInChannel = function(channelId) {
  var msgId = uuid();

  this.send(`<iq id="${msgId}:sendIQ" to="${channelId}@conference.chat.platform.getgo.com" type="get" xmlns="jabber:client">
    <query xmlns="http://jabber.org/protocol/muc#admin">
      <item affiliation="member"/>
    </query>
  </iq>`);

  return msgId;
};

Bot.prototype.requestUserVCard = function(userId) {
  var msgId = uuid();

  this.send(`<iq to='${userId}@chat.platform.getgo.com' type='get' xmlns='jabber:client' id='${msgId}:sendIQ'><vCard xmlns='vcard-temp'/></iq>`);

  return msgId;
};

Bot.prototype.requestChannelInfo = function(channelId) {
  var msgId = uuid();

  this.send(`<iq to='${channelId}' type='get' xmlns='jabber:client' id='${msgId}:sendIQ'><query xmlns='http://jabber.org/protocol/disco#info'/></iq>`);

  return msgId;
};

Bot.prototype.sendMessage = function(to, body) {
  var msgId = uuid();

  this.send(`<message from='${this.userId}/${this.clientName}' msgid='${msgId}' to='${to}' type='chat' xmlns='jabber:client'><body>**[BOT]:**\n${body}</body><origin-id xmlns='urn:xmpp:sid:0' id='${msgId}'/></message>`);

  return msgId;
};

Bot.prototype.getMessageHistory = function(id, type, numMessages, before) {
  var self = this;

  console.log(new Date(), 'Getting message history...', before);

  var msgId = uuid();
  var queryId = uuid();

  if (type === 'channel') {
    self.send(`<iq id="${msgId}:sendIQ" to="${id}@conference.chat.platform.getgo.com" type="set" xmlns="jabber:client">
  <query queryid="${queryId}" xmlns="urn:xmpp:mam:0">
    <set xmlns="http://jabber.org/protocol/rsm">
      <max>${numMessages}</max>
      <before>${before}</before>
    </set>
  </query>
</iq>`);
  } else {
    self.send(`<iq type='set' xmlns='jabber:client' id='${msgId}:sendIQ'>
  <query xmlns='urn:xmpp:mam:0' queryid='${queryId}'>
    <x xmlns='jabber:x:data' type='submit'>
      <field var='FORM_TYPE' type='hidden'>
        <value>urn:xmpp:mam:0</value>
      </field>
      <field var='with'>
        <value>${id}@chat.platform.getgo.com</value>
      </field>
    </x>

    <set xmlns='http://jabber.org/protocol/rsm'>
      <max>${numMessages}</max>
      <before>${before}</before>
    </set>
  </query>
</iq>`);
  }

  return queryId;
};

Bot.prototype.subscribeToChannel = async function(channelId) {
  this.send(`<presence from='${this.userId}/${this.clientName}' to='${channelId}/${this.userId}' xmlns='jabber:client'><x xmlns='http://jabber.org/protocol/muc'><history maxstanzas='0'/></x></presence>`);
};

Bot.prototype.auth = async function() {
  this.send(`<open xmlns='urn:ietf:params:xml:ns:xmpp-framing' to='chat.platform.getgo.com' version='1.0'/>`);

  await this.waitForMessage();
  await this.waitForMessage();

  this.send(`<auth xmlns='urn:ietf:params:xml:ns:xmpp-sasl' mechanism='PLAIN'>${this.authToken}</auth>`);
  await this.waitForMessage();

  this.send(`<open xmlns='urn:ietf:params:xml:ns:xmpp-framing' to='chat.platform.getgo.com' version='1.0'/>`);
  await this.waitForMessage();

  this.send(`<iq type='set' id='_bind_auth_2' xmlns='jabber:client'><bind xmlns='urn:ietf:params:xml:ns:xmpp-bind'><resource>${this.clientName}</resource></bind></iq>`);
  await this.waitForMessage();

  this.send(`<iq type='set' id='_session_auth_2' xmlns='jabber:client'><session xmlns='urn:ietf:params:xml:ns:xmpp-session'/></iq>`);
  await this.waitForMessage();

  console.log(new Date(), `Authenticated...`);
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
    self.subscribeToChannel(channelId);

    console.log(new Date(), `Subscribed to ${channelId}`);
  });

  await Promise.delay(1000);
};

module.exports = Bot;