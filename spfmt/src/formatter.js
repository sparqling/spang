debugPrint = (object) => {
  console.log(JSON.stringify(object, undefined, 2));
};

var Comments;
var lines;
var currentIndent;

exports.format = (parsedQuery) => {
  Comments = parsedQuery.comments;
  lines = [];
  currentIndent = '';
  forPrologue(parsedQuery.prologue);
  forBody(parsedQuery.body);
  forInlineData(parsedQuery.inlineData);
  handleComment();
  return lines.join('\n') + '\n';
};

indentUnit = "    ";
typeUri = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

handleComment = (node) => {
  console.log(Comments);
  console.log(node);
  if(Comments.length > 0 &&
     (!node || node.location.end.offset > Comments[0].location)) {
    if(lines.length < 2) lines.unshift(Comments[0].text);
    else lines[lines.length - 2] += ' ' + Comments[0].text;
    Comments.shift();
  }
}

addLine = (text) => {
  lines.push(currentIndent + text);
}

/** @return string */
forPrologue = (prologue) => {
  // TODO: handle base
  prologue.prefixes.forEach((prefix) => {
    addLine(`PREFIX ${prefix.prefix}: <${prefix.local}>`);
    handleComment(prefix);
  });
  if(lines.length > 0) addLine("");
};

/** @return list of lines */
forInlineData = (inline) => {
  // TODO
};

/** @return list of lines */
forBody = (body) => {
  switch(body.kind) {
    case 'select':
    forSelect(body);
  }
};

/** @return list of lines */
forSelect = (select) => {
  // TODO: handle dataset
  var select_line = 'SELECT ';
  if(select.modifier) select_line += `${select.modifier.toString()} `;
  addLine(select_line + select.projection.map((proj) => forProjection(proj)).join(' '));
  addLine('WHERE {');
  currentIndent += indentUnit;
  forPattern(select.pattern);
  currentIndent = currentIndent.substr(0, currentIndent.Length - indentUnit.Length);
  addLine('}');
  if(select.limit) {
    addLine(`LIMIT ${select.limit}`);
  }
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
  pattern.patterns.forEach(forBasicPattern);
};

/** @return list of lines */
forBasicPattern = (pattern) => {
  pattern.triplesContext.forEach(forTriple);
};

/** @return string */
forTriple = (triple) => {
  addLine(forTripleElem(triple.subject) + ' ' + 
    forTripleElem(triple.predicate) + ' ' + 
      forTripleElem(triple.object) + ' .');
  handleComment(triple.object);
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
