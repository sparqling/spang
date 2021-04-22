const searchPrefix = require('./prefix.js').searchPrefix;

formatArgument = (argument) => {
  const urlMatched = argument.match(/^<?(\w+:\/\/[^>]+)>?$/);
  if (urlMatched) {
    return `<${urlMatched[1]}>`;
  } else if (argument.match(/^\w+:[\w\.]+$/)) {
      return argument;
  } else {
    return `"${argument}"`;
  }
};

exports.shortcut = (options) => {
  let prefixes = [], selectVarNames = [], triplePattern = [];
  [['s', options.S], ['p', options.P], ['o', options.O]].forEach(([varName, arg]) => {
    if (!arg) {
      selectVarNames.push(`?${varName}`);
      triplePattern.push(`?${varName}`);
    } else if (varName === 'p' && arg === 'a') {
      triplePattern.push('a');
    } else {
      const prefixMatched = arg.match(/^(\w+):[\w\.]+$/);
      if (prefixMatched) {
        prefixes.push(prefixMatched[1]);
      }
      triplePattern.push(formatArgument(arg));
    }
  });

  let sparqlTemplate = '';
  if (prefixes.length > 0) {
    sparqlTemplate += prefixes.map((pre) => searchPrefix(pre)).join('\n') + '\n';
  }
  if (options.G) {
    sparqlTemplate += `SELECT ?graph\nWHERE {\n    GRAPH ?graph {\n        ${triplePattern.join(' ')}\n    }\n}\nGROUP BY ?grpah\nORDER BY ?graph`;
  } else {
    const fromPart = options.F ? `\nFROM ${formatArgument(options.F)}` : '';
    if (options.N) {
      sparqlTemplate += `SELECT COUNT(*)${fromPart}\nWHERE {\n    ${triplePattern.join(' ')}\n}`;
    } else {
      sparqlTemplate += `SELECT ${selectVarNames.join(' ')}${fromPart}\nWHERE {\n    ${triplePattern.join(' ')}\n}`;
    }
    if (options.L) {
      sparqlTemplate += `\nLIMIT ${options.L}`;
    }
  }
  sparqlTemplate += `\n`;

  return sparqlTemplate;
};
