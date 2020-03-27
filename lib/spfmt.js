parser = require('./parser.js');
formatter = require('./formatter.js');

exports.reformat = (sparql, indentDepth = 2) => {
  var parsedQuery = new parser.parse(sparql);
  return formatter.format(parsedQuery, indentDepth);
};
