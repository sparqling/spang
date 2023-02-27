spfmt = (sparql, indentDepth = 2) => {
  const parser = require('../lib/parser.js');
  const formatter = require('../lib/formatter.js');
  return formatter.format(parser.parse(sparql), indentDepth);
};
