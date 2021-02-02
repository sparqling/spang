const parser = require('./template_parser');
formatter = require('./formatter.js');

exports.reformat = (sparql, indentDepth = 2) => {
  const syntaxTree = parser.parse(sparql);
  return formatter.format(syntaxTree, indentDepth);
};
