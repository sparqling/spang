const fs = require('fs');
// const embedParameter = require('./embed_parameter.js');

exports.constructCypher = (queryTemplate, metadata, parameterMap, positionalArguments, input='') => {
  
  if (metadata.param) {
    parameterMap = { ...Object.fromEntries(metadata.param.entries()), ...parameterMap };
    let i = 0;
    for(let param of metadata.param.keys()) {
      if(i >= positionalArguments.length) break;
      parameterMap[param] = positionalArguments[i++];
    }
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
  // queryTemplate = embedParameter.embedParameter(queryTemplate, parameterMap);

  // remove trailing newlines
  // queryTemplate = queryTemplate.replace(/\n{2,}$/g, '\n');

  let cypher = '';
  queryTemplate.split('\n').forEach((line) => {
    if (! line.match(/^\s*(#|\/\/)/)) {
      cypher += ' ' + line;
    }
  });
  
  let json = '{\n';
  json += '  "statements": [\n';
  json += `    { "statement": "${cypher.trim()}" }\n`;
  json += '  ]\n'
  json += '}\n'
  return json;
}
