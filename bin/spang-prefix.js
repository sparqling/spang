#!/usr/bin/env node
const program = require('commander');
const fs = require('fs');
const prefixModule = require('../lib/prefix.js');
const metadataModule = require('../lib/metadata.js');
const embedParameter = require('../lib/embed_parameter.js');

let opts = program
  .version(require("../package.json").version)
  .arguments('<ARG>')
  .parse(process.argv)
  .opts();

let sparql;
if (program.args[0]) {
  sparql = fs.readFileSync(program.args[0], "utf8").toString();
} else {
  program.help();
  exit(1);
}

const metadata = metadataModule.retrieveMetadata(sparql);
let parameterMap;
if (metadata.param) {
  parameterMap = { ...Object.fromEntries(metadata.param.entries()), ...parameterMap };
}
sparql = embedParameter.embedParameter(sparql, parameterMap, false);

console.log(prefixModule.extractPrefixesAll(sparql));
