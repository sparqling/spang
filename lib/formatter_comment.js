var Comments;
var lines;
var currentIndent;
var prevOrigLine;

indentUnit = "    ";

increaseIndent = (depth = 1) => {
  currentIndent += indentUnit.repeat(depth);
};

decreaseIndent = (depth = 1) => {
  currentIndent = currentIndent.substr(0, currentIndent.length - indentUnit.length * depth);
};

debugPrint = (object) => {
  console.log(JSON.stringify(object, undefined, 2));
};

exports.format = (parsedQuery) => {
  Comments = parsedQuery.commentsList;
  lines = [];
  currentIndent = '';
  prevOrigLine = 0;

  if (parsedQuery.header) {
    addToken(parsedQuery.header);
  }
  forPrologue(parsedQuery.prologue);
  forBody(parsedQuery.body);
  forInlineData(parsedQuery.inlineData);
  if (Comments.length > 0) {
    addToken('', -1, true);
  }

  return lines.join('\n');
};

addToken = (text, origLine, forceLineBreak = false, addSpace = true) => {
  // add comment
  var commentAdded = false;
  while(Comments.length > 0 && prevOrigLine != origLine && (origLine == -1 || origLine > Comments[0].line)) {
    if (lines.length == 0) {
      lines.unshift(Comments[0].text);
    } else if(origLine > prevOrigLine + 1 && prevOrigLine != Comments[0].line) {
      lines.push(Comments[0].text);
    } else {
      lines[lines.length - 1] += ' ' + Comments[0].text;
    }
    Comments.shift();
    commentAdded = true;
  }

  // add text
  if (commentAdded) {
    lines.push(currentIndent);    
  } else {
    if(lines.length == 0 || forceLineBreak) {
      lines.push(currentIndent);
    } else if (addSpace){
      lines[lines.length - 1] += ' ';
    }
  }
  lines[lines.length - 1] += text;

  if (prevOrigLine < origLine) {
    prevOrigLine = origLine;
  }
};

/** @return string */
forPrologue = (prologue) => {
  // TODO: handle base
  prologue.prefixes.forEach((prefix) => {
    addToken(`PREFIX ${prefix.prefix||""}: <${prefix.local}>`, prefix.location.end.line, true);
  });
  if(prologue.prefixes.length > 0) {
    addToken("", prologue.prefixes[prologue.prefixes.length - 1].location.end.line + 1, true);
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
  addToken(select_line + select.projection.map((proj) => forProjection(proj)).join(' '), lastLine, true);
  addToken('WHERE {', lastLine + 1, true);
  currentIndent += indentUnit;
  forPattern(select.pattern);
  decreaseIndent();
  addToken('}', select.pattern.location.end.line, true);
  if (select.order) {
    addToken('ORDER BY ' + forOrder(select.order), select.pattern.location.end.line, true);
  }
  if(select.limit) {
    addToken(`LIMIT ${select.limit}`, select.location.end.line, true);
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
  switch(pattern.token) {
    case 'groupgraphpattern':
      pattern.patterns.forEach(forPattern);
      pattern.filters.forEach(forFilter);
      break;
    case 'optionalgraphpattern':
      addToken('OPTIONAL {', pattern.location.start.line, true);
      increaseIndent();
      forPattern(pattern.value);
      decreaseIndent();
      addToken('}', pattern.location.end.line, true);
      break;
    case 'basicgraphpattern':
      forBasicPattern(pattern);
      break;
  }
};

/** @return list of lines */
forBasicPattern = (pattern) => {
  pattern.triplesContext.forEach(forTriple);
};

forFilter = (filter) => {
  addToken('FILTER (', filter.location.start.line, true);
  increaseIndent();
  forConstraint(filter.value);
  decreaseIndent();
  addToken(')', filter.location.end.line, false, false);
}

forConstraint = (constraint) => {
  switch(constraint.expressionType) {
    case 'relationalexpression':
      forExpression(constraint.op1);
      addToken(constraint.operator + ' ', -1, false);
      forExpression(constraint.op2);
      break;
  }
};

forExpression = (expression) => {
  switch(expression.expressionType) {
    case 'builtincall':
      addToken(expression.builtincall + '(', -1, false, false);
      increaseIndent();
      var first = true;
      expression.args.forEach((arg) => {
        if (!first) {
          addToken(',', -1, false, false);
        }
        forExpression(arg);
        first = false;
      });
      decreaseIndent();
      addToken(')', -1, false, false);
      break;
    case 'atomic':
      addToken(forTripleElem(expression.value), expression.value.location.start.line, false, false);
      break;
    case 'irireforfunction':
      addToken(forTripleElem(expression.iriref), expression.iriref.location.start.line, false, false);
      break;
  }
};

/** @return string */
forTriple = (triple) => {
  addToken(forTripleElem(triple.subject), triple.subject.location.start.line, true);
  increaseIndent();
  addToken(forTripleElem(triple.predicate), triple.predicate.location.start.line);
  increaseIndent();
  addToken(forTripleElem(triple.object), triple.object.location.start.line);
  // TODO
  addToken('.', triple.object.location.end.line);
  decreaseIndent(2);
};

/** @return string */
forTripleElem = (elem) => {
  switch(elem.token) {
    case 'var':
      return elem.prefix + elem.value;
    case 'uri':
      if (elem.prefix && elem.suffix) {
        return elem.prefix + ':' + elem.suffix;
      } else if (elem.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type') {
        return 'a';
      } else {
        return `<${elem.value}>`;
      }
    case 'literal':
      var txt = '"' + elem.value + '"';
      if (elem.lang) {
        txt += '@' + elem.lang;
      }
      return txt;
    case 'blank':
      return '[]';
    case 'path':
      return elem.value.map(v => forTripleElem(v.value)).join('/');
  }
};
