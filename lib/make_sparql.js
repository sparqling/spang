const prefixModule = require('./prefix.js');
const insertUndefinedPrefixes = prefixModule.insertUndefinedPrefixes;
const embedParameter = require('./embed_parameter.js');
const expandFunction = require('./expand_function.js');

const mustache = require('mustache');
let mustacheErrors = [];

exports.makeSparql = (sparqlTemplate, metadata, parameterMap, positionalArguments, input = '') => {
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
  sparqlTemplate = embedParameter.embedParameter(sparqlTemplate, parameterMap);

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

  sparqlTemplate = mustache.render(sparqlTemplate, parameterMap, {});              // replace parameters like {{par}}
  sparqlTemplate = mustache.render(sparqlTemplate, parameterMap, {}, ['${', '}']); // replace parameters like ${par}
  if (mustacheErrors.length > 0) {
    console.error(util.makeRed("Unknown parameters found: " + mustacheErrors.join(", ")));
  }

  return sparqlTemplate;
};

exports.makePortable = (sparqlTemplate, dbMap) => {
  let portableSparql = '';
  sparqlTemplate.trim().split('\n').forEach((line) => {
      let tmpLine = line;
      let portableLine = null;
      if (tmpLine.startsWith('#')) {
        tmpLine = tmpLine.substring(1).trim();
        const matched = tmpLine.match(/^@(\w+)\s+(.+)$/);
        if (matched) {
          const dataName = matched[1];
          if (dataName == 'endpoint' && dbMap[matched[2]]) {
            portableLine = `# @endpoint ${dbMap[matched[2]].url}`;
          }
        }
      }
      if (portableLine) {
        portableSparql += portableLine + '\n';
      } else {
        portableSparql += line + '\n';
      }
    });

  // portableSparql = insertUndefinedPrefixes(portableSparql);

  // portableSparql = expandFunction(portableSparql);

  return portableSparql;
};
