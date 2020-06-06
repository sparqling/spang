#!/usr/bin/env node

fs = require('fs');
spfmt = require('../lib/spfmt.js');

var commander = require('commander')
    .option('-i, --indent <DEPTH>', "indent depth", 2)
    .option('-d, --debug', 'debug (output AST)')
    .version(require("../package.json").version)
    .arguments('<SPARQL>');

commander.parse(process.argv);

var sparqlQuery;

if(commander.args[0]) {
  sparqlQuery = fs.readFileSync(commander.args[0], "utf8").toString();
} else if (process.stdin.isTTY) {
  commander.help();
} else {
  sparqlQuery = fs.readFileSync(process.stdin.fd).toString();
}

console.log(spfmt.reformat(sparqlQuery, commander.indent, commander.debug));
