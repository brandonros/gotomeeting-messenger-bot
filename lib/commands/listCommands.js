module.exports = async function(self, fromChannelId, body) {
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
};
