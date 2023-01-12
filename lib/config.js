const prefixModule = require('../lib/prefix.js');
const alias = require('../lib/alias.js');

exports.initialize = (opts) => {
  let userConfigDir = `${require('os').homedir()}/.spang`;
  if (opts.userConfig) {
    userConfigDir = opts.userConfig;
  }

  if (opts.prefix) {
    prefixModule.setPrefixFiles(opts.prefix.split(',').map((path) => path.trim()));
  } else if (opts.ignoreUserConfig) {
    prefixModule.setPrefixFiles([`${__dirname}/../etc/prefix`]);
  } else if (opts.ignoreLocalPrefix) {
  } else {
    prefixModule.setPrefixFiles([`${__dirname}/../etc/prefix`, `${userConfigDir}/prefix`]);
  }

  let aliasFiles = [`${__dirname}/../etc/alias`];
  if (!opts.ignoreUserConfig) {
    aliasFiles.push(`${userConfigDir}/alias`);
  }
  alias.setAliasFiles(aliasFiles);
};
