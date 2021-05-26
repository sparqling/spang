const searchPrefix = require('./prefix.js').searchPrefix;

formatArgument = (argument) => {
  const urlMatched = argument.match(/^<?(\w+:\/\/[^>]+)>?$/);
  if (urlMatched) {
    return `<${urlMatched[1]}>`;
  } else if (argument.match(/\w+:/)) {
      return argument;
  } else {
    return `"${argument}"`;
  }
};

exports.shortcut = (opts) => {
  let prefixes = [], selectVarNames = [], triplePattern = [];
  [['s', opts.subject], ['p', opts.predicate], ['o', opts.object]].forEach(([varName, arg]) => {
    if (!arg) {
      selectVarNames.push(`?${varName}`);
      triplePattern.push(`?${varName}`);
    } else if (varName === 'p' && arg === 'a') {
      triplePattern.push('a');
    } else {
      const prefixMatched = arg.match(/\w+(?=:)/g);
      if (prefixMatched) {
        prefixes.push(Array.from(new Set(prefixMatched)));
      }
      triplePattern.push(formatArgument(arg));
    }
  });

  let sparqlTemplate = prefixes.map((pre) => searchPrefix(pre)).join('\n');
  if (sparqlTemplate) {
    sparqlTemplate += '\n';
  }
  if (opts.graph) {
    sparqlTemplate += `SELECT ?graph\nWHERE {\n    GRAPH ?graph {\n        ${triplePattern.join(' ')}\n    }\n}\nGROUP BY ?grpah\nORDER BY ?graph`;
  } else {
    const fromPart = opts.from ? `\nFROM ${formatArgument(opts.from)}` : '';
    if (opts.number) {
      sparqlTemplate += `SELECT COUNT(*)${fromPart}\nWHERE {\n    ${triplePattern.join(' ')}\n}`;
    } else {
      sparqlTemplate += `SELECT ${selectVarNames.join(' ')}${fromPart}\nWHERE {\n    ${triplePattern.join(' ')}\n}`;
    }
    if (opts.limit) {
      sparqlTemplate += `\nLIMIT ${opts.limit}`;
    }
  }
  sparqlTemplate += `\n`;

  return sparqlTemplate;
};
