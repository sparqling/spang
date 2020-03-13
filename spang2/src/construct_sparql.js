const metadataModule = require('./metadata.js');
const prefixModule = require('./prefix.js');
const retrievePrefixes = prefixModule.retrievePrefixes;
const searchPrefix = prefixModule.searchPrefix;
const embed_parameter = require('./embed_parameter.js');
const fs = require('fs');

const input = process.stdin.isTTY ? "" : fs.readFileSync(process.stdin.fd, "utf8");

exports.constructSparql = (sparqlTemplate, parameterMap) =>
{
  var metadata = metadataModule.retrieveMetadata(sparqlTemplate);
  if(metadata.prefix) {
    if(/^(http|https):\/\//.test(metadata.prefix))
      prefixModule.loadPrefixFileByURL(metadata.prefix);
    else
      prefixModule.loadPrefixFile(metadata.prefix);
  }
  if(metadata.param) parameterMap = { ...metadata.param, ...parameterMap };
  if(input) {
    parameterMap['INPUT'] = input.split("\n").filter(line => line.length > 0).map(line => '(' + line + ')').join(' ');
  }
  else if(metadata.input) {
    parameterMap['INPUT'] = '(' + metadata.input.join(' ') + ')';
  }
  sparqlTemplate = embed_parameter.embedParameter(sparqlTemplate, parameterMap);
  prefixes = retrievePrefixes(sparqlTemplate);
  sparqlTemplate = prefixes.map(pre => searchPrefix(pre)).join("\n") + "\n" + sparqlTemplate;
  return [sparqlTemplate, metadata];
}

