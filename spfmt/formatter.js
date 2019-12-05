debugPrint = (object) => {
  console.log(JSON.stringify(object, undefined, 2));
};

var Comments;

exports.format = (parsedQuery) => {
  Comments = parsedQuery.comments;
  var query = '';
  query += forPrologue(parsedQuery.prologue);
  query += forBody(parsedQuery.body).join("\n");
  query += forInlineData(parsedQuery.inlineData).join("\n");
  return query + "\n";
};

indent = "    ";
typeUri = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

/** @return string */
forPrologue = (prologue) => {
  // TODO: handle base
  var text = prologue.prefixes.map((prefix) => `PREFIX ${prefix.prefix}: <${prefix.local}>`).join("\n");
  if(text != "") text += "\n\n";
  return text;
};

/** @return list of lines */
forInlineData = (inline) => {
  // TODO
  return [''];
};

/** @return list of lines */
forBody = (body) => {
  switch(body.kind) {
    case 'select':
    return forSelect(body);
  }
};

/** @return list of lines */
forSelect = (select) => {
  // TODO: handle dataset
  var lines = [];
  var select_line = 'SELECT ';
  if(select.modifier) select_line += `${select.modifier.toString()} `;
  lines.push(select_line + select.projection.map((proj) => forProjection(proj)).join(' '));
  lines.push('WHERE {');
  lines.push(forPattern(select.pattern).map((pat) => indent + pat).join("\n"));
  lines.push('}');
  if(select.limit) {
    lines.push(`LIMIT ${select.limit}`);
  }
  return lines;
};

/** @return string */
forProjection = (projection) => {
  switch(projection.kind) {
    case '*':
    return '*';
    case 'var':
    return '?' + projection.value.value;
    case 'aliased':
    // TODO:
    default:
    throw new Error('unknown projection.kind: ' + projection.kind);
  }
};

/** @return list of lines */
forPattern = (pattern) => {
  return pattern.patterns.map(forBasicPattern).flat();
};

/** @return list of lines */
forBasicPattern = (pattern) => {
  return pattern.triplesContext.map(forTriple);
};

/** @return string */
forTriple = (triple) => {
  var result = forTripleElem(triple.subject) + ' ' + 
    forTripleElem(triple.predicate) + ' ' + 
      forTripleElem(triple.object) + ' .';
  if(triple.object.location.end.offset < parseInt(Object.keys(Comments)[0])) {
    result += ' ' + Comments[Object.keys(Comments)[0]].text;
  }
  return result;
};

/** @return string */
forTripleElem = (elem) => {
  switch(elem.token) {
  case 'var':
    return '?' + elem.value;
  case 'uri':
    if(elem.prefix && elem.suffix) return elem.prefix + ":" + elem.suffix;
    else if(elem.value == typeUri) return 'a';
    else return elem.value;
  case 'literal':
    var txt = '"' + elem.value + '"';
    if(elem.lang) txt += '@' + elem.lang;
    return txt;
  case 'blank':
    return '[]';
  }
};
