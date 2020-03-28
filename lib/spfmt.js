parser = require('./parser.js');
formatter = require('./formatter.js');

exports.reformat = (sparql, indentDepth = 2, debug = false) => {
  var syntaxTree = new parser.parse(sparql);
  if (debug) {
    return(JSON.stringify(syntaxTree, undefined, 2));
  } else {
    return formatter.format(syntaxTree, indentDepth, debug);
  }
};
