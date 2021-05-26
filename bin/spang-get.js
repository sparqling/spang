#!/usr/bin/env node
const program = require('commander');
const syncRequest = require('sync-request');
const prefixModule = require('../lib/prefix.js');
const initializeConfig = require('../lib/config.js').initialize;
const alias = require('../lib/alias.js');

let opts = program
  .option('-r, --prefix <PREFIX_FILES>', 'read prefix declarations (default: SPANG_DIR/etc/prefix,~/.spang/prefix)')
  .option('-n, --ignore-user-prefix', 'ignore user-specific file (~/.spang/prefix) for test purpose')
  .option('-q, --quit', 'show expanded URI and quit')
  .version(require("../package.json").version)
  .arguments('<URI>')
  .parse(process.argv)
  .opts();

if (program.args.length == 0) {
  program.help();
}

initializeConfig(opts);

const uri = prefixModule.expandPrefixedUri(alias.replaceIfAny(program.args[0]));

if (uri) {
  if (program.quit) {
    console.log(uri);
  } else {
    const text = syncRequest('GET', uri).getBody('utf8');
    console.log(text);
  }
}
