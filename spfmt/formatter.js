debugPrint = (object) => {
  console.log(JSON.stringify(object, undefined, 2));
};

exports.format = (parsedQuery) => {
  var query = '';
  query += forBody(parsedQuery.body).join("\n");
  query += forInlineData(parsedQuery.inlineData).join("\n");
  return query;
};

indent = "    ";

forInlineData = (inline) => {
  // TODO
  return [''];
};

forBody = (body) => {
  switch(body.kind) {
    case 'select':
    return forSelect(body);
  }
};

forSelect = (select) => {
  // TODO: handle dataset
  var lines = [];
  lines.push('SELECT ' + select.projection.map((proj) => forProjection(proj)).join(' '));
  // TODO: handle modifier
  lines.push('WHERE {');
  lines.push(forPattern(select.pattern).map((pat) => indent + pat).join("\n"));
  lines.push('}');
  return lines;
};

forProjection = (projection) => {
  switch(projection.kind) {
    case '*':
    return '*';
    case 'var':
    return '?' + projection.value;
    case 'aliased':
    // TODO:
    default:
    throw new Error('unknown projection.kind: ' + projection.kind);
  }
};

forPattern = (pattern) => {
  return pattern.patterns.map(forBasicPattern).flat();
};

forBasicPattern = (pattern) => {
  return pattern.triplesContext.map(forTriple);
};

forTriple = (triple) => {
  return forTripleElem(triple.subject) + ' ' + 
    forTripleElem(triple.predicate) + ' ' + 
    forTripleElem(triple.object) + ' .';
};


forTripleElem = (elem) => {
  switch(elem.token) {
    case 'var':
    return '?' + elem.value;
    case 'uri':
    // TODO: handle uri without prefix
    return elem.prefix + ":" + elem.suffix;
    case 'literal':
    var txt = '"' + elem.value + '"';
    if(elem.lang) txt += '@' + elem.lang;
    return txt;
  }
};
