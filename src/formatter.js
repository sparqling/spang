debugPrint = (object) => {
  console.log(JSON.stringify(object, undefined, 2));
};

var Comments;
var lines;
var currentIndent;
var prevOrigLine;

exports.format = (parsedQuery) => {
  Comments = parsedQuery.comments;
  lines = [];
  currentIndent = '';
  prevOrigLine = 0;
  forPrologue(parsedQuery.prologue);
  forBody(parsedQuery.body);
  forInlineData(parsedQuery.inlineData);
  // addLine('', -1);
  return lines.join('\n');
};

indentUnit = "    ";
typeUri = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

addLine = (text, origLine = 0) => {
  if(Comments.length > 0 &&
     prevOrigLine != origLine && 
     (origLine == -1 || origLine > Comments[0].line)) {
    if(lines.length == 0) lines.unshift(Comments[0].text);
    else if(origLine > prevOrigLine + 1) {
      // for line where only comment exists
      lines.push(Comments[0].text);
    }
    else lines[lines.length - 1] += ' ' + Comments[0].text;
    Comments.shift();
  }
  lines.push(currentIndent + text);
  if(prevOrigLine < origLine) prevOrigLine = origLine;
}

/** @return string */
forPrologue = (prologue) => {
  // TODO: handle base
  prologue.prefixes.forEach((prefix) => {
    addLine(`PREFIX ${prefix.prefix||""}: <${prefix.local}>`, prefix.location.end.line);
  });
  if(prologue.prefixes.length > 0) {
    addLine("", prologue.prefixes[prologue.prefixes.length - 1].location.end.line + 1);
  }
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
  var lastLine = !select.projection[0].value ? select.projection[0].location.start.line : select.projection[0].value.location.start.line;
  addLine(select_line + select.projection.map((proj) => forProjection(proj)).join(' '), lastLine);
  addLine('WHERE {', lastLine + 1);
  currentIndent += indentUnit;
  forPattern(select.pattern);
  currentIndent = currentIndent.substr(0, currentIndent.Length - indentUnit.Length);
  addLine('}', select.pattern.location.end.line);
  if (select.order) {
    addLine('ORDER BY ' + forOrder(select.order)); 
  }
  if(select.limit) {
    addLine(`LIMIT ${select.limit}`, select.location.end.line);
  }
};

forOrder = (conditions) => {
  var orderConditions = [];
  conditions.forEach(condition => {
    var oc = forTripleElem(condition.expression.value);
    if (condition.direction == 'DESC') {
      orderConditions.push(`DESC(${oc})`);
    } else {
      orderConditions.push(oc);
    }
  });
  return orderConditions.join(" ");
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
  pattern.filters.forEach(forFilter);
};

/** @return list of lines */
forBasicPattern = (pattern) => {
  pattern.triplesContext.forEach(forTriple);
};

/** @return string */
forTriple = (triple) => {
  addLine(forTripleElem(triple.subject) + ' ' + 
    forTripleElem(triple.predicate) + ' ' + 
      forTripleElem(triple.object) + ' .', triple.object.location.end.line);
};

/** @return string */
forTripleElem = (elem) => {
  switch(elem.token) {
    case 'var':
      return '?' + elem.value;
    case 'uri':
      if(elem.prefix && elem.suffix) return elem.prefix + ":" + elem.suffix;
      else if(elem.value == typeUri) return 'a';
      else return "<" + elem.value + ">";
    case 'literal':
      var txt = '"' + elem.value + '"';
      if(elem.lang) txt += '@' + elem.lang;
      return txt;
    case 'blank':
      return '[]';
    case 'path':
      return forTripleElem(elem.value[0].value) + '/' + forTripleElem(elem.value[1].value); // TODO: path
    default:
      return elem.token; // for debug
  }
};

forFilter = (filter) => {
  // TODO: other expressionType
  if (filter.value.expressionType == "relationalexpression") {
    var e = filter.value;
    addLine(`FILTER (${forExpression(e.op1)} ${e.operator} ${forExpression(e.op2)})`);
  }
}

forExpression = (e) => {
  // TODO: other expressionType
  if (e.expressionType == "atomic") {
    return(forTripleElem(e.value));
  } else if (e.expressionType == "irireforfunction") {
    return(forTripleElem(e.iriref));
  }
}
