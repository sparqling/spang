const prefixModule = require('./prefix.js');
const alias = require('./alias.js');

exports.initialize = (opts) => {
  if (opts.ignoreAllConfig) {
    return;
  }

  let userConfigDir = `${require('os').homedir()}/.spang`;
  if (opts.userConfig) {
    userConfigDir = opts.userConfig;
  }

  if (opts.ignoreUserConfig) {
    prefixModule.setPrefixFiles([`${__dirname}/../etc/prefix`]);
  } else {
    prefixModule.setPrefixFiles([`${__dirname}/../etc/prefix`, `${userConfigDir}/prefix`]);
  }

  let aliasFiles = [`${__dirname}/../etc/alias`];
  if (!opts.ignoreUserConfig) {
    aliasFiles.push(`${userConfigDir}/alias`);
  }
  alias.setAliasFiles(aliasFiles);
};
