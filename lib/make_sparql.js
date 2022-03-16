const prefixModule = require('./prefix.js');
const insertUndefinedPrefixes = prefixModule.insertUndefinedPrefixes;
const embedParameter = require('./embed_parameter.js');
const expandFunction = require('./expand_function.js');

const mustache = require('mustache');
let mustacheErrors = [];

exports.makeSparql = (sparqlTemplate, metadata, parameterMap, positionalArguments, setVars, input = '') => {
  if (metadata.prefix) {
    prefixModule.loadPrefixFile(metadata.prefix);
  }
  if (metadata.param) {
    parameterMap = { ...Object.fromEntries(metadata.param.entries()), ...parameterMap };
    let i = 0;
    for (let param of metadata.param.keys()) {
      if (i >= positionalArguments.length) break;
      parameterMap[param] = positionalArguments[i++];
    }
  }

  // get input, or use metadata by default
  if (input) {
    parameterMap['INPUT'] = input.split('\n')
      .filter((line) => line.length > 0)
      .map((line) => '(' + line + ')')
      .join(' ');
  } else if (metadata.input) {
    parameterMap['INPUT'] = metadata.input.join(' ');
  }

  // embed parameter
  sparqlTemplate = embedParameter.embedParameter(sparqlTemplate, parameterMap, setVars);

  sparqlTemplate = expandFunction(sparqlTemplate);

  // add prefix declarations
  sparqlTemplate = insertUndefinedPrefixes(sparqlTemplate);

  // remove trailing newlines
  sparqlTemplate = sparqlTemplate.replace(/\n{2,}$/g, '\n');

  return sparqlTemplate;
};

exports.expandTemplate = (sparqlTemplate, metadata, parameterMap, positionalArguments, input = '') => {
  if (metadata.prefix) {
    prefixModule.loadPrefixFile(metadata.prefix);
  }
  if (metadata.param) {
    parameterMap = { ...Object.fromEntries(metadata.param.entries()), ...parameterMap };
    let i = 0;
    for (let param of metadata.param.keys()) {
      if (i >= positionalArguments.length) break;
      parameterMap[param] = positionalArguments[i++];
    }
  }

  // get input, or use metadata by default
  if (input) {
    parameterMap['INPUT'] = input.split('\n')
      .filter((line) => line.length > 0)
      .map((line) => '(' + line + ')')
      .join(' ');
  } else if (metadata.input) {
    parameterMap['INPUT'] = metadata.input.join(' ');
  }

  sparqlTemplate = mustache.render(sparqlTemplate, parameterMap, {}); // replace parameters {{par}}
  sparqlTemplate = mustache.render(sparqlTemplate, parameterMap, {}, ['${', '}']); // replace parameters ${par}
  if (mustacheErrors.length > 0) {
    console.error(util.makeRed('Unknown parameters found: ' + mustacheErrors.join(', ')));
  }

  return sparqlTemplate;
};

exports.makePortable = (sparqlTemplate, dbMap) => {
  return sparqlTemplate.trim().split('\n').map((line) => {
    if (line.startsWith('#')) {
      const matched = line.substring(1).trim()
            .match(/^@(\w+)\s+(.+)$/);
      if (matched && matched[1] === 'endpoint' && dbMap[matched[2]]) {
        return `# @endpoint ${dbMap[matched[2]].url}`;
      }
    }
    return line;
  }).join('\n');
};
