const searchPrefix = require('./prefix.js').searchPrefix;

formatArgument = (argument) => {
  const urlMatched = argument.match(/^<?(\w+:\/\/[^>]+)>?$/);
  if(urlMatched) {
    return `<${urlMatched[1]}>`;
  } else {
    const prefixMatched = argument.match(/^(\w+):\w+$/);
    if(prefixMatched) {
      return argument;
    } else {
      return `"${argument}"`;
    }
  }
};

exports.shortcut = (options, prefixMap) => {
  var select_target = [], prefixes = [], pattern = [];
  [[options.S, 's'], [options.P, 'p'], [options.O, 'o']].forEach( (pair) => {
    var arg = pair[0];
    var placeHolder = pair[1];
    if(arg) {
      pattern.push(formatArgument(arg));
      const prefixMatched = arg.match(/^(\w+):\w+$/);
      if(prefixMatched) {
          prefixes.push(prefixMatched[1]);
      }
    } else {
      select_target.push('?' + placeHolder);
      pattern.push('?' + placeHolder);
    }
  });
  var sparqlTemplate = "";
  if(prefixes.length > 0) sparqlTemplate += prefixes.map(pre => searchPrefix(pre)).join("\n") + "\n";
  if(options.G) {
    sparqlTemplate += `SELECT ?graph\nWHERE {\n    GRAPH ?graph {\n        ${pattern.join(' ')}\n    }\n}\nGROUP BY ?grpah\nORDER BY ?graph`;
  } else {
    const fromPart = options.F ? `\nFROM ${formatArgument(options.F)}` : '';
    if(options.N) {
      sparqlTemplate += `SELECT COUNT(*)${fromPart}\nWHERE {\n    ${pattern.join(' ')}\n}`;
    } else {
      sparqlTemplate += `SELECT ${select_target.join(' ')}${fromPart}\nWHERE {\n    ${pattern.join(' ')}\n}`;
    }
    if(options.L) {
      sparqlTemplate += `\nLIMIT ${options.L}`;
    }
  }
  sparqlTemplate += `\n`;

  return sparqlTemplate;
};
