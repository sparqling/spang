parser = require('./parser.js');
formatter = require('./formatter.js');

exports.reformat = (sparql, indentDepth = 2, debug = false) => {
  var parsedQuery = new parser.parse(sparql);
  if (debug) {
    return(JSON.stringify(parsedQuery, undefined, 2));
  } else {
    return formatter.format(parsedQuery, indentDepth, debug);
  }
};
