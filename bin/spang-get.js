#!/usr/bin/env node
const program = require('commander');
const axios = require('axios');
const prefixModule = require('../lib/prefix.js');
const initializeConfig = require('../lib/config.js').initialize;
const alias = require('../lib/alias.js');

let opts = program
  .option('-r, --prefix <PREFIX_FILES>', 'read prefix declarations (default: SPANG_DIR/etc/prefix,~/.spang/prefix)')
  .option('-n, --ignore-user-config', 'ignore user configuration for test purpose')
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
  if (opts.quit) {
    console.log(uri);
    process.exit(0);
  } else {
    axios.get(uri)
      .then(res => {
        console.log(res.data);
      })
      .catch(err => {
        console.error(`cannot open ${uri}`);
        process.exit(1);
      });
  }
}
