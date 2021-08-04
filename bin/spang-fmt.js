#!/usr/bin/env node

const fs = require('fs');
const program = require('commander');

const version = require('../package.json').version;
const parser = require('../lib/template_parser');
const formatter = require('../lib/formatter.js');

let opts = program
  .option('-i, --indent <DEPTH>', "indent depth", 2)
  .option('-d, --debug', 'debug')
  .option('-j, --json', 'output JSON')
  .version(version)
  .arguments('[SPARQL]')
  .parse(process.argv)
  .opts();

let sparqlQuery;
if (program.args[0]) {
  sparqlQuery = fs.readFileSync(program.args[0], "utf8").toString();
} else if (process.stdin.isTTY) {
  program.help();
  exit(1);
} else {
  sparqlQuery = fs.readFileSync(process.stdin.fd).toString();
}

const syntaxTree = parser.parse(sparqlQuery);

if (opts.debug) {
  console.log(JSON.stringify(syntaxTree, undefined, 2));
} else if (opts.json) {
  console.log(JSON.stringify(syntaxTree, selector, 2));
} else {
  console.log(formatter.format(syntaxTree, program.indent));
}

function selector(key, value) {
  if (key !== 'location') {
    return value;
  }
}
