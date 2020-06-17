const metadataModule = require('./metadata.js');
const prefixModule = require('./prefix.js');
const retrieveUndefinedPrefixes = prefixModule.retrieveUndefinedPrefixes;
const searchPrefix = prefixModule.searchPrefix;
const embedParameter = require('./embed_parameter.js');
const expandFunction = require('./expand_function.js');
const fs = require('fs');

exports.constructSparql = (sparqlTemplate, parameterMap, input='') => {
  // get metadata
  var metadata = metadataModule.retrieveMetadata(sparqlTemplate);
  if (metadata.prefix) {
    if (/^(http|https):\/\//.test(metadata.prefix))
      prefixModule.loadPrefixFileByURL(metadata.prefix);
    else
      prefixModule.loadPrefixFile(metadata.prefix);
  }
  if (metadata.param) {
    parameterMap = { ...metadata.param, ...parameterMap };
  }

  // get input, or use metadata by default
  if (input) {
    parameterMap['INPUT'] = input.split("\n").
      filter(line => line.length > 0).
      map(line => '(' + line + ')').
      join(' ');
  } else if (metadata.input) {
    parameterMap['INPUT'] = '(' + metadata.input.join(' ') + ')';
  }

  // embed parameter
  sparqlTemplate = embedParameter.embedParameter(sparqlTemplate, parameterMap);

  sparqlTemplate = expandFunction(sparqlTemplate);

  // add prefix declarations
  prefixes = retrieveUndefinedPrefixes(sparqlTemplate);
  if(prefixes.length > 0)
    sparqlTemplate = prefixes.map(pre => searchPrefix(pre)).join("\n") + "\n" + sparqlTemplate;
   

  return [sparqlTemplate, metadata];
}

