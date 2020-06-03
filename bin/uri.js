#!/usr/bin/env node

var commander = require('commander')
    .version(require("../package.json").version)
    .arguments('<URI>');

if (commander.args) {
  console.log(commander.args[0]);
} else {
  commander.parse(process.argv);
}

// request = require('request')

// request.get(commander.args[0]);
