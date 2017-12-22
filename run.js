var Bot = require('./lib/Bot.js');

(async function() {
  var emailAddress = process.argv[2];
  var password = process.argv[3];

  if (!emailAddress || !password) {
    console.error('usage: bot emailAddress password');
    process.exit(1);
  }
  
  var bot = new Bot(emailAddress, password);

  await bot.login();

  await bot.connect();

  await bot.auth();

  await bot.subscribeToChannels();

  console.log(new Date(), 'Listening for messages!');

  await bot.waitForMessages();
})();

process.on('unhandledRejection', function(err) {
 console.error(err.stack);
 process.exit(1);
});

