#!/usr/bin/env node

const syncRequest = require('sync-request');

const program = require('commander')
      .version(require("../package.json").version)
      .arguments('<URI>')
      .parse(process.argv);

if (program.args.length == 0) {
  program.help();
}

const text = syncRequest('GET', program.args[0]).getBody('utf8');

console.log(text);
